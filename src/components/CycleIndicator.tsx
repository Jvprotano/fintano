import { formatMonthKey } from '../lib/format'
import { useFinancasStore } from '../context/financasStore'

export function CycleIndicator() {
  const { activeCycle } = useFinancasStore()

  return (
    <div className="flex h-10 items-center gap-1.5 rounded-xl border border-dark-border/80 bg-dark-surface/55 px-3 text-sm shadow-sm shadow-black/15">
      <span className="text-xs text-dark-text-muted">Ciclo</span>
      <strong className="font-medium tabular-nums text-dark-text-secondary">{formatMonthKey(activeCycle.month)}</strong>
    </div>
  )
}
