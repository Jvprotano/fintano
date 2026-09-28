import { useMemo, useState } from 'react'
import {
  CalendarClock,
  Flag,
  Gift,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import {
  EmptyState,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  StatTile,
  Tag,
  TrendChart,
  type TrendSeries,
} from './ui'
import {
  formatCurrency,
  formatMonthKey,
  formatMonthLong,
  formatMonths,
  inputClass,
} from '../lib/format'
import { EVENT_SUGGESTIONS, nextMonthKeyFor, occursIn, projectedAt } from '../lib/forecast'
// `formatMonthLong` nomeia o mês em que a dívida zera; os demais formatos são de eixo.
import { addMonths, monthKey, monthsBetween } from '../lib/shared'
import { useFinancasStore } from '../context/financasStore'
import type { ExpectedEvent, ExpectedEventKind, ExpectedEventRecurrence, GoalSummary } from '../types'
import { CHART_PALETTE, RECURRENCE_LABELS } from '../types/constants'

// ---------------------------------------------------------------------------
// Futuro.
//
// O orçamento mensal só enxerga o mês que se repete. 13º, bônus, férias, IPTU e
// seguro são dinheiro que você já sabe que vem — e mudam completamente a
// resposta para "eu chego na minha meta até dezembro?". Aqui eles viram
// ocorrências datadas e alimentam uma projeção de patrimônio.
// ---------------------------------------------------------------------------

const HORIZONS = [12, 18, 24, 36]

/** Próxima vez que o evento acontece, a partir do mês corrente. */
function nextOccurrence(event: ExpectedEvent, from: string): string | null {
  for (let index = 0; index < 120; index += 1) {
    const month = addMonths(from, index)
    if (occursIn(event, month)) return month
  }
  return null
}

function EventForm({ onClose }: { onClose: () => void }) {
  const { forecast } = useFinancasStore()
  const [kind, setKind] = useState<ExpectedEventKind>('income')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [month, setMonth] = useState(monthKey())
  const [recurrence, setRecurrence] = useState<ExpectedEventRecurrence>('yearly')
  const [savedPct, setSavedPct] = useState(100)

  const handleAdd = () => {
    if (!name.trim() || amount <= 0) return
    forecast.addEvent({ name, kind, amount, month, recurrence, savedPct })
    setName('')
    setAmount(0)
    onClose()
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dark-border bg-dark-surface/60 p-3">
      <div className="flex flex-wrap gap-1.5">
        {EVENT_SUGGESTIONS.filter((item) => !forecast.events.some((e) => e.name === item.name)).map(
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
        )}
      </div>

      <SegmentedControl
        options={[
          { value: 'income' as ExpectedEventKind, label: 'Entra dinheiro' },
          { value: 'expense' as ExpectedEventKind, label: 'Sai dinheiro' },
        ]}
        value={kind}
        onChange={setKind}
        className="sm:max-w-80"
      />

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
          <span className="mb-1 block text-xs text-dark-text-muted">Mês</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || monthKey())}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Repete</span>
          <SegmentedControl
            options={(Object.keys(RECURRENCE_LABELS) as ExpectedEventRecurrence[]).map((value) => ({
              value,
              label: RECURRENCE_LABELS[value],
            }))}
            value={recurrence}
            onChange={setRecurrence}
            className="h-[46px] items-center"
          />
        </label>
      </div>

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

      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || amount <= 0}>
          <Plus size={15} />
          Adicionar
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </div>
  )
}

function EventRow({ event, currentMonth }: { event: ExpectedEvent; currentMonth: string }) {
  const { forecast } = useFinancasStore()
  const next = nextOccurrence(event, currentMonth)
  const monthsAway = next ? monthsBetween(currentMonth, next) : null
  const isIncome = event.kind === 'income'

  return (
    <li className="group flex items-center gap-3 rounded-lg bg-dark-surface px-3 py-2.5">
      <span
        className={`shrink-0 rounded-md p-1.5 ${
          isIncome ? 'bg-primary-500/10 text-primary-400' : 'bg-rose-500/10 text-rose-400'
        }`}
      >
        {isIncome ? <Gift size={14} /> : <CalendarClock size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-dark-text">{event.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
          {next ? (
            <>
              {formatMonthKey(next)}
              {monthsAway !== null && monthsAway > 0 && ` · em ${formatMonths(monthsAway)}`}
              {monthsAway === 0 && ' · este mês'}
            </>
          ) : (
            'já passou'
          )}
          {event.recurrence !== 'once' && (
            <Tag>
              <Repeat size={10} />
              {RECURRENCE_LABELS[event.recurrence]}
            </Tag>
          )}
          {isIncome && (event.savedPct ?? 100) < 100 && <Tag>guarda {event.savedPct}%</Tag>}
        </p>
      </div>
      <div className="w-32 shrink-0">
        <CurrencyInput
          value={event.amount}
          onChange={(value) => forecast.updateEvent(event.id, { amount: value })}
          className="!py-1.5"
        />
      </div>
      <button
        type="button"
        onClick={() => forecast.removeEvent(event.id)}
        className="shrink-0 rounded-md p-1.5 text-dark-text-muted opacity-100 transition-all hover:bg-rose-500/10 hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Remover ${event.name}`}
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
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
  const { assumptions, upcomingYear, currentMonth, events } = forecast
  const [showForm, setShowForm] = useState(false)
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
  const datedGoals = investments.goals.filter((goal) => goal.targetMonth && goal.targetAmount > 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`Saldo projetado em ${formatMonthKey(last?.month ?? currentMonth)}`}
          value={formatCurrency(financialLast)}
          detail={
            real
              ? `${formatCurrency(financialLast - financialNow)} a mais, em reais de hoje`
              : `${formatCurrency(financialLast - financialNow)} a mais que hoje`
          }
          tone="neutral"
        />
        <StatTile
          label="Entradas em 12 meses"
          value={formatCurrency(upcomingYear.income)}
          detail={upcomingYear.income > 0 ? '13º, bônus, férias…' : 'nada cadastrado ainda'}
          tone="neutral"
        />
        <StatTile
          label="Saídas em 12 meses"
          value={formatCurrency(upcomingYear.expense)}
          detail={upcomingYear.expense > 0 ? 'IPTU, IPVA, seguro…' : 'nada cadastrado ainda'}
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

      {datedGoals.length > 0 && (
        <Panel padded={false} className="overflow-hidden">
          <div className="border-b border-dark-border-subtle px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-dark-text">
              <Flag size={15} className="text-dark-text-muted" />
              Metas com prazo
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

      <Panel>
        <PanelHeader
          title="Entradas e saídas esperadas"
          icon={<Sparkles size={16} />}
          description="Dinheiro que você já sabe que vem ou vai — 13º em dezembro, bônus em março, IPVA em janeiro."
          actions={
            !showForm && (
              <SecondaryButton onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Novo evento
              </SecondaryButton>
            )
          }
        />

        {showForm && <EventForm onClose={() => setShowForm(false)} />}

        <div className="mt-4">
          {events.length === 0 ? (
            <EmptyState
              icon={<CalendarClock size={24} />}
              title="Nada previsto ainda"
              action={
                !showForm && (
                  <PrimaryButton onClick={() => setShowForm(true)}>
                    <Plus size={15} />
                    Cadastrar o primeiro
                  </PrimaryButton>
                )
              }
            >
              Seu orçamento só conhece o mês que se repete. Cadastre o que cai fora dele e a
              projeção passa a responder se você chega na meta — e o caixa do mês passa a avisar
              quando um IPVA está chegando.
            </EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {events.map((event) => (
                <EventRow key={event.id} event={event} currentMonth={currentMonth} />
              ))}
            </ul>
          )}
        </div>

        {upcomingYear.net !== 0 && (
          <p className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
            Nos próximos 12 meses, o saldo desses eventos é{' '}
            <strong className={upcomingYear.net >= 0 ? 'text-primary-400' : 'text-rose-400'}>
              {upcomingYear.net >= 0 ? '+' : '−'} {formatCurrency(Math.abs(upcomingYear.net))}
            </strong>
            , dos quais {formatCurrency(Math.max(0, upcomingYear.saved))} viram patrimônio na
            projeção. Isso equivale a{' '}
            <strong className="text-dark-text">
              {formatCurrency(Math.max(0, upcomingYear.saved) / 12)}
            </strong>{' '}
            por mês de aporte extra — a partir de {formatMonthLong(currentMonth)}.
          </p>
        )}
      </Panel>
    </div>
  )
}
