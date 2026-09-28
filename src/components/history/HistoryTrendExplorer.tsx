import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HistoryPoint } from '../../types'
import { CHART_PALETTE } from '../../types/constants'
import {
  buildHistoryTrendPoints,
  type HistoryTrendPeriod,
  type HistoryTrendPoint,
} from '../../lib/historyTrends'
import {
  formatCurrency,
  formatCurrencyShort,
  formatMonthKey,
} from '../../lib/format'
import { Panel, PanelHeader, SegmentedControl } from '../ui'

type TrendView = 'cycle' | 'cumulative' | 'rate'
type CurrencySeries = 'invested' | 'employerInvested' | 'costs' | 'card' | 'wants'

interface SeriesDefinition {
  id: CurrencySeries
  label: string
  color: string
}

const CURRENCY_SERIES: SeriesDefinition[] = [
  { id: 'invested', label: 'Aportes pessoais', color: CHART_PALETTE.aqua },
  { id: 'employerInvested', label: 'Contrapartida', color: CHART_PALETTE.green },
  { id: 'costs', label: 'Custos', color: CHART_PALETTE.blue },
  { id: 'card', label: 'Fatura', color: CHART_PALETTE.muted },
  { id: 'wants', label: 'Desejos em conta', color: CHART_PALETTE.violet },
]

const VIEW_OPTIONS = [
  { value: 'cycle' as const, label: 'Por ciclo' },
  { value: 'cumulative' as const, label: 'Acumulado' },
  { value: 'rate' as const, label: '% da renda' },
]

const PERIOD_OPTIONS = [
  { value: 6 as const, label: '6m' },
  { value: 12 as const, label: '12m' },
  { value: 'all' as const, label: 'Tudo' },
]

function chartDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = Math.max(1, max - min)
  return [min < 0 ? min - span * 0.08 : 0, max + span * 0.1]
}

function viewDescription(view: TrendView) {
  if (view === 'cumulative') {
    return 'Total creditado acumulado: aportes pessoais mais contrapartida. Não inclui valorização nem saldo inicial.'
  }
  if (view === 'rate') {
    return 'Percentual da renda do ciclo destinado a aportes, incluindo previdência em folha.'
  }
  return 'Fluxos realizados em reais. Ative apenas as séries que deseja comparar.'
}

export function HistoryTrendExplorer({ points }: { points: HistoryPoint[] }) {
  const [view, setView] = useState<TrendView>('cycle')
  const [period, setPeriod] = useState<HistoryTrendPeriod>(12)
  const [selectedSeries, setSelectedSeries] = useState<CurrencySeries[]>([
    'invested',
    'employerInvested',
  ])
  const data = useMemo(() => buildHistoryTrendPoints(points, period), [period, points])

  const activeSeries = useMemo(() => {
    if (view === 'cumulative') {
      return [{ id: 'cumulativeCredited', label: 'Total creditado acumulado', color: CHART_PALETTE.aqua }]
    }
    if (view === 'rate') {
      return [{ id: 'savingsRate', label: '% da renda', color: CHART_PALETTE.aqua }]
    }
    return CURRENCY_SERIES.filter((series) => selectedSeries.includes(series.id))
  }, [selectedSeries, view])

  const values = data
    .flatMap((point) => activeSeries.map((series) => point[series.id as keyof HistoryTrendPoint]))
    .filter((value): value is number => typeof value === 'number')
  const domain = chartDomain(values)
  const isRate = view === 'rate'

  const toggleSeries = (series: CurrencySeries) => {
    setSelectedSeries((current) => {
      if (!current.includes(series)) return [...current, series]
      if (current.length === 1) return current
      return current.filter((item) => item !== series)
    })
  }

  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="Evolução ao longo do tempo"
        icon={<Activity size={16} />}
        description="Explore os ciclos fechados sem misturar aportes com patrimônio imobiliário."
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-dark-text-muted">
            Visão
          </span>
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            className="w-full"
          />
        </div>
        <div className="w-full sm:w-44">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-dark-text-muted">
            Período
          </span>
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            className="w-full"
          />
        </div>
      </div>

      {view === 'cycle' && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Séries do gráfico">
          {CURRENCY_SERIES.map((series) => {
            const selected = selectedSeries.includes(series.id)
            return (
              <button
                key={series.id}
                type="button"
                onClick={() => toggleSeries(series.id)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selected
                    ? 'border-dark-border bg-dark-hover text-dark-text'
                    : 'border-dark-border-subtle bg-transparent text-dark-text-muted hover:text-dark-text-secondary'
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: selected ? series.color : CHART_PALETTE.muted }}
                />
                {series.label}
              </button>
            )
          })}
        </div>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-dark-text-muted">
        {viewDescription(view)}
      </p>

      <div
        className="mt-2 h-60 min-w-0"
        role="img"
        aria-label={`Gráfico de linhas: ${activeSeries.map((series) => series.label).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 2, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 10 }}
              tickFormatter={formatMonthKey}
            />
            <YAxis
              width={64}
              domain={domain}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 10 }}
              tickFormatter={(value) => isRate ? `${Number(value).toFixed(0)}%` : formatCurrencyShort(Number(value))}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-dark-surface)',
                border: '1px solid var(--color-dark-border)',
                borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
              }}
              itemStyle={{ color: 'var(--color-dark-text-secondary)', fontSize: 12 }}
              labelStyle={{ color: 'var(--color-dark-text)', fontSize: 11, marginBottom: 6 }}
              labelFormatter={(month) => formatMonthKey(String(month))}
              formatter={(value, name) => [
                isRate ? `${Number(value ?? 0).toFixed(1)}%` : formatCurrency(Number(value ?? 0)),
                String(name),
              ]}
            />
            {activeSeries.map((series) => (
              <Line
                key={series.id}
                type="linear"
                dataKey={series.id}
                name={series.label}
                stroke={series.color}
                strokeWidth={series.id === 'invested' || series.id === 'employerInvested' || view !== 'cycle' ? 2.6 : 1.8}
                strokeOpacity={series.id === 'invested' || series.id === 'employerInvested' || view !== 'cycle' ? 1 : 0.78}
                dot={{ r: 3, fill: series.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
