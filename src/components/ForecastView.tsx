import { useMemo, useState } from 'react'
import {
  CalendarClock,
  Flag,
  Gift,
  Plus,
  Pencil,
  Ban,
  TrendingUp,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { Card } from './Card'
import {
  EmptyState,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  StatTile,
  TrendChart,
  type TrendSeries,
} from './ui'
import {
  formatCurrency,
  formatMonthKey,
  formatMonthLong,
  inputClass,
} from '../lib/format'
import { EVENT_SUGGESTIONS, nextMonthKeyFor, projectedAt } from '../lib/forecast'
// `formatMonthLong` nomeia o mês em que a dívida zera; os demais formatos são de eixo.
import { monthKey } from '../lib/shared'
import { useFinancasStore } from '../context/financasStore'
import type { ExpectedEvent, ExpectedEventKind, ExpectedEventRecurrence, GoalSummary } from '../types'
import { CHART_PALETTE, RECURRENCE_LABELS } from '../types/constants'
import { repositoryRevision } from '../data/repositoryCommand'
import { cardDueMonthForOccurrence, type ReconciledOccurrence } from '../lib/forecastCoverage'
import { ForecastEventOccurrences } from './ForecastCommitments'
import { GoalFundingPanel } from './GoalFundingPanel'

// ---------------------------------------------------------------------------
// Futuro.
//
// O orçamento mensal só enxerga o mês que se repete. 13º, bônus, férias, IPTU e
// seguro são dinheiro que você já sabe que vem — e mudam completamente a
// resposta para "eu chego na minha meta até dezembro?". Aqui eles viram
// ocorrências datadas e alimentam uma projeção de patrimônio.
// ---------------------------------------------------------------------------

const HORIZONS = [12, 18, 24, 36]

function EventForm({ onClose, event, occurrence }: { onClose: () => void; event?: ExpectedEvent; occurrence?: ReconciledOccurrence }) {
  const store = useFinancasStore()
  const { forecast } = store
  const hasLinkedFacts = Boolean(event)
  const [kind, setKind] = useState<ExpectedEventKind>(event?.kind ?? 'income')
  const [name, setName] = useState(event?.name ?? '')
  const [amount, setAmount] = useState(occurrence?.amount ?? event?.amount ?? 0)
  const [month, setMonth] = useState(occurrence?.month ?? forecast.currentMonth)
  const [date, setDate] = useState(occurrence?.date ?? event?.date ?? '')
  const [recurrence, setRecurrence] = useState<ExpectedEventRecurrence>(event?.recurrence ?? 'once')
  const [savedPct, setSavedPct] = useState(event?.savedPct ?? 100)
  const [cashTreatment, setCashTreatment] = useState(event?.cashTreatment ?? 'extra')
  const [cardDueMonth, setCardDueMonth] = useState(occurrence ? cardDueMonthForOccurrence(occurrence) ?? '' : event?.cardDueMonth ?? '')
  const [confirmed, setConfirmed] = useState(event?.confirmed ?? false)
  const [note, setNote] = useState(event?.note ?? '')
  const [scope, setScope] = useState<'this' | 'following'>('this')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(repositoryRevision)
  const [planChoice, setPlanChoice] = useState(event?.planLink ? event.planLink.type + ':' + event.planLink.id : '')
  const [goalId, setGoalId] = useState(event?.goalId ?? '')
  const plan = store.scenarios.monthlyPlans.find((row) => row.month === month) ?? store.scenarios.activeScenarioAll

  const handleAdd = () => {
    if (!name.trim() || amount <= 0 ||
      (kind === 'expense' && cashTreatment === 'card' && (!cardDueMonth || cardDueMonth < month))) return
    const input = { name, kind, amount, month, date: date || undefined, recurrence,
      savedPct, cashTreatment,
      cardDueMonth: cashTreatment === 'card' ? cardDueMonth || undefined : undefined,
      confirmed, note: note || undefined, goalId: goalId || undefined, planLink: cashTreatment === 'planned' && planChoice ? { type: planChoice.startsWith('cost:') ? 'cost' as const : 'want' as const, id: planChoice.slice(planChoice.indexOf(':') + 1) } : undefined }
    if (event && occurrence) { const result = forecast.updateEvent(event.id, input, occurrence.originalMonth, scope, revision); if (!result.ok) { setError(result.message); return } }
    else if (!forecast.addEvent({ ...input, recurrence })) { setError('Não foi possível salvar. Confira os campos e o armazenamento.'); return }
    setName('')
    setAmount(0)
    onClose()
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dark-border bg-dark-surface/60 p-3">
      {!event && <details className="text-xs text-dark-text-secondary">
        <summary className="cursor-pointer marker:text-dark-text-muted">Usar um exemplo</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">{EVENT_SUGGESTIONS.filter((item) => !forecast.events.some((e) => e.name === item.name)).map(
          (item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                setKind(item.kind)
                setName(item.name)
                setRecurrence(item.recurrence)
                setMonth(nextMonthKeyFor(item.monthIndex))
              }}
              className="rounded-full border border-dark-border bg-dark-input px-3 py-1 text-xs text-dark-text-secondary transition-colors hover:border-primary-500/50 hover:text-primary-300"
            >
              + {item.name}
            </button>
          ),
        )}</div>
      </details>}

      {hasLinkedFacts ? <p className="text-sm text-dark-text-secondary">{kind === 'income' ? 'Entra dinheiro' : 'Sai dinheiro'} · tipo preservado na série.</p> : <SegmentedControl
        options={[
          { value: 'income' as ExpectedEventKind, label: 'Entra dinheiro' },
          { value: 'expense' as ExpectedEventKind, label: 'Sai dinheiro' },
        ]}
        value={kind}
        onChange={setKind}
        className="sm:max-w-80"
      />}
      {hasLinkedFacts && <p className="text-xs text-dark-text-muted">Pagamentos e recebimentos ficam preservados. A repetição da série mantém sua origem; a edição abaixo ajusta a pendência escolhida.</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Nome</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            placeholder={kind === 'income' ? 'ex.: 13º salário' : 'ex.: IPVA'}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Valor</span>
          <CurrencyInput value={amount} onChange={setAmount} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Mês previsto</span>
          <input
            type="month"
            value={month}
            onChange={(event) => { setMonth(event.target.value || monthKey()); setDate('') }}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Dia exato (se souber)</span>
          <input type="date" value={date} onChange={(event) => {
            setDate(event.target.value)
            if (event.target.value) setMonth(event.target.value.slice(0, 7))
          }} className={inputClass} />
        </label>
        <div className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Repete</span>
          {hasLinkedFacts ? <p className="flex h-[46px] items-center text-sm text-dark-text-secondary">{RECURRENCE_LABELS[recurrence]}</p> : <SegmentedControl
            options={(Object.keys(RECURRENCE_LABELS) as ExpectedEventRecurrence[]).map((value) => ({
              value,
              label: RECURRENCE_LABELS[value],
            }))}
            value={recurrence}
            onChange={setRecurrence}
            className="h-[46px] items-center"
          />}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {kind === 'expense' && <label className="block"><span className="app-form-label mb-1 block">Como será pago</span>
          <select value={cashTreatment} onChange={(event) => setCashTreatment(event.target.value as typeof cashTreatment)} className={inputClass}>
            <option value="extra">Extraordinário em conta</option>
            <option value="planned">Já incluído em Desejos ou custos</option>
            <option value="card">Cartão (registrar em Cartões)</option>
          </select>
        </label>}
        {kind === 'expense' && cashTreatment === 'card' && <label className="block"><span className="app-form-label mb-1 block">Mês da fatura</span>
          <input type="month" min={month} value={cardDueMonth} onChange={(event) => setCardDueMonth(event.target.value)} className={inputClass} />
        </label>}
      </div>

      <details className="rounded-lg border border-dark-border-subtle p-3 text-sm text-dark-text-secondary">
        <summary className="cursor-pointer marker:text-dark-text-muted">Mais opções</summary>
        <label className="mt-3 block"><span className="app-form-label mb-1 block">Observação</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: hotel cobrado no check-in" className={inputClass} />
        </label>
        {kind === 'income' && <label className="mt-3 flex items-center gap-2 text-sm text-dark-text-secondary">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="h-4 w-4 accent-primary-500" />
          Entrada confirmada, ainda não recebida
        </label>}
      {kind === 'income' && (
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-xs text-dark-text-muted">
            <span>Quanto disso você guarda</span>
            <strong className="tabular-nums text-dark-text">{savedPct}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={savedPct}
            onChange={(event) => setSavedPct(Number(event.target.value))}
            className="w-full accent-primary-500"
          />
          <span className="mt-1 block text-xs text-dark-text-muted">
            {amount > 0
              ? `${formatCurrency((amount * savedPct) / 100)} viram patrimônio; o resto é consumo.`
              : 'O resto é consumo e não entra na projeção de patrimônio.'}
          </span>
        </label>
      )}
      </details>

      {cashTreatment === 'planned' && kind === 'expense' && <label className="block"><span className="app-form-label mb-1 block">Item do plano que já cobre esta saída</span><select className={inputClass} value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}><option value="">Escolha o item</option>{plan.costs.filter((row) => !row.archivedAt && row.paidWith !== 'card').map((row) => <option key={row.id} value={'cost:' + row.id}>{row.name} · custo</option>)}{plan.wants.filter((row) => !row.archivedAt && row.paidWith === 'account').map((row) => <option key={row.id} value={'want:' + row.id}>{row.name} · Desejos</option>)}</select></label>}
      <label className="block"><span className="app-form-label mb-1 block">Meta relacionada (contexto opcional)</span><select className={inputClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">Sem meta</option>{store.investments.goals.filter((row) => !row.archivedAt).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {kind === 'income' && <p className="text-xs text-dark-text-muted">Para financiar uma ou várias metas, salve a previsão e use Destinar entradas em Metas e entradas previstas, acima da agenda.</p>}
      {event && event.recurrence !== 'once' && <label className="block"><span className="app-form-label mb-1 block">Aplicar alteração</span><select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as 'this' | 'following')}><option value="this">Esta ocorrência</option><option value="following">Esta e próximas pendentes</option></select></label>}
      {error && <div role="alert" className="text-xs text-rose-200">{error}<SecondaryButton className="ml-2" onClick={() => { setRevision(repositoryRevision()); setError('') }}>Revisar dados atuais</SecondaryButton></div>}
      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || amount <= 0 || (cashTreatment === 'planned' && !planChoice) || (kind === 'expense' && cashTreatment === 'card' && (!cardDueMonth || cardDueMonth < month))}>
          <Plus size={15} />
          {event ? 'Salvar alterações' : 'Adicionar'}
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </div>
  )
}

function EventRow({ event }: { event: ExpectedEvent }) {
  const { forecast, forecastAgenda } = useFinancasStore()
  const [editing, setEditing] = useState<ReconciledOccurrence | null>(null)
  const [showDates, setShowDates] = useState(false), [error, setError] = useState('')
  const next = forecastAgenda.find((row) => row.event.id === event.id)?.next
  const income = event.kind === 'income'
  return <li className="rounded-lg border border-dark-border-subtle bg-dark-surface/45 px-3 py-3">
    <div className="flex items-start gap-3"><span className="rounded-md bg-dark-card p-2 text-dark-text-muted">{income ? <Gift size={14} /> : <CalendarClock size={14} />}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-dark-text">{next?.event.name ?? event.name}</p><p className="mt-1 text-xs text-dark-text-muted">{next ? (next.date ? next.date.split('-').reverse().join('/') : formatMonthKey(next.month)) + (next.overdue ? ' · vencida' : '') + (next.paidAmount > 0 ? ' · parcial: ' + formatCurrency(next.paidAmount) + ' efetivados' : '') + (next.committedAmount > 0 ? ' · no cartão: ' + formatCurrency(next.committedAmount) : '') : event.cancelled ? 'Previsão cancelada; fatos preservados' : 'Sem pendência neste período'}{event.recurrence !== 'once' ? ' · ' + RECURRENCE_LABELS[event.recurrence] : ''}</p></div>
      {next && <strong className="text-sm tabular-nums text-dark-text">{income ? '+' : '−'} {formatCurrency(next.remainingAmount)}<span className="ml-1 text-xs font-normal text-dark-text-muted">restante</span></strong>}
      {next && <button type="button" aria-label={'Editar ' + event.name} className="p-1 text-dark-text-muted" onClick={() => setEditing(next)}><Pencil size={14} /></button>}
      <button type="button" aria-label={(event.cancelled ? 'Reativar ' : 'Cancelar ') + event.name} className="p-1 text-dark-text-muted" onClick={() => { const saved = event.cancelled ? forecast.restoreEvent(event.id) : forecast.removeEvent(event.id); setError(saved ? '' : 'Não foi possível alterar a previsão.') }}>{event.cancelled ? 'Reativar' : <Ban size={14} />}</button>
    </div>
    <button type="button" className="mt-2 text-xs text-dark-text-muted" onClick={() => setShowDates(!showDates)}>{showDates ? 'Ocultar ocorrências' : 'Ver ocorrências e registros'}</button>
    {showDates && <ForecastEventOccurrences event={event} onEdit={setEditing} />}
    {editing && <EventForm key={editing.id} event={editing.event} occurrence={editing} onClose={() => setEditing(null)} />}
    {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
  </li>
}

function ExpectedEventsPanel() {
  const { forecast, forecastAgenda } = useFinancasStore()
  const [showForm, setShowForm] = useState(false)
  const pending = forecastAgenda.filter((row) => row.next)
  const done = forecastAgenda.filter((row) => !row.next)
  return <Card title="Entradas e saídas esperadas" icon={<CalendarClock size={16} />} collapsible storageKey="forecast-expected-events">
    <div className="flex items-start justify-between gap-4">
      <p className="text-sm text-dark-text-muted">A próxima pendência de cada previsão, pelo restante conciliado. Registrar no Ciclo ou aqui atualiza a mesma ocorrência.</p>
      {!showForm && <SecondaryButton onClick={() => setShowForm(true)}><Plus size={14} /> Nova previsão</SecondaryButton>}
    </div>
    {showForm && <EventForm onClose={() => setShowForm(false)} />}
    {!forecast.events.length && <div className="mt-4"><EmptyState icon={<CalendarClock size={24} />} title="Nada previsto ainda">Cadastre uma entrada ou saída com o mês ou dia esperado.</EmptyState></div>}
    <ul className="mt-4 space-y-2">{pending.map((row) => <EventRow key={row.event.id} event={row.event} />)}</ul>
    {done.length > 0 && <details className="mt-4 text-xs text-dark-text-muted"><summary className="cursor-pointer">Concluídas e canceladas ({done.length})</summary><ul className="mt-2 space-y-2">{done.map((row) => <EventRow key={row.event.id} event={row.event} />)}</ul></details>}
  </Card>
}

/**
 * Como julgar uma meta com prazo. Metas que englobam os investimentos crescem
 * com a projeção do patrimônio *financeiro* — é ali que o aporte cai. Um imóvel
 * valorizando não ajuda a bater a meta da viagem.
 */
function goalOutlook(goal: GoalSummary, projected: number | null, currentFinancial: number) {
  const tracksInvestments = (goal.includes ?? []).some((item) => item.type === 'investments')
  if (!goal.targetMonth || goal.targetAmount <= 0) return null

  if (tracksInvestments && projected !== null) {
    // O crescimento projetado do patrimônio cai justamente onde a meta mede.
    const value = goal.current + (projected - currentFinancial)
    return { mode: 'projection' as const, value, gap: value - goal.targetAmount }
  }
  return { mode: 'contribution' as const, value: goal.current, gap: -goal.remaining }
}

export function ForecastView() {
  const store = useFinancasStore()
  const { forecast, projection, monthlyContribution, metrics, investments } = store
  const { assumptions, currentMonth } = forecast
  const [chartView, setChartView] = useState<'money' | 'balance'>('money')

  const real = assumptions.showInRealTerms
  const first = projection[0]
  const last = projection[projection.length - 1]
  const labels = useMemo(() => projection.map((point) => formatMonthKey(point.month)), [projection])
  const hasDebt = first.debt > 0
  const hasProperties = first.properties > 0
  // Só a dívida sem contrapartida separa uma curva da outra.
  const hasUnsecuredDebt = first.debt - first.securedDebt > 0

  // O número em destaque é o dinheiro. O patrimônio líquido total, que carrega
  // casa e financiamento, vira leitura secundária: ele responde "quanto eu
  // valho", não "quanto eu vou ter" — e era o que estava assustando à toa.
  const financialNow = real ? first.financialNetWorthReal : first.financialNetWorth
  const financialLast = last
    ? real
      ? last.financialNetWorthReal
      : last.financialNetWorth
    : financialNow
  const netWorthNow = real ? first.netWorthReal : first.netWorth
  const netWorthLast = last ? (real ? last.netWorthReal : last.netWorth) : netWorthNow

  // Um imóvel de meia dezena de centenas de milhares esmaga a escala: plotado
  // junto, o dinheiro — que é a resposta útil — vira uma linha rente ao eixo.
  // Por isso as duas visões são separadas, e a do dinheiro é a padrão.
  const canShowBalanceSheet = hasProperties || hasDebt
  const showsBalanceSheet = canShowBalanceSheet && chartView === 'balance'

  const series: TrendSeries[] = showsBalanceSheet
    ? [
        {
          id: 'net-worth',
          label: real ? 'Patrimônio líquido (reais de hoje)' : 'Patrimônio líquido',
          color: CHART_PALETTE.blue,
          values: projection.map((point) => (real ? point.netWorthReal : point.netWorth)),
        },
        ...(hasProperties
          ? [
              {
                id: 'properties',
                label: 'Bens',
                color: CHART_PALETTE.yellow,
                values: projection.map((point) =>
                  real ? point.propertiesReal : point.properties,
                ),
              },
            ]
          : []),
        ...(hasDebt
          ? [
              {
                id: 'debt',
                label: 'Dívidas',
                color: CHART_PALETTE.red,
                values: projection.map((point) => point.debt),
              },
            ]
          : []),
      ]
    : [
        {
          id: 'financial',
          label: real
            ? canShowBalanceSheet
              ? 'Patrimônio financeiro (reais de hoje)'
              : 'Patrimônio (reais de hoje)'
            : canShowBalanceSheet
              ? 'Patrimônio financeiro'
              : 'Patrimônio',
          color: CHART_PALETTE.aqua,
          values: projection.map((point) =>
            real ? point.financialNetWorthReal : point.financialNetWorth,
          ),
        },
        // Dívida sem contrapartida separa as duas curvas e vale mostrar junto.
        ...(hasUnsecuredDebt
          ? [
              {
                id: 'assets',
                label: 'Ativos financeiros',
                color: CHART_PALETTE.blue,
                values: projection.map((point) => (real ? point.assetsReal : point.assets)),
              },
            ]
          : []),
      ]

  const payoffMonth = hasUnsecuredDebt
    ? projection.find((point) => point.debt - point.securedDebt <= 0)
    : undefined
  const equityBuiltInHorizon = projection.reduce((sum, point) => sum + point.equityBuilt, 0)
  const worstUnfunded = Math.max(...projection.map((point) => point.unfunded))
  const datedGoals = investments.goals.filter((goal) => !goal.archivedAt && goal.kind === 'tracking' && goal.targetMonth && goal.targetAmount > 0)

  return (
    <div className="space-y-4">
      <GoalFundingPanel />
      {datedGoals.length > 0 && (
        <Panel padded={false} className="overflow-hidden">
          <div className="border-b border-dark-border-subtle px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-dark-text">
              <Flag size={15} className="text-dark-text-muted" />
              Indicadores com prazo
            </h3>
            <p className="mt-0.5 text-xs text-dark-text-muted">
              Metas que englobam seus investimentos são julgadas pela projeção; as outras, pelo
              quanto você precisa aportar por mês.
              {real && ' Os valores previstos estão em reais de hoje.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-dark-text-muted">
                  <th className="px-5 py-2.5 font-medium">Meta</th>
                  <th className="px-4 py-2.5 text-right font-medium">Hoje</th>
                  <th className="px-4 py-2.5 text-right font-medium">Alvo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Prazo</th>
                  <th className="px-5 py-2.5 text-right font-medium">Previsão</th>
                </tr>
              </thead>
              <tbody>
                {datedGoals.map((goal) => {
                  const projected = projectedAt(projection, goal.targetMonth!, real)
                  const outlook = goalOutlook(goal, projected, financialNow)
                  const late = goal.monthsLeft !== null && goal.monthsLeft < 0

                  return (
                    <tr key={goal.id} className="border-t border-dark-border-subtle">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-dark-text">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: goal.color }}
                          />
                          {goal.name}
                        </span>
                        {goal.includedLabels.length > 0 && (
                          <span className="ml-4 text-xs text-dark-text-muted">
                            engloba {goal.includedLabels.join(' + ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                        {formatCurrency(goal.current)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                        {formatCurrency(goal.targetAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-dark-text-secondary">
                        {formatMonthKey(goal.targetMonth!)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {goal.isComplete ? (
                          <span className="text-primary-400">meta batida</span>
                        ) : late ? (
                          <span className="text-rose-400">prazo vencido</span>
                        ) : outlook?.mode === 'projection' ? (
                          <span
                            className={`tabular-nums ${
                              outlook.gap >= 0 ? 'text-primary-400' : 'text-amber-300'
                            }`}
                          >
                            {formatCurrency(outlook.value)}
                            <span className="ml-1.5 text-xs text-dark-text-muted">
                              {outlook.gap >= 0
                                ? `+ ${formatCurrency(outlook.gap)}`
                                : `faltam ${formatCurrency(-outlook.gap)}`}
                            </span>
                          </span>
                        ) : (
                          <span className="tabular-nums text-dark-text-secondary">
                            {formatCurrency(goal.suggestedMonthly)}
                            <span className="ml-1 text-xs text-dark-text-muted">/mês</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <ExpectedEventsPanel />
      <details className="rounded-xl border border-dark-border p-4"><summary className="cursor-pointer text-sm font-semibold text-dark-text">Projeção e premissas</summary><div className="mt-4 space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <StatTile
          label={`Patrimônio financeiro projetado em ${formatMonthKey(last?.month ?? currentMonth)}`}
          value={formatCurrency(financialLast)}
          detail={
            real
              ? `${formatCurrency(financialLast - financialNow)} a mais, em reais de hoje`
              : `${formatCurrency(financialLast - financialNow)} a mais que hoje`
          }
          tone="neutral"
        />
        <StatTile
          label="Aporte mensal considerado"
          value={formatCurrency(monthlyContribution)}
          detail={
            assumptions.monthlyContribution !== null
              ? 'valor fixado por você'
              : assumptions.includeLeftover
                ? 'plano + sobra do mês'
                : 'o aporte do seu plano'
          }
        />
      </div>

      <Panel>
        <PanelHeader
          title="Projeção do patrimônio"
          icon={<TrendingUp size={16} />}
          description={
            showsBalanceSheet
              ? 'O balanço inteiro: bens se valorizam pela premissa deles, dívidas caem pela parcela, e o líquido é a diferença.'
              : canShowBalanceSheet
                ? 'Quanto dinheiro você terá — aporte, eventos e rendimento. Bens e o financiamento deles ficam na visão do balanço.'
                : 'Hoje, mais o aporte de cada mês, mais o que você já sabe que vai entrar e sair, rendendo à taxa abaixo.'
          }
          actions={
            <>
              {canShowBalanceSheet && (
                <SegmentedControl
                  options={[
                    { value: 'money' as const, label: 'Dinheiro' },
                    { value: 'balance' as const, label: 'Balanço' },
                  ]}
                  value={chartView}
                  onChange={setChartView}
                  className="min-w-40"
                />
              )}
              <SegmentedControl
                options={[
                  { value: false, label: 'Nominal' },
                  { value: true, label: 'Reais de hoje' },
                ]}
                value={assumptions.showInRealTerms}
                onChange={(value) => forecast.updateAssumptions({ showInRealTerms: value })}
                className="min-w-52"
              />
            </>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-dark-text-muted">
              Aporte mensal (vazio = usar o plano)
            </span>
            <CurrencyInput
              value={assumptions.monthlyContribution ?? monthlyContribution}
              onChange={(value) => forecast.updateAssumptions({ monthlyContribution: value })}
              className="!py-2"
            />
            {assumptions.monthlyContribution !== null && (
              <button
                type="button"
                onClick={() => forecast.updateAssumptions({ monthlyContribution: null })}
                className="mt-1 text-xs text-primary-400 transition-colors hover:text-primary-300"
              >
                Voltar a usar o aporte do plano
              </button>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-xs text-dark-text-muted">
              <span>Rendimento esperado</span>
              <strong className="tabular-nums text-dark-text">
                {assumptions.annualReturnPct.toFixed(1)}% a.a.
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={25}
              step={0.5}
              value={assumptions.annualReturnPct}
              onChange={(event) =>
                forecast.updateAssumptions({ annualReturnPct: Number(event.target.value) })
              }
              className="mt-3 w-full accent-primary-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-xs text-dark-text-muted">
              <span>Inflação esperada</span>
              <strong className="tabular-nums text-dark-text">
                {assumptions.inflationPct.toFixed(1)}% a.a.
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.25}
              value={assumptions.inflationPct}
              onChange={(event) =>
                forecast.updateAssumptions({ inflationPct: Number(event.target.value) })
              }
              className="mt-3 w-full accent-primary-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-dark-text-muted">Horizonte</span>
            <SegmentedControl
              options={HORIZONS.map((value) => ({ value, label: `${value}m` }))}
              value={assumptions.horizonMonths}
              onChange={(value) => forecast.updateAssumptions({ horizonMonths: value })}
            />
          </label>
        </div>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-dark-text-secondary">
            <input
              type="checkbox"
              checked={assumptions.includeLeftover}
              onChange={(event) =>
                forecast.updateAssumptions({ includeLeftover: event.target.checked })
              }
              className="h-4 w-4 accent-primary-500"
              disabled={assumptions.monthlyContribution !== null}
            />
            Contar também a sobra do plano ({formatCurrency(Math.max(0, metrics.balanceAfterPlan))}
            /mês) como aporte
          </label>
          {hasDebt && (
            <label className="flex items-center gap-2 text-xs text-dark-text-secondary">
              <input
                type="checkbox"
                checked={assumptions.reinvestFreedInstallments}
                onChange={(event) =>
                  forecast.updateAssumptions({ reinvestFreedInstallments: event.target.checked })
                }
                className="h-4 w-4 accent-primary-500"
              />
              Quando uma dívida quitar, aportar a parcela liberada
            </label>
          )}
        </div>

        <div className="mt-4">
          <TrendChart labels={labels} series={series} height={240} />
        </div>
        {worstUnfunded > 0.005 && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
          A projeção fica sem {formatCurrency(worstUnfunded)} para financiar todas as saídas em pelo menos um mês.
          Esse déficit continua na curva até ser coberto por aportes ou entradas posteriores.
        </p>}

        {real && (
          <p className="mt-2 text-xs leading-relaxed text-dark-text-muted">
            Os valores estão descontados de {assumptions.inflationPct.toFixed(1)}% ao ano — é o que o
            dinheiro vai <em>comprar</em>, não o número que vai aparecer no extrato. A dívida aparece
            sempre em valor nominal, porque é assim que ela é cobrada.
          </p>
        )}

        {payoffMonth && (
          <p className="mt-2 text-xs leading-relaxed text-primary-300">
            No ritmo das parcelas atuais, suas dívidas sem contrapartida zeram em{' '}
            <strong>{formatMonthLong(payoffMonth.month)}</strong>
            {!assumptions.reinvestFreedInstallments &&
              ` — e liberam ${formatCurrency(store.debts.summary.unsecured.installment)} por mês`}
            .
          </p>
        )}

        {/* O ponto que faltava: a amortização não some, vira patrimônio. */}
        {equityBuiltInHorizon > 0 && last && (
          <p className="mt-2 border-t border-dark-border-subtle pt-2 text-xs leading-relaxed text-dark-text-muted">
            Até {formatMonthLong(last.month)} você terá{' '}
            <strong className="text-dark-text">{formatCurrency(financialLast)}</strong> em dinheiro e{' '}
            <strong className="text-dark-text">{formatCurrency(netWorthLast)}</strong> de patrimônio
            líquido total. Das parcelas do período,{' '}
            <strong className="text-primary-300">{formatCurrency(equityBuiltInHorizon)}</strong> não
            são despesa: são a fatia que abate o saldo devedor e vira patrimônio seu — o resto é
            juro, o preço de morar onde você mora.
          </p>
        )}
      </Panel>

      </div></details>
    </div>
  )
}
