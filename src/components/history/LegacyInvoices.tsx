import { useState } from 'react'
import { useCardsStore } from '../../context/financasStore'
import { formatCurrency, formatDate, formatMonthLong } from '../../lib/format'
import { Panel, SecondaryButton } from '../ui'
import { LegacyInvoiceForm } from './LegacyInvoiceForm'
import { legacyInvoiceId } from '../../lib/cardCycleAccounting'

export function LegacyInvoices() {
  const { paidInvoices, accounts } = useCardsStore()
  const [editing, setEditing] = useState<string | null>(null)
  const invoices = paidInvoices.filter((invoice) => !invoice.accountId)
    .sort((a, b) => b.dueMonth.localeCompare(a.dueMonth))
  if (invoices.length === 0) return null
  return (
    <Panel>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-dark-text">
          Faturas antigas · identificação por cartão ({invoices.length})
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-dark-text-muted">Estes pagamentos já foram registrados. O mês indica o vencimento, não o ciclo ativo nem uma fatura ainda aberta. A data mostra quando o pagamento foi registrado. Identifique os valores por cartão para incluí-los na aba Dados; isso não registra outro pagamento nem altera o caixa.</p>
        <div className="mt-3 space-y-2">{invoices.map((invoice) => (
          <div key={legacyInvoiceId(invoice)} className="rounded-lg bg-dark-surface p-4 text-sm text-dark-text-secondary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-semibold text-dark-text">Vencimento: {formatMonthLong(invoice.dueMonth)}</p>
                <p className="mt-1 text-xs">Paga · registrada em {formatDate(invoice.paidAt)} · {invoice.identification ? 'Identificada por cartão' : 'Sem identificação por cartão'}</p></div>
              <span className="tabular-nums">{invoice.total === null ? 'Total desconhecido' : formatCurrency(invoice.total)} · minha parte {formatCurrency(invoice.personalTotal)}</span>
              {editing !== legacyInvoiceId(invoice) && <SecondaryButton onClick={() => setEditing(legacyInvoiceId(invoice))}>{invoice.identification ? 'Editar identificação' : 'Identificar cartões e pessoas'}</SecondaryButton>}
            </div>
            {invoice.identification && <div className="mt-3 space-y-1 text-xs">
              {invoice.identification.cards.map((row) => <p key={row.accountId}>{accounts.find((account) => account.id === row.accountId)?.name} · total {formatCurrency(row.total)} · minha parte {formatCurrency(row.personalTotal)}{row.others.map((person) => ` · ${person.name} ${formatCurrency(person.amount)}`).join('')}</p>)}
              <p className="text-dark-text-muted">Informado em {formatDate(invoice.identification.recordedAt)} · {invoice.identification.reason}</p>
            </div>}
            {invoice.calendarAdjustments?.map((row) => <p key={row.id} className="w-full text-xs text-dark-text-muted">Diferença de calendário registrada: {formatCurrency(row.personalDelta)} pessoais · {row.reason}. O caixa acompanha os fatos desse cartão; o original acima foi preservado.</p>)}
            {editing === legacyInvoiceId(invoice) && <LegacyInvoiceForm invoice={invoice} accounts={accounts} onClose={() => setEditing(null)} />}
          </div>
        ))}</div>
      </details>
    </Panel>
  )
}
