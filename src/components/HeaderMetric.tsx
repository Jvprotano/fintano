import { formatCurrency } from '../lib/format'

interface HeaderMetricProps {
  amount: number
  /** Base do percentual — normalmente a base do orçamento. 0 esconde a fatia. */
  baseAmount: number
  label?: string
  tone?: 'primary' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'
  /** Percentual-alvo da área no modelo de orçamento, para comparar com a fatia. */
  targetShare?: number
  /** Sufixo do percentual exibido. */
  baseLabel?: string
}

const toneClass = {
  primary: 'text-primary-400',
  emerald: 'text-primary-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  violet: 'text-violet-400',
  slate: 'text-dark-text-secondary',
}

export function HeaderMetric({
  amount,
  baseAmount,
  label,
  tone = 'primary',
  targetShare,
  baseLabel = 'da base',
}: HeaderMetricProps) {
  const share = baseAmount > 0 ? (amount / baseAmount) * 100 : 0
  const target = targetShare ?? 0
  const hasTarget = target > 0
  // Meio ponto de tolerância: arredondamento não deve pintar a linha de vermelho.
  const over = hasTarget && share - target > 0.5

  return (
    <div className="text-right leading-tight">
      {label && (
        <span className="block text-xs font-medium uppercase tracking-wider text-dark-text-muted">{label}</span>
      )}
      <span className={`block text-sm font-semibold tabular-nums ${toneClass[tone]}`}>
        {formatCurrency(amount)}
      </span>
      {baseAmount > 0 && (
        <span
          className={`block whitespace-nowrap text-xs tabular-nums ${
            over ? 'text-rose-400' : 'text-dark-text-muted'
          }`}
        >
          {share.toFixed(0)}% {baseLabel}
          {hasTarget && ` · meta ${target.toFixed(0)}%`}
        </span>
      )}
    </div>
  )
}
