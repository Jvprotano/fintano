import type { CreditCardAccount, CreditCardEntry } from '../types'
import type { PaidInvoiceSnapshot } from './cardCycleAccounting'
import { summarizeInvoiceEntries } from './cardCycleAccounting'
import { cardDueMonthForCycle } from './cardCalendar'
import { addMonths } from './shared'

export type CardDataMetric = 'personalTotal' | 'total'

export interface CardDataInvoice {
  accountId: string
  dueMonth: string
  personalTotal: number
  total: number | null
  paid: boolean
}

/** Leitura de faturas identificadas, sem reconstruir ou repartir agregados antigos. */
export function buildCardDataInvoices(
  accounts: CreditCardAccount[],
  entries: CreditCardEntry[],
  paidInvoices: PaidInvoiceSnapshot[],
  activeCycle: string,
): CardDataInvoice[] {
  const invoices = new Map<string, CardDataInvoice>()
  for (const account of accounts) {
    // A próxima parcela automática não é uma fatura histórica.
    const through = cardDueMonthForCycle(account, activeCycle)
    const groups = new Map<string, CreditCardEntry[]>()
    for (const entry of entries) {
      if (entry.accountId !== account.id || !entry.dueMonth || entry.dueMonth > through) continue
      const rows = groups.get(entry.dueMonth) ?? []
      rows.push(entry)
      groups.set(entry.dueMonth, rows)
    }
    for (const month of account.confirmedEmptyDueMonths ?? []) {
      if (month <= through && !groups.has(month)) groups.set(month, [])
    }
    for (const [dueMonth, rows] of groups) {
      invoices.set(`${account.id}:${dueMonth}`, {
        accountId: account.id, dueMonth, ...summarizeInvoiceEntries(rows), paid: false,
      })
    }
  }
  // O pagamento preservado prevalece sobre qualquer composição ainda em memória.
  for (const invoice of [...paidInvoices].sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    if (!invoice.accountId || !accounts.some((account) => account.id === invoice.accountId)) continue
    invoices.set(`${invoice.accountId}:${invoice.dueMonth}`, {
      accountId: invoice.accountId, dueMonth: invoice.dueMonth,
      personalTotal: invoice.personalTotal, total: invoice.total, paid: true,
    })
  }
  return [...invoices.values()].sort((a, b) => a.dueMonth.localeCompare(b.dueMonth) || a.accountId.localeCompare(b.accountId))
}

export function cardDataMonths(start: string, end: string): string[] {
  const months: string[] = []
  for (let month = start; month <= end; month = addMonths(month, 1)) months.push(month)
  return months
}

/** Compara apenas meses vizinhos conhecidos; lacuna e base zero não viram percentuais. */
export function cardInvoiceChange(latest: CardDataInvoice, previous: CardDataInvoice | undefined, metric: CardDataMetric) {
  if (!previous || previous.dueMonth !== addMonths(latest.dueMonth, -1)) return null
  const current = latest[metric], before = previous[metric]
  if (current === null || before === null) return null
  const delta = Math.round((current - before) * 100) / 100
  return { delta, percent: before > 0 ? delta / before * 100 : null }
}
