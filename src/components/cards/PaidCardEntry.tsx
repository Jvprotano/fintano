import type { CycleCardEntry } from '../../lib/cardCycleView'
import { formatCurrency, formatDate } from '../../lib/format'
import { BUDGET_AREA_SHORT_LABELS } from '../../types/constants'

export function PaidCardEntry({ entry, columns }: { entry: CycleCardEntry; columns?: string }) {
  const status = `Paga na fatura · ${formatDate(entry.paidAt!)}`
  const installment = entry.isRecurring ? 'Assin.' : entry.installmentTotal ? `${entry.installmentCurrent}/${entry.installmentTotal}` : '—'
  if (!columns || entry.entryType === 'invoiceCredit') return <div className="border-b border-dark-border-subtle bg-primary-500/[0.04] px-4 py-3 text-sm">
    <div className="flex justify-between gap-3"><strong>{entry.description} · {installment}</strong><span className="tabular-nums">{entry.entryType ? '− ' : ''}{formatCurrency(entry.amount)}</span></div>
    <p className="mt-1 text-xs text-dark-text-muted">{entry.cardName} · {entry.purchaseDate}</p><p className="mt-1 text-xs text-primary-400">{status}</p>
  </div>
  return <div className={`grid ${columns} items-center gap-2 bg-primary-500/[0.04] px-3 py-3 text-sm`}>
    <div><strong className="block font-medium">{entry.description}</strong><span className="block text-xs text-primary-400">{status}</span></div>
    <span className="text-center text-xs tabular-nums">{installment}</span><span className="text-center text-xs">{entry.purchaseDate}</span><span className="text-center text-xs">{entry.cardName}</span>
    <span className="text-xs text-dark-text-secondary">{entry.budgetArea ? BUDGET_AREA_SHORT_LABELS[entry.budgetArea] : 'Sem área'}</span>
    <span className="text-right tabular-nums">{formatCurrency(entry.amount)}</span><span className="text-right tabular-nums">{formatCurrency(entry.personalAmount)}</span><span className="text-right tabular-nums">{formatCurrency(entry.remainingAmount)}</span>
    <span className="text-xs text-dark-text-muted">{entry.ownerName || entry.ownerNote || '—'}</span><span className="text-center text-xs text-primary-400">Paga</span>
  </div>
}
