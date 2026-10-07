import type { CreditCardAccount, CreditCardEntry } from '../types'
import type { PaidInvoiceSnapshot } from './cardCycleAccounting'
import { summarizeInvoiceEntries } from './cardCycleAccounting'
import { addMonths } from './shared'
import { carryUnappliedCredits } from './creditCards'

export type CycleCardEntry = CreditCardEntry & { paidAt?: string }

/** A consulta segue a competência, nunca o avanço individual de um cartão. */
export function cardEntriesForCycle(entries: CreditCardEntry[], paid: PaidInvoiceSnapshot[], accounts: CreditCardAccount[], month: string): CycleCardEntry[] {
  const currentDue = addMonths(month, 1)
  const nextDue = addMonths(month, 2)
  const result: CycleCardEntry[] = []
  for (const dueMonth of [currentDue, nextDue]) {
    const cycle = dueMonth === currentDue ? 'current' : 'next'
    for (const account of accounts) {
      const snapshot = paid.find((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)
      const rows = snapshot ? snapshot.entries ?? [] : entries.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)
      result.push(...rows.map((entry) => ({ ...entry, cardName: account.name, cycle: cycle as CreditCardEntry['cycle'], paidAt: snapshot?.paidAt })))
    }
  }
  return result
}

/** Inclui anteriores em aberto, para revisar exatamente o que será pago no fechamento. */
export function pendingCardInvoices(entries: CreditCardEntry[], paid: PaidInvoiceSnapshot[], accounts: CreditCardAccount[], throughDueMonth: string) {
  return accounts.flatMap((account) => {
    const result: { accountId: string; cardName: string; dueMonth: string; total: number; known: boolean }[] = []
    let carried: CreditCardEntry[] = []
    let dueMonth = account.currentDueMonth ?? throughDueMonth
    while (dueMonth <= throughDueMonth) {
      if (!paid.some((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)) {
        const original = entries.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)
        const rows = [...original, ...carried]
        result.push({ accountId: account.id, cardName: account.name, dueMonth,
          total: summarizeInvoiceEntries(rows).total,
          known: original.length > 0 || account.confirmedEmptyDueMonths?.includes(dueMonth) === true })
        carried = carryUnappliedCredits(rows.map((entry) => ({ ...entry, cycle: 'current' })))
      } else {
        carried = []
      }
      dueMonth = addMonths(dueMonth, 1)
    }
    return result
  })
}
