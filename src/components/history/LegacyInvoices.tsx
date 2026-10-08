import { useCardsStore } from '../../context/financasStore'
import { formatCurrency, formatDate, formatMonthLong } from '../../lib/format'
import { Panel } from '../ui'

export function LegacyInvoices() {
  const { paidInvoices } = useCardsStore()
  const invoices = paidInvoices.filter((invoice) => !invoice.accountId)
    .sort((a, b) => b.dueMonth.localeCompare(a.dueMonth))
  if (invoices.length === 0) return null
  return (
    <Panel>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-dark-text">
          Faturas antigas sem cartão identificado ({invoices.length})
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-dark-text-muted">Pagamentos anteriores preservados. Os dados antigos não permitem identificar o cartão ou recuperar sua composição.</p>
        <div className="mt-3 space-y-2">{invoices.map((invoice) => (
          <div key={invoice.id ?? `legacy-${invoice.dueMonth}`} className="flex flex-wrap justify-between gap-2 rounded-lg bg-dark-surface p-3 text-sm text-dark-text-secondary">
            <span>{formatMonthLong(invoice.dueMonth)} · pago em {formatDate(invoice.paidAt)}</span>
            <span className="tabular-nums">{invoice.total === null ? 'Total desconhecido' : formatCurrency(invoice.total)} · minha parte {formatCurrency(invoice.personalTotal)}</span>
            {invoice.calendarAdjustments?.map((row) => <p key={row.id} className="w-full text-xs text-dark-text-muted">Diferença de calendário registrada: {formatCurrency(row.personalDelta)} pessoais · {row.reason}. O caixa acompanha os fatos desse cartão; o original acima foi preservado.</p>)}
          </div>
        ))}</div>
      </details>
    </Panel>
  )
}
