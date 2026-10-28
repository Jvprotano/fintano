import type { CycleCardEntry } from './cardCycleView'

/** Totais da consulta em centavos, com pagamentos e créditos separados das compras. */
export function cardEntryTotals(entries: CycleCardEntry[]) {
  const totals = { purchases: 0, prepaid: 0, paid: 0, appliedCredits: 0, due: 0, personalDue: 0, thirdPartyDue: 0 }
  const invoices = new Map<string, { amount: number; personal: number; credits: number; paid: boolean }>()

  for (const entry of entries) {
    const amount = Math.round(entry.amount * 100)
    const credit = entry.entryType === 'invoiceCredit'
    if (!credit) {
      totals.purchases += amount
      if (entry.isPrepaid) {
        totals.prepaid += amount
        continue
      }
    }
    const key = JSON.stringify([entry.accountId ?? entry.cardName, entry.dueMonth ?? entry.cycle, !!entry.paidAt])
    const invoice = invoices.get(key) ?? { amount: 0, personal: 0, credits: 0, paid: !!entry.paidAt }
    if (credit) invoice.credits += amount
    else {
      invoice.amount += amount
      invoice.personal += Math.round(entry.personalAmount * 100)
    }
    invoices.set(key, invoice)
  }

  for (const invoice of invoices.values()) {
    const applied = Math.min(invoice.personal, invoice.credits)
    totals.appliedCredits += applied
    if (invoice.paid) totals.paid += invoice.amount - applied
    else {
      totals.due += invoice.amount - applied
      totals.personalDue += invoice.personal - applied
      totals.thirdPartyDue += invoice.amount - invoice.personal
    }
  }
  return totals
}
