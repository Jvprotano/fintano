import type { CreditCardEntry, ExpectedEvent, ExpectedOccurrence, ForecastFund, MonthlyActuals } from '../types'
import type { PaidInvoiceSnapshot } from './cardCycleAccounting'
import { occurrencesInRange } from './forecast'
import { addMonths, monthsBetween } from './shared'

export interface ReconciledOccurrence extends ExpectedOccurrence {
  paidAmount: number
  remainingAmount: number
  status: 'pending' | 'partial' | 'scheduled' | 'settled' | 'overdue'
}

export function reconcileOccurrence(
  occurrence: ExpectedOccurrence,
  actuals: MonthlyActuals[],
  today: string,
  cards: CreditCardEntry[] = [],
  paidInvoices: PaidInvoiceSnapshot[] = [],
): ReconciledOccurrence {
  const field = occurrence.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const actualPaid = actuals.reduce((sum, cycle) => sum + cycle[field]
    .filter((entry) => entry.sourceOccurrenceId === occurrence.id ||
      (!entry.sourceOccurrenceId && entry.sourceEventId === occurrence.event.id &&
        cycle.month === occurrence.originalMonth))
    .reduce((subtotal, entry) => subtotal + entry.amount, 0), 0)
  const cardPaid = occurrence.event.cashTreatment === 'card'
    ? paidInvoices.flatMap((invoice) => invoice.forecastOccurrences ?? [])
      .filter((item) => item.id === occurrence.id)
      .reduce((sum, item) => sum + item.amount, 0)
    : 0
  const plannedPaid = occurrence.event.cashTreatment === 'planned'
    ? occurrence.event.occurrenceOverrides?.[occurrence.originalMonth]?.realizedAmount ?? 0 : 0
  const paidAmount = actualPaid + cardPaid + plannedPaid
  const remainingAmount = Math.max(0, occurrence.amount - paidAmount)
  const overdue = occurrence.date ? occurrence.date < today : occurrence.month < today.slice(0, 7)
  const status = remainingAmount <= 0.005 ? 'settled'
    : paidAmount > 0.005 ? 'partial'
    : cards.some((entry) => entry.sourceForecastOccurrenceId === occurrence.id) ? 'scheduled'
    : overdue ? 'overdue' : 'pending'
  return { ...occurrence, paidAmount, remainingAmount, status }
}

export function upcomingOccurrences(
  events: ExpectedEvent[],
  actuals: MonthlyActuals[],
  startMonth: string,
  months: number,
  today: string,
  cards: CreditCardEntry[] = [],
  paidInvoices: PaidInvoiceSnapshot[] = [],
): ReconciledOccurrence[] {
  return occurrencesInRange(events, startMonth, months)
    .map((occurrence) => reconcileOccurrence(occurrence, actuals, today, cards, paidInvoices))
    .sort((a, b) => (a.date ?? `${a.month}-99`).localeCompare(b.date ?? `${b.month}-99`))
}

function conservativeDate(occurrence: ExpectedOccurrence): string {
  if (occurrence.event.kind === 'expense' && occurrence.event.cashTreatment === 'card') {
    const dueMonth = cardDueMonthForOccurrence(occurrence)
    if (dueMonth) return `${dueMonth}-01`
  }
  if (occurrence.date) return occurrence.date
  if (occurrence.event.kind === 'expense') return `${occurrence.month}-01`
  const [year, month] = occurrence.month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${occurrence.month}-${String(lastDay).padStart(2, '0')}`
}

export function cardDueMonthForOccurrence(occurrence: ExpectedOccurrence): string | null {
  if (occurrence.event.cashTreatment !== 'card' || !occurrence.event.cardDueMonth) return null
  return addMonths(occurrence.month, monthsBetween(occurrence.event.month, occurrence.event.cardDueMonth))
}

export interface FundingOutlook {
  fundId: string | null
  fundName: string
  reservedAmount: number
  pendingExpenses: number
  confirmedIncome: number
  expectedIncome: number
  requiredMonthlyBase: number
  requiredMonthlyIfReceived: number
  immediateShortfallBase: number
  immediateShortfallIfReceived: number
  firstUncoveredDate: string | null
  firstUncoveredAmount: number
  monthOnly: boolean
}

/** Recursos atribuídos ao grupo até a data, sem supor novos depósitos mensais. */
export function coverageAtDate(
  fund: ForecastFund | null,
  occurrences: ReconciledOccurrence[],
  date: string,
) {
  let base = Math.max(0, fund?.reservedAmount ?? 0)
  let ifReceived = base
  const relevant = occurrences
    .filter((item) => (item.event.groupId ?? null) === (fund?.id ?? null) &&
      item.remainingAmount > 0.005 &&
      (item.event.kind === 'income' || item.event.cashTreatment !== 'planned') &&
      conservativeDate(item) <= date)
    .sort((a, b) => conservativeDate(a).localeCompare(conservativeDate(b)) ||
      (a.event.kind === 'expense' ? -1 : 1))
  for (const item of relevant) {
    if (item.event.kind === 'expense') {
      base -= item.remainingAmount
      ifReceived -= item.remainingAmount
    } else {
      ifReceived += item.remainingAmount
      if (item.event.confirmed) base += item.remainingAmount
    }
  }
  return { base, ifReceived, hasMonthOnly: relevant.some((item) => !item.date) }
}

/** Depósitos são assumidos no primeiro dia dos meses seguintes ao atual. */
export function calculateFundingOutlook(
  fund: ForecastFund | null,
  occurrences: ReconciledOccurrence[],
  today: string,
): FundingOutlook {
  const relevant = occurrences.filter((item) =>
    (item.event.groupId ?? null) === (fund?.id ?? null) &&
    item.remainingAmount > 0.005 &&
    (item.event.kind === 'income' || item.event.cashTreatment !== 'planned'),
  )
  const dated = relevant.map((item) => ({ item, date: conservativeDate(item) < today ? today : conservativeDate(item) }))
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.item.event.kind === 'expense' ? -1 : 1))
  const reservedAmount = Math.max(0, fund?.reservedAmount ?? 0)
  let baseBalance = reservedAmount
  let optimisticBalance = reservedAmount
  let requiredMonthlyBase = 0
  let requiredMonthlyIfReceived = 0
  let immediateShortfallBase = 0
  let immediateShortfallIfReceived = 0
  let firstUncoveredDate: string | null = null
  let firstUncoveredAmount = 0
  const currentMonth = today.slice(0, 7)

  for (const { item, date } of dated) {
    if (item.event.kind === 'income') {
      optimisticBalance += item.remainingAmount
      if (item.event.confirmed) baseBalance += item.remainingAmount
      continue
    }
    baseBalance -= item.remainingAmount
    optimisticBalance -= item.remainingAmount
    const deposits = Math.max(0, monthsBetween(currentMonth, date.slice(0, 7)))
    if (baseBalance < -0.005) {
      if (firstUncoveredDate === null) {
        firstUncoveredDate = date
        firstUncoveredAmount = -baseBalance
      }
      if (deposits === 0) immediateShortfallBase = Math.max(immediateShortfallBase, -baseBalance)
      else requiredMonthlyBase = Math.max(requiredMonthlyBase, -baseBalance / deposits)
    }
    if (optimisticBalance < -0.005) {
      if (deposits === 0) immediateShortfallIfReceived = Math.max(immediateShortfallIfReceived, -optimisticBalance)
      else requiredMonthlyIfReceived = Math.max(requiredMonthlyIfReceived, -optimisticBalance / deposits)
    }
  }

  return {
    fundId: fund?.id ?? null,
    fundName: fund?.name ?? 'Sem grupo',
    reservedAmount,
    pendingExpenses: dated.filter(({ item }) => item.event.kind === 'expense')
      .reduce((sum, { item }) => sum + item.remainingAmount, 0),
    confirmedIncome: dated.filter(({ item }) => item.event.kind === 'income' && item.event.confirmed)
      .reduce((sum, { item }) => sum + item.remainingAmount, 0),
    expectedIncome: dated.filter(({ item }) => item.event.kind === 'income' && !item.event.confirmed)
      .reduce((sum, { item }) => sum + item.remainingAmount, 0),
    requiredMonthlyBase: Math.ceil(requiredMonthlyBase * 100) / 100,
    requiredMonthlyIfReceived: Math.ceil(requiredMonthlyIfReceived * 100) / 100,
    immediateShortfallBase,
    immediateShortfallIfReceived,
    firstUncoveredDate,
    firstUncoveredAmount,
    monthOnly: dated.some(({ item }) => !item.date),
  }
}
