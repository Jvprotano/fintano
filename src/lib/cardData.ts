import type { CreditCardAccount, CreditCardEntry } from '../types'
import type { PaidInvoiceSnapshot } from './cardCycleAccounting'
import { summarizeInvoiceEntries } from './cardCycleAccounting'
import { cardDueMonthForCycle } from './cardCalendar'
import { addMonths, normalizeText } from './shared'

export type CardDataMetric = 'personalTotal' | 'total' | 'nonPersonalTotal' | 'personTotal'

export interface CardDataInvoice {
  accountId: string
  dueMonth: string
  personalTotal: number
  total: number | null
  nonPersonalTotal: number | null
  personTotal: number | null
  paid: boolean
}

const money = (value: number) => Math.round(value * 100) / 100
const owner = (entry: CreditCardEntry) => entry.ownerName?.trim() || entry.ownerNote?.trim() || ''

export function cardDataPeople(entries: CreditCardEntry[], paid: PaidInvoiceSnapshot[]): string[] {
  const names = new Map<string, string>()
  const add = (name: string) => { if (name.trim()) names.set(normalizeText(name), name.trim()) }
  for (const entry of [...entries, ...paid.flatMap((invoice) => invoice.entries ?? [])]) {
    if (entry.entryType !== 'invoiceCredit' && entry.amount > entry.personalAmount) add(owner(entry))
  }
  for (const invoice of paid) for (const card of invoice.identification?.cards ?? []) for (const person of card.others) add(person.name)
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function otherAmounts(rows: CreditCardEntry[] | undefined, total: number | null, personal: number, person: string) {
  const nonPersonalTotal = total === null ? null : money(Math.max(0, total - personal))
  if (nonPersonalTotal === 0) return { nonPersonalTotal, personTotal: 0 }
  const due = rows?.filter((entry) => entry.entryType !== 'invoiceCredit' && !entry.isPrepaid) ?? []
  const otherRows = due.filter((entry) => entry.amount > entry.personalAmount)
  // Sem composição completa ou com valores sem nome, a parte dessa pessoa é desconhecida.
  const complete = rows !== undefined && otherRows.every((entry) => owner(entry)) && nonPersonalTotal !== null &&
    money(otherRows.reduce((sum, entry) => sum + entry.amount - entry.personalAmount, 0)) === nonPersonalTotal
  return { nonPersonalTotal, personTotal: complete ? money(otherRows.reduce((sum, entry) => sum +
    (normalizeText(owner(entry)) === normalizeText(person) ? entry.amount - entry.personalAmount : 0), 0)) : null }
}

/** Leitura de faturas identificadas, sem reconstruir ou repartir agregados antigos. */
export function buildCardDataInvoices(
  accounts: CreditCardAccount[],
  entries: CreditCardEntry[],
  paidInvoices: PaidInvoiceSnapshot[],
  activeCycle: string,
  person = '',
  includeOpen = true,
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
    for (const [dueMonth, rows] of includeOpen ? groups : []) {
      const totals = summarizeInvoiceEntries(rows)
      invoices.set(`${account.id}:${dueMonth}`, {
        accountId: account.id, dueMonth, ...totals, ...otherAmounts(rows, totals.total, totals.personalTotal, person), paid: false,
      })
    }
  }
  // O pagamento preservado prevalece sobre qualquer composição ainda em memória.
  for (const invoice of [...paidInvoices].sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    if (!invoice.accountId || !accounts.some((account) => account.id === invoice.accountId)) continue
    invoices.set(`${invoice.accountId}:${invoice.dueMonth}`, {
      accountId: invoice.accountId, dueMonth: invoice.dueMonth,
      personalTotal: invoice.personalTotal, total: invoice.total, paid: true,
      ...otherAmounts(invoice.entries, invoice.total, invoice.personalTotal, person),
    })
  }
  // A identificação reparte somente o original. Pagamentos posteriores do mesmo cartão/mês são somados na consulta.
  for (const invoice of paidInvoices) {
    if (invoice.accountId) continue
    for (const row of invoice.identification?.cards ?? []) {
      if (!accounts.some((account) => account.id === row.accountId)) continue
      const key = `${row.accountId}:${invoice.dueMonth}`
      const previous = invoices.get(key)
      const personTotal = row.others.reduce((sum, item) => sum + (normalizeText(item.name) === normalizeText(person) ? item.amount : 0), 0)
      const sum = (before: number | null, current: number) => before === null ? null : money(before + current)
      invoices.set(key, { accountId: row.accountId, dueMonth: invoice.dueMonth, paid: previous?.paid ?? true,
        total: sum(previous ? previous.total : 0, row.total), personalTotal: money((previous?.personalTotal ?? 0) + row.personalTotal),
        nonPersonalTotal: sum(previous ? previous.nonPersonalTotal : 0, row.total - row.personalTotal),
        personTotal: sum(previous ? previous.personTotal : 0, personTotal),
      })
    }
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
