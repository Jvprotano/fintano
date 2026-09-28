import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HistoryPoint } from '../../types'
import { CHART_PALETTE } from '../../types/constants'
import { formatCurrency, formatCurrencyShort, formatMonthKey } from '../../lib/format'
import { SegmentedControl } from '../ui'

type Metric = 'costs' | 'wants' | 'card' | 'invested'

const METRICS: Record<
  Metric,
  {
    label: string
    planned: (point: HistoryPoint) => number
    actual: (point: HistoryPoint) => number
    actualIsGood: (planned: number, actual: number) => boolean
  }
> = {
  costs: {
    label: 'Custos',
    planned: (point) => point.costsPlanned,
    actual: (point) => point.costs,
    actualIsGood: (planned, actual) => actual <= planned + 0.005,
  },
  wants: {
    label: 'Desejos em conta',
    planned: (point) => point.wantsPlanned,
    actual: (point) => point.wants,
    actualIsGood: (planned, actual) => actual <= planned + 0.005,
  },
  card: {
    label: 'Cartão',
    planned: (point) => point.cardPlanned,
    actual: (point) => point.cardPersonalTotal,
    actualIsGood: (planned, actual) => actual <= planned + 0.005,
  },
  invested: {
    label: 'Investimentos',
    planned: (point) => point.investedPlanned,
    actual: (point) => point.invested,
    actualIsGood: (planned, actual) => actual + 0.005 >= planned,
  },
}

export function PlanActualChart({ points }: { points: HistoryPoint[] }) {
  const [metric, setMetric] = useState<Metric>('card')
  const config = METRICS[metric]
  const data = useMemo(
    () =>
      points.slice(-12).map((point) => {
        const planned = config.planned(point)
        const actual = config.actual(point)
        return {
          month: formatMonthKey(point.month),
          planned,
          actual,
          withinPlan: config.actualIsGood(planned, actual),
        }
      }),
    [config, points],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={(Object.keys(METRICS) as Metric[]).map((key) => ({
            value: key,
            label: METRICS[key].label,
          }))}
          value={metric}
          onChange={setMetric}
          className="w-full sm:w-[390px]"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dark-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-dark-text-muted/60" /> Planejado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-primary-500" /> Dentro da meta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-rose-400" /> Fora da meta
          </span>
        </div>
      </div>

      <div className="h-64 min-w-0" role="img" aria-label={`${config.label}: planejado e realizado por mês`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 10 }}
            />
            <YAxis
              width={62}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 10 }}
              tickFormatter={formatCurrencyShort}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.035)' }}
              contentStyle={{
                background: 'var(--color-dark-surface)',
                border: '1px solid var(--color-dark-border)',
                borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
              }}
              itemStyle={{ color: 'var(--color-dark-text-secondary)', fontSize: 12 }}
              labelStyle={{ color: 'var(--color-dark-text)', fontSize: 11, marginBottom: 6 }}
              formatter={(value, name) => [
                formatCurrency(Number(value ?? 0)),
                name === 'planned' ? 'Planejado' : 'Realizado',
              ]}
            />
            <Bar dataKey="planned" fill={CHART_PALETTE.muted} fillOpacity={0.55} radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.month}
                  fill={entry.withinPlan ? CHART_PALETTE.aqua : CHART_PALETTE.red}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-dark-text-muted">
        Últimos {data.length} {data.length === 1 ? 'mês fechado' : 'meses fechados'}. Em investimentos,
        superar a meta é positivo; em custos, Desejos e cartão, ficar abaixo do limite é positivo.
      </p>
    </div>
  )
}
