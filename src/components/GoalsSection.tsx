import { useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, Flag, Landmark, Layers, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { LedgerList, LedgerMoveForm } from './Ledger'
import { EmptyState, Meter, Panel, PanelHeader, PrimaryButton, SecondaryButton, SegmentedControl, Tag } from './ui'
import { formatCurrency, formatMonthKey, formatMonths, inputClass } from '../lib/format'
import { INCLUSION_LABELS } from '../lib/goals'
import { monthKey } from '../lib/shared'
import { useFinancasStore, useInvestmentsStore } from '../context/financasStore'
import type { GoalInclusion, GoalKind, GoalSummary } from '../types'

const NET_WORTH_INCLUSIONS: GoalInclusion[] = [
  { type: 'reserve' }, { type: 'investments' }, { type: 'goals' },
]

function TrackingSourcePicker({ selected, onToggle, classes, hasAssets, hasDebts }: {
  selected: GoalInclusion[]
  onToggle: (inclusion: GoalInclusion) => void
  classes: { id: string; name: string; color: string }[]
  hasAssets: boolean
  hasDebts: boolean
}) {
  const isOn = (inclusion: GoalInclusion) => selected.some(
    (item) => item.type === inclusion.type && (item.id ?? '') === (inclusion.id ?? ''),
  )
  const allInvestments = isOn({ type: 'investments' })
  const options: { inclusion: GoalInclusion; label: string; color?: string; muted?: boolean }[] = [
    { inclusion: { type: 'reserve' }, label: INCLUSION_LABELS.reserve },
    { inclusion: { type: 'investments' }, label: INCLUSION_LABELS.investments },
    { inclusion: { type: 'goals' }, label: INCLUSION_LABELS.goals },
    ...classes.map((item) => ({
      inclusion: { type: 'class' as const, id: item.id }, label: item.name,
      color: item.color, muted: allInvestments,
    })),
    ...(hasAssets ? [{ inclusion: { type: 'assets' as const }, label: INCLUSION_LABELS.assets }] : []),
    ...(hasDebts ? [{ inclusion: { type: 'debts' as const }, label: INCLUSION_LABELS.debts }] : []),
  ]

  return <div className="flex flex-wrap gap-1.5">
    {options.map(({ inclusion, label, color, muted }) => {
      const on = isOn(inclusion) && !muted
      return <button
        key={`${inclusion.type}:${inclusion.id ?? ''}`}
        type="button"
        disabled={muted}
        onClick={() => onToggle(inclusion)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${on ? 'border-primary-500/60 bg-primary-500/10 text-primary-200' : 'border-dark-border bg-dark-input text-dark-text-muted hover:text-dark-text'}`}
      >
        {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </button>
    })}
  </div>
}

function FundingSources({ goal }: { goal: GoalSummary }) {
  const { summary, goals, setGoalHoldingAllocation } = useInvestmentsStore()
  const holdings = summary.allHoldings.filter((holding) => holding.purpose !== 'emergency_fund')

  if (holdings.length === 0) {
    return <div className="rounded-lg border border-dashed border-dark-border p-3 text-xs leading-relaxed text-dark-text-muted">
      Cadastre uma posição de investimento para dizer onde está o dinheiro desta meta. A reserva
      não é oferecida aqui porque ela já tem uma finalidade própria.
    </div>
  }

  return <div className="space-y-2">
    {holdings.map((holding) => {
      const current = goal.includes?.find(
        (item) => item.type === 'holding' && item.id === holding.id,
      )?.amount ?? 0
      const claimedByOthers = goals
        .filter((item) => item.id !== goal.id && item.kind === 'funding')
        .flatMap((item) => item.includes ?? [])
        .filter((item) => item.type === 'holding' && item.id === holding.id)
        .reduce((sum, item) => sum + Math.max(0, item.amount ?? 0), 0)
      const available = Math.max(0, holding.marketValue - claimedByOthers)

      return <div key={holding.id} className="grid gap-2 rounded-lg border border-dark-border/70 bg-dark-input/35 p-3 sm:grid-cols-[1fr_170px] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-dark-text">{holding.name}</p>
          <p className="mt-0.5 text-xs text-dark-text-muted">
            {holding.institution || 'Instituição não informada'} · {formatCurrency(holding.marketValue)} na posição
          </p>
          <p className="mt-1 text-xs text-dark-text-muted">Disponível para esta meta: {formatCurrency(available)}</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-dark-text-muted">Destinar à meta</span>
          <CurrencyInput value={current} onChange={(value) => setGoalHoldingAllocation(goal.id, holding.id, value)} className="!py-1.5" />
        </label>
      </div>
    })}
  </div>
}

function GoalRow({ goal }: { goal: GoalSummary }) {
  const { addGoalTransaction, removeGoalTransaction, setGoalTransactionCycle, removeGoal, restoreGoal, deleteEmptyGoal, updateGoal, toggleGoalInclusion, summary } = useInvestmentsStore()
  const { activeCycle } = useFinancasStore()
  const [expanded, setExpanded] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const kind = goal.kind ?? 'funding'
  const lateBy = goal.monthsLeft !== null && goal.monthsLeft < 0 ? -goal.monthsLeft : 0
  const unavailable = goal.holdingAllocations.reduce((sum, item) => sum + item.unavailable, 0)

  return <div className="rounded-xl border border-dark-border/70 bg-dark-surface/40">
    <button type="button" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-dark-text">
          {goal.name}
          {goal.isComplete && <CheckCircle2 size={13} className="shrink-0 text-primary-400" aria-label="Concluída" />}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
          <Tag>{kind === 'funding' ? <><Link2 size={10} /> Dinheiro destinado</> : <><Layers size={10} /> Indicador</>}</Tag>
          {goal.archivedAt && <Tag>Arquivada</Tag>}
          {goal.archivedAt && goal.ownBalance > 0 && <Tag>Saldo ainda no patrimônio</Tag>}
          {goal.targetMonth && <Tag>{formatMonthKey(goal.targetMonth)}</Tag>}
          {goal.includedLabels.length > 0 && <span className="truncate">{goal.includedLabels.join(' + ')}</span>}
          {lateBy > 0 && !goal.isComplete && <span className="text-amber-400">{formatMonths(lateBy)} atrasada</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-dark-text">{formatCurrency(goal.current)}</p>
        <p className="text-xs tabular-nums text-dark-text-muted">
          {goal.targetAmount > 0 ? `${goal.progress.toFixed(0)}% de ${formatCurrency(goal.targetAmount)}` : 'sem valor-alvo'}
        </p>
      </div>
      <ChevronDown size={15} className={`shrink-0 text-dark-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>

    {goal.targetAmount > 0 && <div className="px-4 pb-3"><Meter value={goal.current} max={goal.targetAmount} color={goal.color} overIsBad={false} /></div>}

    {expanded && <div className="space-y-4 border-t border-dark-border/60 px-4 py-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Nome</span><input value={goal.name} onChange={(event) => updateGoal(goal.id, { name: event.target.value })} className={`${inputClass} !py-1.5`} /></label>
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Valor-alvo</span><CurrencyInput value={goal.targetAmount} onChange={(value) => updateGoal(goal.id, { targetAmount: value })} className="!py-1.5" /></label>
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Mês-alvo</span><input type="month" value={goal.targetMonth ?? ''} onChange={(event) => updateGoal(goal.id, { targetMonth: event.target.value || undefined })} className={`${inputClass} !py-1.5`} /></label>
      </div>

      {kind === 'funding' ? <div>
        <div className="mb-2">
          <p className="text-xs font-semibold text-dark-text">Onde está o dinheiro desta meta</p>
          <p className="mt-0.5 text-xs leading-relaxed text-dark-text-muted">Separe apenas a parte de cada posição que pertence à meta. O valor continua contado uma única vez no patrimônio.</p>
        </div>
        <FundingSources goal={goal} />
      </div> : <div>
        <p className="mb-2 text-xs font-semibold text-dark-text">O que este indicador mede</p>
        <TrackingSourcePicker selected={goal.includes ?? []} onToggle={(inclusion) => toggleGoalInclusion(goal.id, inclusion)} classes={summary.classes} hasAssets={summary.physicalAssets > 0} hasDebts={summary.liabilities > 0} />
      </div>}

      {unavailable > 0 && <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{formatCurrency(unavailable)} deixou de estar coberto porque o saldo de uma posição caiu. Ajuste a destinação acima.</p>}

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md bg-dark-input/60 px-2.5 py-2"><span className="block text-dark-text-muted">{kind === 'funding' ? 'Em posições' : 'Valor medido'}</span><strong className="tabular-nums text-dark-text">{formatCurrency(kind === 'funding' ? goal.allocatedBalance : goal.trackingBalance)}</strong></div>
        <div className="rounded-md bg-dark-input/60 px-2.5 py-2"><span className="block text-dark-text-muted">Sem posição</span><strong className="tabular-nums text-dark-text">{formatCurrency(goal.ownBalance)}</strong></div>
        {!goal.isComplete && goal.suggestedMonthly > 0 && <div className="col-span-2 rounded-md bg-dark-input/60 px-2.5 py-2 sm:col-span-1"><span className="block text-dark-text-muted">Ritmo sugerido</span><strong className="tabular-nums text-dark-text">{formatCurrency(goal.suggestedMonthly)}/mês</strong></div>}
      </div>

      {kind === 'funding' && <details className="rounded-lg border border-dark-border/60 bg-dark-input/25 p-3">
        <summary className="cursor-pointer text-xs font-medium text-dark-text-secondary">Dinheiro sem posição cadastrada</summary>
        <p className="mt-2 text-xs leading-relaxed text-dark-text-muted">Use somente para dinheiro guardado fora das posições acima. Se ele está em CDB, ETF ou caixinha, cadastre a posição e destine o valor para evitar uma origem indefinida.</p>
        <div className="mt-3 space-y-3">
          <LedgerMoveForm
            onMove={(amount, note, cycleMonth) =>
              addGoalTransaction(goal.id, amount, note, cycleMonth)
            }
            inLabel="Guardar"
            outLabel="Resgatar"
            disableOut={goal.ownBalance <= 0}
            cycleMonth={activeCycle.month}
          />
          <LedgerList
            transactions={goal.transactions}
            onRemove={(id) => removeGoalTransaction(goal.id, id)}
            onCycleMonthChange={(id, cycleMonth) =>
              setGoalTransactionCycle(goal.id, id, cycleMonth)
            }
            inLabel="Guardado"
            outLabel="Resgatado"
          />
        </div>
      </details>}

      <button type="button" onClick={() => goal.archivedAt ? restoreGoal(goal.id) : removeGoal(goal.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-dark-text-muted transition-colors hover:text-dark-text">{goal.archivedAt ? <RotateCcw size={13} /> : <Archive size={13} />} {goal.archivedAt ? 'Restaurar meta' : 'Arquivar meta'}</button>
      {goal.transactions.length === 0 && (goal.includes?.length ?? 0) === 0 && <button type="button" onClick={() => {
        if (!deleteEmptyGoal(goal.id)) setDeleteError('Exclusão recusada: um evento ou compromisso ainda está vinculado a esta meta.')
      }} className="ml-3 inline-flex items-center gap-1.5 text-xs text-dark-text-muted hover:text-rose-400"><Trash2 size={13} /> Excluir cadastro vazio</button>}
      {deleteError && <p role="alert" className="text-xs text-amber-200">{deleteError}</p>}
    </div>}
  </div>
}

export function GoalsSection() {
  const { goals, addGoal, summary } = useInvestmentsStore()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<GoalKind>('funding')
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState(0)
  const [targetMonth, setTargetMonth] = useState('')
  const [includes, setIncludes] = useState<GoalInclusion[]>([])

  const toggleInclusion = (inclusion: GoalInclusion) => setIncludes((prev) => {
    const matches = (item: GoalInclusion) => item.type === inclusion.type && (item.id ?? '') === (inclusion.id ?? '')
    return prev.some(matches) ? prev.filter((item) => !matches(item)) : [...prev, inclusion]
  })
  const selectKind = (next: GoalKind) => {
    setKind(next)
    setIncludes(next === 'tracking' ? NET_WORTH_INCLUSIONS : [])
  }
  const handleAdd = () => {
    if (!name.trim()) return
    if (!addGoal({ name, targetAmount, targetMonth: targetMonth || undefined, kind, includes })) return
    setName(''); setTargetAmount(0); setTargetMonth(''); setIncludes([]); setKind('funding'); setOpen(false)
  }
  const activeGoals = goals.filter((goal) => !goal.archivedAt)
  const archivedGoals = goals.filter((goal) => goal.archivedAt)
  const allocated = activeGoals.filter((goal) => goal.kind === 'funding').reduce((sum, goal) => sum + goal.current, 0)

  return <Panel>
    <PanelHeader
      title="Metas"
      icon={<Flag size={16} />}
      description="Defina um objetivo e ligue-o ao dinheiro exato que está em CDBs, ETFs ou caixinhas. Indicadores patrimoniais ficam separados."
      actions={<><span className="hidden text-sm font-semibold tabular-nums text-dark-text sm:inline">{formatCurrency(allocated)} destinado</span><SecondaryButton onClick={() => setOpen((prev) => !prev)}><Plus size={14} /> Nova meta</SecondaryButton></>}
    />

    {open && <div className="mt-4 space-y-3 rounded-xl border border-dark-border bg-dark-surface/60 p-4">
      <SegmentedControl options={[{ value: 'funding' as const, label: 'Objetivo com dinheiro' }, { value: 'tracking' as const, label: 'Indicador patrimonial' }]} value={kind} onChange={selectKind} />
      <p className="text-xs leading-relaxed text-dark-text-muted">{kind === 'funding' ? 'Para viagem, entrada, carro ou outro objetivo: depois de criar, escolha quanto de cada posição pertence a ele.' : 'Para acompanhar um marco amplo, como patrimônio líquido ou total investido, sem reservar dinheiro específico.'}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Nome</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'funding' ? 'ex.: Gastar Europa' : 'ex.: Patrimônio 2027'} className={inputClass} /></label>
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Valor-alvo</span><CurrencyInput value={targetAmount} onChange={setTargetAmount} /></label>
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Mês-alvo (opcional)</span><input type="month" min={monthKey()} value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} className={inputClass} /></label>
      </div>
      {kind === 'tracking' && <div><span className="mb-1.5 block text-xs text-dark-text-muted">Saldos que entram no indicador</span><TrackingSourcePicker selected={includes} onToggle={toggleInclusion} classes={summary.classes} hasAssets={summary.physicalAssets > 0} hasDebts={summary.liabilities > 0} /></div>}
      <div className="flex gap-2"><PrimaryButton onClick={handleAdd} disabled={!name.trim()}><Plus size={15} /> Criar meta</PrimaryButton><SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton></div>
    </div>}

    <div className="mt-4">{activeGoals.length === 0 ? <EmptyState icon={<Landmark size={24} />} title="Nenhuma meta ativa">Crie um objetivo e depois indique em quais posições o dinheiro está. Assim o patrimônio não é duplicado e cada real ganha uma finalidade clara.</EmptyState> : <div className="space-y-2">{activeGoals.map((goal) => <GoalRow key={goal.id} goal={goal} />)}</div>}</div>
    {archivedGoals.length > 0 && <details className="mt-4 rounded-xl border border-dark-border-subtle bg-dark-surface/30 p-3">
      <summary className="cursor-pointer text-sm font-medium text-dark-text-secondary">Metas arquivadas ({archivedGoals.length})</summary>
      <p className="mt-2 text-xs leading-relaxed text-dark-text-muted">O livro-razão permanece no Histórico. Saldos próprios ainda fazem parte do patrimônio.</p>
      <div className="mt-3 space-y-2">{archivedGoals.map((goal) => <GoalRow key={goal.id} goal={goal} />)}</div>
    </details>}
  </Panel>
}
