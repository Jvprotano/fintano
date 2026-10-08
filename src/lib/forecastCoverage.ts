import type { ActualsSummary, CreditCardEntry, ExpectedEvent, ExpectedOccurrence, ForecastFund, ForecastFactLink, LedgerEntry, MonthlyActuals } from '../types'
import type { PaidInvoiceSnapshot } from './cardCycleAccounting'
import { occurrencesInRange, occurrenceFor } from './forecast'
import { addMonths, monthsBetween } from './shared'

export interface ForecastMovementSource { ownerType: 'holding' | 'goal' | 'debt'; ownerId: string; entries: LedgerEntry[] }
export function factLinkKey(link: ForecastFactLink): string {
  return link.type === 'movement' ? 'movement:' + link.ownerType + ':' + link.ownerId + ':' + link.id : link.type === 'card' ? 'card:' + link.id : link.type + ':' + link.month + ':' + link.id
}

export function requiresExtraCash(item: ExpectedOccurrence): boolean {
  return item.event.cashTreatment !== 'planned' && item.event.cashTreatment !== 'card' && !item.event.planLink &&
    !item.event.occurrenceOverrides?.[item.originalMonth]?.links?.some((link) => link.type !== 'cash')
}

/** Um custo vinculado ocupa sua própria verba, incluindo o restante, uma vez. */
export function forecastCostsCommitted(rows: ActualsSummary['rows'], items: ReconciledOccurrence[], month: string): number {
  const expected = new Map<string, number>()
  for (const item of items) if (item.month === month && item.status !== 'cancelled' && item.event.planLink?.type === 'cost') {
    const id = item.event.planLink.id
    expected.set(id, Math.max(expected.get(id) ?? 0, item.unregisteredAmount))
  }
  return rows.reduce((sum, row) => sum + Math.max(row.actual ?? row.planned, (row.actual ?? 0) + (expected.get(row.cost.id) ?? 0)), 0)
}

/** Desejos ligados ao plano ocupam a própria verba, sem outra saída prevista. */
export function forecastWantsCommitted(rows: ActualsSummary['wantRows'], items: ReconciledOccurrence[], month: string): number {
  const expected = new Map<string, number>()
  for (const item of items) if (item.month === month && item.status !== 'cancelled' && item.event.planLink?.type === 'want') {
    const id = item.event.planLink.id
    expected.set(id, Math.max(expected.get(id) ?? 0, item.unregisteredAmount))
  }
  return rows.reduce((sum, row) => sum + Math.max(row.actual ?? row.planned, (row.actual ?? 0) + (expected.get(row.want.id) ?? 0)), 0)
}

export interface ReconciledOccurrence extends ExpectedOccurrence {
  paidAmount: number
  remainingAmount: number
  committedAmount: number
  unregisteredAmount: number
  overdue: boolean
  linked: boolean
  status: 'pending' | 'partial' | 'scheduled' | 'settled' | 'overdue' | 'cancelled'
}

export function reconcileOccurrence(
  occurrence: ExpectedOccurrence, actuals: MonthlyActuals[], today: string,
  cards: CreditCardEntry[] = [], paidInvoices: PaidInvoiceSnapshot[] = [], movements: ForecastMovementSource[] = [],
): ReconciledOccurrence {
  const field = occurrence.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const amounts = new Map<string, number>()
  let committedAmount = 0
  for (const cycle of actuals) for (const entry of cycle[field] ?? []) {
    if (entry.sourceOccurrenceId === occurrence.id || (!entry.sourceOccurrenceId && entry.sourceEventId === occurrence.event.id && cycle.month === occurrence.originalMonth)) amounts.set('cash:' + cycle.month + ':' + entry.id, entry.amount)
  }
  const override = occurrence.event.occurrenceOverrides?.[occurrence.originalMonth]
  const links: ForecastFactLink[] = [...(override?.links ?? [])]
  if (occurrence.event.planLink) links.push({ ...occurrence.event.planLink, month: occurrence.month })
  const cardIds = new Set(links.filter((link) => link.type === 'card').map((link) => link.id))
  for (const entry of cards) if (entry.sourceForecastOccurrenceId === occurrence.id) cardIds.add(entry.id)
  for (const invoice of paidInvoices) {
    const matched = (invoice.entries ?? []).filter((entry) => entry.sourceForecastOccurrenceId === occurrence.id || cardIds.has(entry.id))
    if (matched.length) for (const entry of matched) amounts.set('card:' + entry.id, entry.personalAmount)
    else for (const [index, entry] of (invoice.forecastOccurrences ?? []).entries()) if (entry.id === occurrence.id) amounts.set('invoice:' + invoice.id + ':' + invoice.accountId + ':' + invoice.dueMonth + ':' + index, entry.amount)
  }
  for (const entry of cards) if (cardIds.has(entry.id) && !amounts.has('card:' + entry.id)) {
    if (entry.isPrepaid) amounts.set('card:' + entry.id, entry.personalAmount)
    else committedAmount += entry.personalAmount
  }
  for (const link of links) {
    if (link.type === 'cost' || link.type === 'want') {
      const cycle = actuals.find((cycle) => cycle.month === link.month)
      const value = cycle?.[link.type === 'cost' ? 'costs' : 'wants'][link.id]
      if (value !== undefined) amounts.set(factLinkKey(link), value)
    } else if (link.type === 'cash') {
      const entry = actuals.find((cycle) => cycle.month === link.month)?.[field].find((entry) => entry.id === link.id)
      if (entry) amounts.set(factLinkKey(link), entry.amount)
    } else if (link.type === 'movement') {
      const entry = movements.find((source) => source.ownerId === link.ownerId && source.ownerType === link.ownerType)?.entries.find((entry) => entry.id === link.id)
      const valid = entry && (occurrence.event.kind === 'income' ? entry.kind === 'withdrawal' : entry.kind === 'contribution' || entry.kind === 'amortization')
      if (valid) amounts.set(factLinkKey(link), Math.abs(entry.amount))
    }
  }
  const legacyMarked = occurrence.event.cashTreatment === 'planned' && links.length === 0 ? override?.realizedAmount ?? 0 : 0
  const paidAmount = [...amounts.values()].reduce((sum, value) => sum + value, 0) + legacyMarked
  const remainingAmount = occurrence.cancelled ? 0 : Math.max(0, occurrence.amount - paidAmount)
  const unregisteredAmount = Math.max(0, remainingAmount - committedAmount)
  const overdue = occurrence.date ? occurrence.date < today : occurrence.month < today.slice(0, 7)
  const status = occurrence.cancelled ? 'cancelled' : remainingAmount <= 0.005 ? 'settled'
    : paidAmount > 0.005 ? 'partial' : committedAmount > 0.005 ? 'scheduled' : overdue ? 'overdue' : 'pending'
  return { ...occurrence, paidAmount, remainingAmount, committedAmount, unregisteredAmount, overdue, linked: links.length > 0, status }
}

export function upcomingOccurrences(
  events: ExpectedEvent[], actuals: MonthlyActuals[], startMonth: string, months: number, today: string,
  cards: CreditCardEntry[] = [], paidInvoices: PaidInvoiceSnapshot[] = [], movements: ForecastMovementSource[] = [], includeCancelled = false,
): ReconciledOccurrence[] {
  return occurrencesInRange(events, startMonth, months, includeCancelled)
    .map((occurrence) => reconcileOccurrence(occurrence, actuals, today, cards, paidInvoices, movements))
    .sort((a, b) => (a.date ?? a.month + '-99').localeCompare(b.date ?? b.month + '-99') || a.id.localeCompare(b.id))
}

export function buildForecastAgenda(events: ExpectedEvent[], actuals: MonthlyActuals[], startMonth: string, today: string, cards: CreditCardEntry[] = [], invoices: PaidInvoiceSnapshot[] = [], movements: ForecastMovementSource[] = []) {
  return events.map((event) => {
    const start = event.month < startMonth ? event.month : startMonth
    const endAnchor = event.month > startMonth ? event.month : startMonth
    const items = upcomingOccurrences([event], actuals, start, monthsBetween(start, endAnchor) + 120, today, cards, invoices, movements, true)
    // Mesmo uma ocorrência adiada para fora da janela conserva os fatos no detalhe.
    for (const original of Object.keys(event.occurrenceOverrides ?? {})) {
      const occurrence = occurrenceFor(event, original, true)
      if (occurrence && !items.some((item) => item.id === occurrence.id)) items.push(reconcileOccurrence(occurrence, actuals, today, cards, invoices, movements))
    }
    items.sort((a, b) => (a.date ?? a.month + '-99').localeCompare(b.date ?? b.month + '-99'))
    const next = items.find((item) => item.remainingAmount > 0.005 && item.status !== 'cancelled')
    return { event, items, next }
  }).sort((a, b) => (a.next?.date ?? (a.next ? a.next.month + '-99' : '9999')).localeCompare(b.next?.date ?? (b.next ? b.next.month + '-99' : '9999')) || a.event.name.localeCompare(b.event.name))
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
