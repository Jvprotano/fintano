import { Fragment, useState } from 'react'
import { History } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { EmptyState, Panel, PrimaryButton, SecondaryButton, SegmentedControl } from './ui'
import { formatCurrency, formatMonthKey, formatSignedCurrency, inputClass } from '../lib/format'
import { useCardsStore, useHistoryStore } from '../context/financasStore'
import type { HistoryPoint } from '../types'
import { COST_CATEGORIES, BUDGET_AREA_LABELS } from '../types/constants'
import { readRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { addMonths } from '../lib/shared'
import { historyCorrectionMovements, historyCorrectionRows, type HistoryDraft } from '../data/historyCorrections'
import { historyMissingMonths, selectHistoryPeriod, type HistoryTrendPeriod } from '../lib/historyTrends'
import { HistoryTrendExplorer } from './history/HistoryTrendExplorer'
import { LegacyInvoices } from './history/LegacyInvoices'
import { CardThirdPartyPanel } from './cards/CardThirdPartyPanel'

function SnapshotEditor({ point, onClose }: { point: HistoryPoint; onClose: () => void }) {
  const history = useHistoryStore()
  const [base] = useState(() => {
    const revision = repositoryRevision(), document = readRepositoryDocument()
    return { revision, rows: historyCorrectionRows(document, point.id), movements: historyCorrectionMovements(document, point.month) }
  })
  const [draft, setDraft] = useState<HistoryDraft>(() => ({
    amounts: Object.fromEntries(base.rows.map((row) => [row.key, row.unknown ? null : row.amount])),
    months: Object.fromEntries(base.movements.map((row) => [row.key, row.month])), note: point.note ?? '', reason: '',
  }))
  const [error, setError] = useState('')
  const changes = [
    ...base.rows.filter((row) => row.unknown ? draft.amounts[row.key] !== null : draft.amounts[row.key] !== row.amount).map((row) => ({ key: row.key, label: row.label,
      before: row.unknown ? 'Não informada' : formatCurrency(row.amount), after: draft.amounts[row.key] === null ? 'Não informado' : formatCurrency(draft.amounts[row.key]!), source: row.context })),
    ...base.movements.filter((row) => draft.months[row.key] !== row.month).map((row) => ({ key: row.key, label: row.label, before: formatMonthKey(row.month), after: formatMonthKey(draft.months[row.key]), source: 'Competência; data real preservada' })),
    ...(draft.note !== (point.note ?? '') ? [{ key: 'note', label: 'Nota', before: point.note ?? 'Sem nota', after: draft.note || 'Sem nota', source: 'Fechamento' }] : []),
  ]
  const revisedMonths = [...new Set([point.month, ...base.movements.filter((row) => draft.months[row.key] !== row.month).map((row) => draft.months[row.key])])].sort()
  const save = () => {
    const result = history.updateSnapshot(point.id, draft, base.revision)
    if (!result.ok) { setError(result.message); return }
    onClose()
  }
  return <form onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} className="space-y-4" onSubmit={(event) => { event.preventDefault(); save() }}>
    <p className="text-sm text-dark-text-secondary">Correção de {formatMonthKey(point.month)}. Os pagamentos detalhados são corrigidos na origem; valores sem origem recebem um ajuste explícito. As marcas patrimoniais continuam sendo as da data do fechamento.</p>
    <div className="grid grid-cols-3 gap-x-4 gap-y-3">
      {base.rows.map((row) => <label key={row.key} className="block">
        <span className="mb-1 block text-xs text-dark-text-secondary">{row.label}</span>
        <CurrencyInput ariaLabel={row.label} showZero={draft.amounts[row.key] !== null} value={draft.amounts[row.key] ?? 0} placeholder="Informe o valor" onEmpty={() => setDraft((prev) => ({ ...prev, amounts: { ...prev.amounts, [row.key]: null } }))}
          onChange={(amount) => setDraft((prev) => ({ ...prev, amounts: { ...prev.amounts, [row.key]: amount } }))} />
        <span className="mt-1 block text-xs text-dark-text-muted">{row.context}{draft.amounts[row.key] === null && !row.unknown ? ' · Preenchimento obrigatório' : ''}</span>
      </label>)}
    </div>
    {base.movements.length > 0 && <div className="border-t border-dark-border-subtle pt-3">
      <h4 className="mb-2 text-sm font-medium">Competência dos movimentos</h4>
      <p className="mb-3 text-xs text-dark-text-muted">Alterar a competência preserva data e valor. Partes da mesma operação se movem juntas. Para corrigir valor ou desfazer, abra o livro em Patrimônio.</p>
      <div className="space-y-2">{base.movements.map((row) => <label key={row.key} className="flex items-center justify-between gap-4 text-xs">
        <span>{row.label} · {formatCurrency(row.amount)} · data real {row.date.slice(0, 10)}{row.locked ? ' · acompanha a parcela paga' : ''}</span>
        <input type="month" disabled={row.locked} aria-label={`Competência de ${row.label}`} value={draft.months[row.key]} className={`${inputClass} w-44`}
          onChange={(event) => setDraft((prev) => ({ ...prev, months: { ...prev.months, [row.key]: event.target.value } }))} />
      </label>)}</div>
    </div>}
    <p className="text-xs text-dark-text-muted">Faturas com pagamento e composição preservados ficam disponíveis no detalhe do cartão. O total isolado não substitui compras, créditos ou desembolsos ao banco.</p>
    <div className="grid grid-cols-2 gap-4">
      <label><span className="mb-1 block text-xs text-dark-text-secondary">Nota do ciclo</span><input className={inputClass} value={draft.note} placeholder="Ex.: bônus anual recebido" onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))} /></label>
      <label><span className="mb-1 block text-xs text-dark-text-secondary">Motivo da correção</span><input required className={inputClass} value={draft.reason} placeholder="Ex.: valor conferido no extrato" onChange={(event) => setDraft((prev) => ({ ...prev, reason: event.target.value }))} /></label>
    </div>
    {changes.length > 0 && <div className="rounded-xl border border-dark-border bg-dark-input p-3 text-xs">
      <p className="mb-2 font-medium">Antes → depois · ciclos revisados: {revisedMonths.map(formatMonthKey).join(', ')}</p>
      <ul className="space-y-1.5">{changes.map((row) => <li key={row.key}><strong>{row.label}</strong>: {row.before} → {row.after}<span className="ml-2 text-dark-text-muted">{row.source}</span></li>)}</ul>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex gap-2"><PrimaryButton type="submit" disabled={!changes.length || !draft.reason.trim() || base.rows.some((row) => !row.unknown && draft.amounts[row.key] === null)}>Salvar correção</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
  </form>
}

function PlanDelta({ actual, planned, higherIsBetter = false, known = true }: { actual: number; planned: number; higherIsBetter?: boolean; known?: boolean }) {
  if (!known) return <span className="mt-1 block text-xs text-dark-text-muted">Plano não preservado</span>
  const delta = actual - planned
  const favorable = higherIsBetter ? delta >= 0 : delta <= 0
  return <span className={`mt-1 block text-xs ${(Math.abs(delta) < 0.005) ? 'text-dark-text-muted' : favorable ? 'text-primary-400' : 'text-rose-300'}`} title={`Plano: ${formatCurrency(planned)}`}>
    {Math.abs(delta) < 0.005 ? 'No plano' : `${formatSignedCurrency(delta)} vs plano`}
  </span>
}

function CycleDetails({ point }: { point: HistoryPoint }) {
  const { paidInvoices } = useCardsStore()
  const invoices = paidInvoices.filter((invoice) => invoice.dueMonth === addMonths(point.month, 1))
  return <div className="space-y-4 text-xs">
    <div className="grid grid-cols-3 gap-6">
      <div><h4 className="mb-2 text-sm font-medium">Custos por origem</h4><ul className="space-y-1.5">
        {COST_CATEGORIES.filter(({ key }) => point.costsByCategory[key] !== undefined).map(({ key, label }) => <li key={key} className="flex justify-between gap-3"><span>{label}</span><span>{formatCurrency(point.costsByCategory[key]!)}</span></li>)}
        <li className="text-dark-text-muted">Plano: {formatCurrency(point.costsPlanned)}</li>
        {Math.abs(point.costs - Object.values(point.costsByCategory).reduce((total, value) => total + (value ?? 0), 0)) > 0.005 && <li className="text-dark-text-muted">Parte sem categoria preservada: {formatCurrency(point.costs - Object.values(point.costsByCategory).reduce((total, value) => total + (value ?? 0), 0))}</li>}
      </ul></div>
      <div><h4 className="mb-2 text-sm font-medium">Desejos e cartão</h4><ul className="space-y-1.5">
        {point.wantAllocations.map((row) => <li key={row.id}>{row.name}: {formatCurrency(row.actual)} · plano {formatCurrency(row.planned)}</li>)}
        {!point.wantAllocations.length && <li>Desejos sem composição preservada</li>}
        {Object.entries(point.cardByArea).map(([area, amount]) => <li key={area}>Cartão · {BUDGET_AREA_LABELS[area as keyof typeof BUDGET_AREA_LABELS]}: {formatCurrency(amount ?? 0)}</li>)}
        <li className="text-dark-text-muted">Plano do cartão: {formatCurrency(point.cardPlanned)} · plano de Desejos: {formatCurrency(point.wantsPlanned)}</li>
      </ul></div>
      <div><h4 className="mb-2 text-sm font-medium">Investimentos e patrimônio</h4><ul className="space-y-1.5">
        <li>Folha: {formatCurrency(point.payrollInvested)} · conta: {formatCurrency(point.directInvestedAtClose)}</li>
        <li>Empresa: {point.employerInvestmentKnown ? formatCurrency(point.employerInvested) : 'não informada'}</li>
        <li>Plano de aporte: {point.investmentPlanCaptured ? formatCurrency(point.investedPlanned) : 'não preservado'}</li>
        <li>Ativos financeiros: {formatCurrency(point.grossAssets)}</li><li>Bens: {formatCurrency(point.physicalAssets)} · dívidas: {formatCurrency(point.liabilities)}</li>
        <li className="text-dark-text-muted">Marca patrimonial de {point.closedAt.slice(0, 10)}. Variação sem origem identificada não representa rentabilidade.</li>
      </ul></div>
    </div>
    {invoices.length > 0 && <details className="rounded-xl border border-dark-border p-3">
      <summary className="cursor-pointer font-medium">Faturas preservadas · compras e pagamentos</summary>
      <div className="mt-3 space-y-3">{invoices.map((invoice) => <div key={invoice.id ?? `${invoice.accountId}:${invoice.dueMonth}`}>
        <p>Vencimento {formatMonthKey(invoice.dueMonth)} · pago em {invoice.paidAt.slice(0, 10)} · minha parte {formatCurrency(invoice.personalTotal)} · total ao banco {invoice.total === null ? 'não preservado' : formatCurrency(invoice.total)}</p>
        <ul className="mt-2 space-y-1 text-dark-text-secondary">{invoice.entries?.map((entry) => <li key={entry.id}>{entry.description} · {entry.cardName} · minha parte {formatCurrency(entry.personalAmount)} · total {formatCurrency(entry.amount)}</li>)}</ul>
        {!invoice.entries?.length && <p className="mt-2 text-dark-text-muted">Composição de compras não preservada.</p>}
      </div>)}</div>
    </details>}
    <div className="grid grid-cols-2 gap-6 border-t border-dark-border-subtle pt-3">
      <div><h4 className="mb-2 text-sm font-medium">Recebimentos e extraordinários</h4><ul className="space-y-1.5">
        <li>Salário na conta: {formatCurrency(point.paycheckInAccount)}</li>
        {point.extraIncomeEntries.map((entry) => <li key={entry.id}>Entrada · {entry.name}: {formatCurrency(entry.amount)}{entry.occurredAt ? ` · ${entry.occurredAt}` : ''}{entry.sourceEventId ? ' · origem na agenda' : ''}</li>)}
        {point.extraExpenseEntries.map((entry) => <li key={entry.id}>Saída · {entry.name}: {formatCurrency(entry.amount)}{entry.occurredAt ? ` · ${entry.occurredAt}` : ''}</li>)}
        <li>Entradas extras: {formatCurrency(point.extraIncome)} · saídas extraordinárias: {formatCurrency(point.extraExpense)}</li>
        <li>Terceiros · adiantado: {formatCurrency(point.thirdPartyAdvanced ?? 0)} · devolvido: {formatCurrency(point.reimbursementsReceived ?? 0)}</li>
      </ul></div>
      <div><h4 className="mb-2 text-sm font-medium">Correções registradas</h4>
        {!point.corrections?.length && <p className="text-dark-text-muted">Nenhuma correção registrada.</p>}
        {point.corrections?.map((correction) => <details key={correction.id} className="mb-2 rounded-lg border border-dark-border p-2">
          <summary className="cursor-pointer">{correction.correctedAt.slice(0, 10)} · {correction.reason}</summary>
          <p className="mt-2 text-dark-text-muted">Ciclos revisados: {correction.revisedMonths.map(formatMonthKey).join(', ')}</p>
          <ul className="mt-2 space-y-1">{correction.changes.map((change, index) => <li key={index}>{change.label}: {change.before} → {change.after}<span className="block text-dark-text-muted">{change.source}</span></li>)}</ul>
        </details>)}
      </div>
    </div>
  </div>
}

export function HistoryView() {
  const history = useHistoryStore()
  const [period, setPeriod] = useState<HistoryTrendPeriod>(12)
  const [expanded, setExpanded] = useState<{ id: string; editing: boolean } | null>(null)
  const points = selectHistoryPeriod(history.points, period)
  const missing = historyMissingMonths(history.points, period)
  if (!history.points.length) return <div className="space-y-4"><EmptyState icon={<History size={26} />} title="Nenhum mês fechado ainda">Feche a competência na aba Ciclo para consultar o passado.</EmptyState><LegacyInvoices /><CardThirdPartyPanel history /></div>
  return <div className="space-y-4">
    <Panel>
      <div className="flex items-center justify-between gap-6"><div><h2 className="text-base font-semibold">Fechamentos e diferenças contra o plano</h2><p className="mt-1 text-xs text-dark-text-muted">{formatMonthKey(points[0].month)} a {formatMonthKey(points.at(-1)!.month)} · {points.length} ciclos fechados. Abra um ciclo para explicar os valores ou corrigir sua origem.</p></div>
        <SegmentedControl options={[{ value: 6 as const, label: '6 meses' }, { value: 12 as const, label: '12 meses' }, { value: 'all' as const, label: 'Tudo' }]} value={period} onChange={setPeriod} />
      </div>
      {missing.length > 0 && <p className="mt-3 text-xs text-amber-200">Sem fechamento: {missing.map(formatMonthKey).join(', ')}. Esses períodos não são considerados zero nem interpolados no gráfico.</p>}
      {points.some((point) => point.planEstimated || !point.investmentPlanCaptured || !point.employerInvestmentKnown) && <p className="mt-3 text-xs text-dark-text-muted">Há registros antigos com plano estimado, meta de aporte ou contrapartida não preservados. Valores desconhecidos ficam identificados no detalhe.</p>}
    </Panel>
    <Panel padded={false}>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-dark-text-muted">
        {['Ciclo', 'Renda', 'Custos', 'Desejos em conta', 'Cartão pessoal', 'Aporte pessoal', 'Patrimônio na data', 'Detalhes'].map((label, index) => <th key={label} className={`px-4 py-3 font-medium ${index ? 'text-right' : ''}`}>{label}</th>)}
      </tr></thead><tbody>{[...points].reverse().map((point) => <Fragment key={point.id}>
        <tr className="border-t border-dark-border-subtle align-top">
          <td className="px-4 py-3"><strong className="font-medium">{formatMonthKey(point.month)}</strong>{point.planEstimated && <span className="mt-1 block text-xs text-dark-text-muted">Plano estimado</span>}{point.note && <span className="mt-1 block max-w-44 text-xs text-dark-text-muted">{point.note}</span>}{!!point.corrections?.length && <span className="mt-1 block text-xs text-dark-text-muted">Corrigido · {point.corrections.length} revisões</span>}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.availableForBudget + point.extraIncome)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.costs)}<PlanDelta actual={point.costs} planned={point.costsPlanned} known={!point.planEstimated} /></td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.wants)}<PlanDelta actual={point.wants} planned={point.wantsPlanned} known={!point.planEstimated} /></td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.cardPersonalTotal)}<PlanDelta actual={point.cardPersonalTotal} planned={point.cardPlanned} known={!point.planEstimated} /></td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.invested)}<PlanDelta actual={point.invested} planned={point.investedPlanned} higherIsBetter known={point.investmentPlanCaptured} /></td>
          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(point.netWorth)}</td>
          <td className="px-4 py-3 text-right"><SecondaryButton onClick={() => setExpanded((current) => current?.id === point.id ? null : { id: point.id, editing: false })}>{expanded?.id === point.id ? 'Recolher' : 'Abrir ciclo'}</SecondaryButton></td>
        </tr>
        {expanded?.id === point.id && <tr className="border-t border-dark-border-subtle bg-dark-surface/40"><td colSpan={8} className="px-5 py-4">
          {expanded.editing ? <SnapshotEditor key={point.id} point={point} onClose={() => setExpanded({ id: point.id, editing: false })} /> : <><CycleDetails point={point} /><div className="mt-4"><SecondaryButton onClick={() => setExpanded({ id: point.id, editing: true })}>Corrigir registros deste ciclo</SecondaryButton></div></>}
        </td></tr>}
      </Fragment>)}</tbody></table></div>
    </Panel>
    <details className="group"><summary className="cursor-pointer rounded-xl border border-dark-border bg-dark-card px-4 py-3 text-sm font-medium">Consultar evolução · mesmo período dos fechamentos</summary><div className="mt-3"><HistoryTrendExplorer points={history.points} period={period} /></div></details>
    <LegacyInvoices /><CardThirdPartyPanel history />
  </div>
}
