import type { CreditCardAccount } from '../types'
import type { LegacyInvoiceIdentification, PaidInvoiceSnapshot } from '../lib/cardCycleAccounting'
import { legacyInvoiceId } from '../lib/cardCycleAccounting'
import { legacyInvoiceIdentificationError } from '../lib/legacyInvoiceIdentification'
import { uid } from '../lib/shared'
import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'

export function identifyLegacyInvoice(document: RepositoryDocument, invoiceId: string, identification: LegacyInvoiceIdentification): RepositoryDocument {
  const invoices = document.collections.cardPaidInvoices as PaidInvoiceSnapshot[] ?? []
  const invoice = invoices.find((row) => legacyInvoiceId(row) === invoiceId && !row.accountId)
  if (!invoice) throw new Error('O pagamento antigo não está mais disponível. Reabra a identificação.')
  const accounts = document.collections.cardAccounts as CreditCardAccount[] ?? []
  const error = legacyInvoiceIdentificationError(identification, new Set(accounts.map((row) => row.id)), invoice.total, invoice.personalTotal)
  if (error) throw new Error(error)
  return { ...document, collections: { ...document.collections,
    cardPaidInvoices: invoices.map((row) => row === invoice ? { ...row, identification } : row),
  } }
}

export function saveLegacyInvoiceIdentification(invoiceId: string, identification: LegacyInvoiceIdentification, expectedRevision: string | null) {
  return runRepositoryCommand({ id: uid(), expectedRevision,
    apply: (document) => identifyLegacyInvoice(document, invoiceId, identification) })
}
