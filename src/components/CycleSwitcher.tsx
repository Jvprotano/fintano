import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthKey } from '../lib/format'
import { shiftCycleMonth } from '../lib/activeCycle'
import { useFinancasStore } from '../context/financasStore'
import { ConfirmationDialog } from './ui'

/**
 * Chip discreto do ciclo ativo no header — mesma altura do seletor de cenário.
 * Ajuste fino mora no hub Ciclo; aqui só um atalho raro.
 */
export function CycleSwitcher() {
  const { activeCycle } = useFinancasStore()
  const { cycle, shiftCycle } = activeCycle
  const [pendingDirection, setPendingDirection] = useState<-1 | 1 | null>(null)
  const targetMonth = pendingDirection === null ? '' : shiftCycleMonth(cycle.month, pendingDirection)

  return (
    <div
      className="flex h-10 items-center rounded-xl border border-dark-border/80 bg-dark-surface/55 px-1 text-sm text-dark-text-muted shadow-sm shadow-black/15"
      title={`Ciclo ${cycle.month}`}
    >
      <button
        type="button"
        onClick={() => setPendingDirection(-1)}
        className="rounded-lg p-1.5 transition-colors hover:bg-dark-hover hover:text-dark-text"
        aria-label="Ativar ciclo anterior"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="min-w-[4.5rem] px-0.5 text-center tabular-nums">
        <span className="text-xs text-dark-text-muted/70">Ciclo </span>
        <strong className="font-medium text-dark-text-secondary">{formatMonthKey(cycle.month)}</strong>
      </span>
      <button
        type="button"
        onClick={() => setPendingDirection(1)}
        className="rounded-lg p-1.5 transition-colors hover:bg-dark-hover hover:text-dark-text"
        aria-label="Ativar próximo ciclo"
      >
        <ChevronRight size={14} />
      </button>
      <ConfirmationDialog open={pendingDirection !== null} title="Alterar a competência ativa?"
        description={`Isso fará de ${formatMonthKey(targetMonth)} o ciclo operacional para novos lançamentos e edições. Para consultar meses fechados, use Histórico.`}
        confirmLabel="Ativar ciclo" onClose={() => setPendingDirection(null)}
        onConfirm={() => { if (pendingDirection !== null) shiftCycle(pendingDirection); setPendingDirection(null) }} />
    </div>
  )
}
