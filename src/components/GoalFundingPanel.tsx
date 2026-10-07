import { useMemo, useState } from 'react'
import { Flag, Pencil } from 'lucide-react'
import { useFinancasStore } from '../context/financasStore'
import { useGoalFunding } from '../hooks/useGoalFunding'
import { distributeGoalIncome, goalIncomeBudget, summarizeGoalFunding } from '../lib/goalFunding'
import { addMonths } from '../lib/shared'
import { formatCurrency, formatMonthKey, inputClass } from '../lib/format'
import { repositoryRevision } from '../data/repositoryCommand'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import type { GoalSummary } from '../types'
import { CurrencyInput } from './CurrencyInput'
import { Panel, PanelHeader, PrimaryButton, SecondaryButton, StatTile } from './ui'

type Funding = ReturnType<typeof useGoalFunding>
type Group = Funding['groups'][number]

function GroupEditor({ goals, save, onClose }: { goals: GoalSummary[]; save: Funding['saveGroups']; onClose: () => void }) {
  const [draft, setDraft] = useState(goals.map((goal) => ({ goalId: goal.id, groupName: goal.groupName ?? '' })))
  const [revision] = useState(repositoryRevision)
  const [error, setError] = useState('')
  const names = [...new Set(draft.map((row) => row.groupName.trim()).filter(Boolean))]
  return <form className="mt-4 space-y-3 rounded-lg border border-dark-border bg-dark-surface p-4" onSubmit={(event) => {
    event.preventDefault()
    const result = save(draft, revision)
    if (!result.ok) { setError(result.message); return }
    onClose()
  }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <p className="text-xs text-dark-text-secondary">Use o mesmo nome nas metas da viagem, por exemplo Eurotrip 2027. O grupo soma necessidades; não cria outro saldo.</p>
    <datalist id="goal-group-names">{names.map((name) => <option key={name} value={name} />)}</datalist>
    <div className="grid grid-cols-2 gap-3">{goals.map((goal, index) => <label key={goal.id} className="block">
      <span className="app-form-label mb-1 block">Grupo de {goal.name}</span>
      <input autoFocus={index === 0} value={draft.find((row) => row.goalId === goal.id)?.groupName ?? ''} list="goal-group-names" placeholder="Ex.: Eurotrip 2027; vazio para deixar avulsa" className={inputClass} onChange={(event) => setDraft((rows) => rows.map((row) => row.goalId === goal.id ? { ...row, groupName: event.target.value } : row))} />
    </label>)}</div>
    {error && <p role="alert" className="text-xs text-rose-200">{error} Feche e abra a edição para revisar os dados atuais.</p>}
    <div className="flex gap-2"><PrimaryButton type="submit">Salvar grupos</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
  </form>
}

function AllocationDraft({ group, item, allItems, currentMonth, save, onClose }: {
  group: Group; item: ReconciledOccurrence; allItems: ReconciledOccurrence[]; currentMonth: string;
  save: Funding['saveAllocation']; onClose: () => void;
}) {
  const previous = item.event.occurrenceOverrides?.[item.originalMonth]?.goalAllocations ?? []
  const ids = new Set(group.rows.map((row) => row.goal.id))
  const others = previous.filter((row) => !ids.has(row.goalId))
  const [draft, setDraft] = useState(group.rows.map((row) => ({ goalId: row.goal.id, amount: previous.find((part) => part.goalId === row.goal.id)?.amount ?? 0 })))
  const [revision] = useState(repositoryRevision)
  const [error, setError] = useState('')
  const budget = goalIncomeBudget(item)
  const outside = others.reduce((sum, row) => sum + row.amount, 0)
  const total = draft.reduce((sum, row) => sum + row.amount, outside)
  const before = summarizeGoalFunding(group.rows.map((row) => row.goal), allItems.filter((row) => row.id !== item.id), currentMonth).flatMap((row) => row.rows)
  const tooLate = group.rows.filter((row) => row.goal.targetMonth && item.month > row.goal.targetMonth)
  const suggest = () => {
    const allocations = distributeGoalIncome(Math.max(0, budget - outside), before.map((row) => ({ goalId: row.goal.id,
      amount: row.goal.targetMonth && item.month > row.goal.targetMonth ? 0 : row.conditionalRemaining })))
    setDraft((rows) => rows.map((row) => ({ ...row, amount: allocations.find((part) => part.goalId === row.goalId)?.amount ?? 0 })))
  }
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault()
    const result = save(item.event.id, item.originalMonth, [...others, ...draft.filter((row) => row.amount > 0)], revision)
    if (!result.ok) { setError(result.message); return }
    onClose()
  }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs text-dark-text-secondary">Parte planejada para guardar: <strong>{formatCurrency(budget)}</strong> ({item.event.savedPct ?? 100}%). {outside > 0 && <span>{formatCurrency(outside)} já destinados a outras metas.</span>}</p>
      <SecondaryButton onClick={suggest}>Dividir pelo que falta</SecondaryButton>
    </div>
    <p className="text-xs text-dark-text-muted">Valores para esta ocorrência. A sugestão divide proporcionalmente ao que falta após as outras entradas destinadas, até o limite de cada meta.</p>
    <div className="grid grid-cols-2 gap-3">{group.rows.map(({ goal }) => <label className="block" key={goal.id}>
      <span className="app-form-label mb-1 block">Destinar a {goal.name}</span>
      <CurrencyInput showZero value={draft.find((row) => row.goalId === goal.id)?.amount ?? 0} onChange={(amount) => setDraft((rows) => rows.map((row) => row.goalId === goal.id ? { ...row, amount } : row))} />
    </label>)}</div>
    <p className={`text-xs ${total > budget + 0.005 ? 'text-amber-200' : 'text-dark-text-secondary'}`}>Total destinado: {formatCurrency(total)} · {total > budget + 0.005 ? 'Excede a entrada em ' + formatCurrency(total - budget) : 'Sem destinação: ' + formatCurrency(Math.max(0, budget - total))}</p>
    {tooLate.length > 0 && <p className="text-xs text-amber-200">Entrada posterior ao prazo de {tooLate.map((row) => row.goal.name).join(', ')}. Essa parte não reduz o que precisa guardar até o prazo.</p>}
    {item.paidAmount > 0 && <p className="text-xs text-dark-text-secondary">{formatCurrency(item.paidAmount)} já recebidos. Só a parte ainda prevista reduz a necessidade condicional. Confirme o dinheiro guardado nas posições em Patrimônio.</p>}
    {item.overdue && item.remainingAmount > 0 && <p className="text-xs text-amber-200">Entrada atrasada: a conta com ela continua sendo uma hipótese.</p>}
    {error && <p role="alert" className="text-xs text-rose-200">{error} Se os dados mudaram, feche e reabra a divisão.</p>}
    <div className="flex gap-2"><PrimaryButton type="submit" disabled={total > budget + 0.005}>Salvar divisão</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
  </form>
}

function IncomeEditor({ group, items, currentMonth, save, onClose }: { group: Group; items: ReconciledOccurrence[]; currentMonth: string; save: Funding['saveAllocation']; onClose: () => void }) {
  const ids = new Set(group.rows.map((row) => row.goal.id))
  const latest = group.rows.reduce((month, row) => row.goal.targetMonth && row.goal.targetMonth > month ? row.goal.targetMonth : month, currentMonth)
  const end = group.rows.some((row) => !row.goal.targetMonth) ? addMonths(currentMonth, 12) : latest
  const incomes = items.filter((item) => {
    const linked = item.event.occurrenceOverrides?.[item.originalMonth]?.goalAllocations?.some((row) => ids.has(row.goalId))
    return item.event.kind === 'income' && !item.cancelled && (linked || item.remainingAmount > 0 && item.month <= end)
  }).sort((a, b) => (a.date ?? a.month).localeCompare(b.date ?? b.month) || a.id.localeCompare(b.id))
  const [chosen, setChosen] = useState(incomes.find((item) => item.event.occurrenceOverrides?.[item.originalMonth]?.goalAllocations?.some((row) => ids.has(row.goalId)))?.id ?? incomes[0]?.id ?? '')
  const selected = incomes.find((item) => item.id === chosen)
  return <div className="mt-4 space-y-4 rounded-lg border border-dark-border bg-dark-input/40 p-4">
    <label className="block"><span className="app-form-label mb-1 block">Entrada para dividir em {group.name || 'metas avulsas'}</span>
      <select autoFocus className={inputClass} value={chosen} onChange={(event) => setChosen(event.target.value)}>
        <option value="">Escolha uma entrada</option>{incomes.map((item) => <option key={item.id} value={item.id}>{item.event.name} · {formatMonthKey(item.month)} · {formatCurrency(item.amount)}{item.paidAmount > 0 ? ' · recebido ' + formatCurrency(item.paidAmount) : ''}</option>)}
      </select>
    </label>
    {selected ? <AllocationDraft key={selected.id} group={group} item={selected} allItems={items} currentMonth={currentMonth} save={save} onClose={onClose} /> : <div className="flex items-center justify-between"><p className="text-xs text-dark-text-muted">Cadastre uma entrada antes do prazo na agenda abaixo.</p><SecondaryButton onClick={onClose}>Fechar</SecondaryButton></div>}
  </div>
}

function FundingGroup({ group, items, currentMonth, save }: { group: Group; items: ReconciledOccurrence[]; currentMonth: string; save: Funding['saveAllocation'] }) {
  const [editing, setEditing] = useState(false)
  const missingDeadline = group.rows.some((row) => !row.goal.targetMonth)
  const expiredDeadline = group.rows.some((row) => row.goal.targetMonth && row.goal.targetMonth < currentMonth)
  return <section className="rounded-xl border border-dark-border-subtle bg-dark-surface/30 p-4">
    <div className="flex items-start justify-between gap-4"><div><h4 className="text-sm font-semibold text-dark-text">{group.name || 'Metas avulsas'}</h4><p className="mt-1 text-xs text-dark-text-muted">Alvo {formatCurrency(group.target)} · {formatCurrency(group.current)} já guardados · {group.rows.length} metas</p></div><SecondaryButton onClick={() => setEditing(!editing)}><Pencil size={13} /> Destinar entradas</SecondaryButton></div>
    <div className="mt-3 grid grid-cols-3 gap-3">
      <StatTile label="Falta guardar sem as entradas" value={formatCurrency(group.remaining)} />
      <StatTile label="Entradas previstas destinadas" value={formatCurrency(group.expected)} />
      <StatTile label="Falta se as entradas ocorrerem" value={formatCurrency(group.conditionalRemaining)} />
    </div>
    <p className="mt-2 text-xs text-dark-text-secondary">Até os prazos: {formatCurrency(group.monthlyWithoutIncome)}/mês sem as entradas; {formatCurrency(group.monthlyWithIncome)}/mês se elas ocorrerem. {missingDeadline && 'Metas sem prazo ficam fora do ritmo mensal.'}</p>
    {expiredDeadline && <p className="mt-2 text-xs text-amber-200">Há metas com prazo vencido. Revise seus prazos em Patrimônio; elas ficam fora do ritmo mensal.</p>}
    {editing && <IncomeEditor group={group} items={items} currentMonth={currentMonth} save={save} onClose={() => setEditing(false)} />}
    <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-dark-text-secondary">Ver divisão por meta e origem das entradas</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-dark-text-muted"><th className="py-2 text-left font-medium">Meta / prazo</th><th className="p-2 text-right font-medium">Guardado</th><th className="p-2 text-right font-medium">Falta sem entradas</th><th className="p-2 text-right font-medium">Entradas destinadas</th><th className="p-2 text-right font-medium">Falta com entradas</th></tr></thead>
        <tbody>{group.rows.map((row) => <tr key={row.goal.id} className="border-t border-dark-border-subtle"><td className="py-3 pr-3"><p className="font-medium text-dark-text">{row.goal.name}</p><p className="mt-1 text-dark-text-muted">{row.goal.targetMonth ? formatMonthKey(row.goal.targetMonth) : 'Sem prazo'}</p>
          {row.sources.map((source) => <p key={source.item.id} className="mt-1 text-dark-text-muted">{source.item.event.name} · {formatMonthKey(source.item.month)}: {formatCurrency(source.expected)} previstos{source.received > 0 ? ' · ' + formatCurrency(source.received) + ' recebidos associados' : ''}{!source.inTime ? ' · após o prazo' : ''}{source.item.cancelled ? ' · cancelada' : ''}{source.item.overdue && source.expected > 0 ? ' · atrasada' : ''}</p>)}
          {row.expected > row.covered + 0.005 && <p className="mt-1 text-dark-text-muted">{formatCurrency(row.expected - row.covered)} acima do que falta; essa sobra não é redistribuída automaticamente.</p>}
          {row.received > 0 && <p className="mt-1 text-dark-text-secondary">Recebido só conta como guardado quando destinado à meta em Patrimônio.</p>}
        </td><td className="p-2 text-right align-top tabular-nums">{formatCurrency(row.goal.current)}</td><td className="p-2 text-right align-top tabular-nums">{formatCurrency(row.goal.remaining)}</td><td className="p-2 text-right align-top tabular-nums">{formatCurrency(row.covered)}</td><td className="p-2 text-right align-top tabular-nums">{formatCurrency(row.conditionalRemaining)}{row.monthlyWithIncome !== null && <p className="mt-1 text-dark-text-muted">{formatCurrency(row.monthlyWithIncome)}/mês</p>}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>
}

export function GoalFundingPanel() {
  const { investments, forecastAgenda, activeCycle } = useFinancasStore()
  const items = useMemo(() => forecastAgenda.flatMap((row) => row.items), [forecastAgenda])
  const funding = useGoalFunding(investments.goals, items, activeCycle.month)
  const [grouping, setGrouping] = useState(false)
  if (!funding.groups.length) return null
  return <Panel><PanelHeader title="Metas e entradas previstas" icon={<Flag size={16} />} description="Agrupe objetivos da viagem e divida cada entrada entre eles. Previsão reduz apenas a necessidade condicional; não aumenta o dinheiro guardado. Valores em reais, sem estimar câmbio ou conversão." actions={<SecondaryButton onClick={() => setGrouping(!grouping)}>Organizar grupos</SecondaryButton>} />
    {grouping && <GroupEditor goals={investments.goals.filter((goal) => !goal.archivedAt && goal.kind === 'funding')} save={funding.saveGroups} onClose={() => setGrouping(false)} />}
    <div className="mt-4 space-y-3">{funding.groups.map((group) => <FundingGroup key={group.name} group={group} items={items} currentMonth={activeCycle.month} save={funding.saveAllocation} />)}</div>
  </Panel>
}
