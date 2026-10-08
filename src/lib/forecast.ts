import type {
  ExpectedEvent,
  ExpectedEventKind,
  ExpectedEventTerms,
  ExpectedEventRecurrence,
  ExpectedOccurrence,
  ExpectedOccurrenceOverride,
  ForecastAssumptions,
  ForecastPoint,
} from '../types'
import { advanceAssetMonth } from './assets'
import { advanceDebtMonth } from './debts'
import { addMonths, finiteNumber, monthKey, monthsBetween, nowIso, uid } from './shared'

// ---------------------------------------------------------------------------
// Futuro.
//
// O orçamento mensal não conhece 13º, bônus, férias, IPTU nem seguro do carro:
// são valores que você já sabe que vêm, mas caem fora do mês a mês. Este módulo
// os transforma em ocorrências datadas e projeta o patrimônio a partir delas,
// do aporte recorrente e de um rendimento esperado.
// ---------------------------------------------------------------------------

const RECURRENCES: ExpectedEventRecurrence[] = ['once', 'yearly', 'monthly']
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function eventTerms(event: ExpectedEvent): ExpectedEventTerms {
  const { name, kind, amount, month, date, cashTreatment, cardDueMonth, confirmed, savedPct, goalId, note, planLink } = event
  return { name, kind, amount, month, date, cashTreatment, cardDueMonth, confirmed, savedPct, goalId, note, planLink }
}

function normalizeTerms(raw: ExpectedEventTerms | undefined): ExpectedEventTerms | undefined {
  if (!raw || typeof raw !== 'object' || !raw.name || !MONTH_RE.test(raw.month) || !Number.isFinite(raw.amount) || raw.amount <= 0) return undefined
  return eventTerms(normalizeExpectedEvent({ ...raw, futureChanges: undefined, occurrenceOverrides: undefined }))
}

function normalizeOverrides(raw: ExpectedEvent['occurrenceOverrides']) {
  if (!raw || typeof raw !== 'object') return undefined
  const entries: [string, ExpectedOccurrenceOverride][] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!MONTH_RE.test(key) || !value || typeof value !== 'object') continue
    const date = validDate(value.date) ? value.date : undefined
    const month = date?.slice(0, 7) ?? (MONTH_RE.test(value.month ?? '') ? value.month : undefined)
    const amount = typeof value.amount === 'number' && Number.isFinite(value.amount) && value.amount > 0
      ? value.amount : undefined
    const realizedAmount = typeof value.realizedAmount === 'number' && Number.isFinite(value.realizedAmount) && value.realizedAmount > 0
      ? value.realizedAmount : undefined
    const realizedAt = validDate(value.realizedAt) ? value.realizedAt : undefined
    entries.push([key, { date, month, amount, cancelled: value.cancelled === true, realizedAmount, realizedAt, terms: normalizeTerms(value.terms), links: Array.isArray(value.links) ? value.links : undefined, goalAllocations: value.goalAllocations }])
  }
  return entries.length ? Object.fromEntries(entries) : undefined
}

export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  monthlyContribution: null,
  annualReturnPct: 10,
  inflationPct: 4.5,
  showInRealTerms: false,
  includeLeftover: false,
  reinvestFreedInstallments: false,
  horizonMonths: 18,
}

export function normalizeExpectedEvent(raw: Partial<ExpectedEvent> | undefined): ExpectedEvent {
  const kind: ExpectedEventKind = raw?.kind === 'expense' ? 'expense' : 'income'
  const savedPct = Math.max(0, Math.min(100, finiteNumber(raw?.savedPct, 100)))

  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || (kind === 'income' ? 'Entrada' : 'Saída'),
    kind,
    amount: Math.max(0, finiteNumber(raw?.amount)),
    month: MONTH_RE.test(raw?.month ?? '') ? (raw?.month as string) : monthKey(),
    date: validDate(raw?.date) && raw.date.slice(0, 7) === raw.month ? raw.date : undefined,
    recurrence: RECURRENCES.includes(raw?.recurrence as ExpectedEventRecurrence)
      ? (raw?.recurrence as ExpectedEventRecurrence)
      : 'once',
    groupId: raw?.groupId || undefined,
    cashTreatment: kind === 'expense' && (raw?.cashTreatment === 'planned' || raw?.cashTreatment === 'card')
      ? raw.cashTreatment : 'extra',
    cardDueMonth: raw?.cashTreatment === 'card' && MONTH_RE.test(raw?.cardDueMonth ?? '')
      ? raw?.cardDueMonth : undefined,
    cancelled: raw?.cancelled === true,
    planLink: raw?.planLink && ['cost', 'want'].includes(raw.planLink.type) && raw.planLink.id ? raw.planLink : undefined,
    futureChanges: raw?.futureChanges && Object.fromEntries(Object.entries(raw.futureChanges).filter(([month]) => MONTH_RE.test(month)).flatMap(([month, terms]) => { const normalized = normalizeTerms(terms); return normalized ? [[month, normalized]] : [] })),
    confirmed: kind === 'income' && raw?.confirmed === true,
    occurrenceOverrides: normalizeOverrides(raw?.occurrenceOverrides),
    savedPct: kind === 'income' ? savedPct : undefined,
    goalId: raw?.goalId || undefined,
    note: raw?.note?.trim() || undefined,
    createdAt: raw?.createdAt || nowIso(),
  }
}

export function normalizeAssumptions(
  raw: Partial<ForecastAssumptions> | undefined,
): ForecastAssumptions {
  const contribution = raw?.monthlyContribution
  return {
    monthlyContribution:
      typeof contribution === 'number' && Number.isFinite(contribution) && contribution >= 0
        ? contribution
        : null,
    annualReturnPct: Math.max(-50, Math.min(60, finiteNumber(raw?.annualReturnPct, 10))),
    inflationPct: Math.max(0, Math.min(30, finiteNumber(raw?.inflationPct, 4.5))),
    showInRealTerms: raw?.showInRealTerms === true,
    includeLeftover: raw?.includeLeftover === true,
    reinvestFreedInstallments: raw?.reinvestFreedInstallments === true,
    horizonMonths: Math.max(3, Math.min(120, Math.round(finiteNumber(raw?.horizonMonths, 18)))),
  }
}

/** O evento acontece neste mês? */
export function occursIn(event: ExpectedEvent, month: string): boolean {
  const distance = monthsBetween(event.month, month)
  if (distance < 0) return false
  if (event.recurrence === 'once') return distance === 0
  if (event.recurrence === 'monthly') return true
  return distance % 12 === 0
}

function expectedDateInMonth(event: ExpectedEvent, month: string): string | undefined {
  if (!event.date) return undefined
  const day = Number(event.date.slice(8, 10))
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function occurrenceFor(event: ExpectedEvent, originalMonth: string, includeCancelled = false): ExpectedOccurrence | null {
  if (!occursIn(event, originalMonth)) return null
  const override = event.occurrenceOverrides?.[originalMonth]
  const cancelled = event.cancelled === true || override?.cancelled === true
  if (cancelled && !includeCancelled) return null
  const revisionEntry = Object.entries(event.futureChanges ?? {}).filter(([month]) => month <= originalMonth).sort(([a], [b]) => b.localeCompare(a))[0]
  const revision = revisionEntry?.[1]
  const effective = { ...event, ...(revision ?? {}), ...(override?.terms ?? {}) }
  const revisedMonth = revisionEntry ? addMonths(originalMonth, monthsBetween(revisionEntry[0], revisionEntry[1].month)) : originalMonth
  const date = override?.date ?? (override?.month ? undefined : expectedDateInMonth(effective, revisedMonth))
  const month = date?.slice(0, 7) ?? override?.month ?? revisedMonth
  const amount = override?.amount ?? effective.amount
  const signedAmount = effective.kind === 'income' ? amount : -amount
  const savedAmount = cancelled || override?.links?.some((link) => link.type !== 'cash') ? 0 : effective.kind === 'income'
    ? (amount * (effective.savedPct ?? 100)) / 100
    : effective.cashTreatment === 'planned' || effective.cashTreatment === 'card' || effective.planLink || override?.links?.length ? 0 : -amount
  return { id: event.id + '@' + originalMonth, event: effective, month, originalMonth, date, amount, signedAmount, savedAmount, cancelled }
}

export function occurrencesInMonth(events: ExpectedEvent[], month: string, includeCancelled = false): ExpectedOccurrence[] {
  const list: ExpectedOccurrence[] = []
  for (const event of events) {
    const candidates = new Set([month, ...Object.keys(event.occurrenceOverrides ?? {})])
    for (const [cutoff, terms] of Object.entries(event.futureChanges ?? {})) {
      const original = addMonths(month, -monthsBetween(cutoff, terms.month))
      if (original >= cutoff) candidates.add(original)
    }
    for (const originalMonth of candidates) {
      if (!occursIn(event, originalMonth)) continue
      const occurrence = occurrenceFor(event, originalMonth, includeCancelled)
      if (occurrence?.month === month) list.push(occurrence)
    }
  }
  return list.sort((a, b) => (a.date ?? `${a.month}-99`).localeCompare(b.date ?? `${b.month}-99`))
}

/** Todas as ocorrências entre `startMonth` e os `months` meses seguintes. */
export function occurrencesInRange(
  events: ExpectedEvent[],
  startMonth: string,
  months: number,
  includeCancelled = false,
): ExpectedOccurrence[] {
  const list: ExpectedOccurrence[] = []
  for (let index = 0; index < months; index += 1) {
    list.push(...occurrencesInMonth(events, addMonths(startMonth, index), includeCancelled))
  }
  return list
}

export interface UpcomingSummary {
  income: number
  expense: number
  net: number
  /** Quanto do saldo esperado vira patrimônio. */
  saved: number
  occurrences: ExpectedOccurrence[]
}

export function summarizeUpcoming(
  events: ExpectedEvent[],
  startMonth: string,
  months: number,
): UpcomingSummary {
  const occurrences = occurrencesInRange(events, startMonth, months)
  const income = occurrences
    .filter((item) => item.event.kind === 'income')
    .reduce((sum, item) => sum + item.amount, 0)
  const expense = occurrences
    .filter((item) => item.event.kind === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)

  return {
    income,
    expense,
    net: income - expense,
    saved: occurrences.reduce((sum, item) => sum + item.savedAmount, 0),
    occurrences,
  }
}

// ---------------------------------------------------------------------------
// Projeção
// ---------------------------------------------------------------------------

/** Dívida simplificada para a projeção — só o que muda o saldo mês a mês. */
export interface ProjectedDebt {
  id: string
  balance: number
  monthlyRatePct: number
  installment: number
  /** Tem bem do outro lado: a amortização vira patrimônio, não some. */
  secured?: boolean
}

/** Bem simplificado para a projeção: valor de hoje e valorização esperada. */
export interface ProjectedProperty {
  id: string
  value: number
  annualAppreciationPct: number
}

export interface ProjectionInput {
  includeExpectedIncome?: boolean
  monthlyContributions?: Record<string, number>
  monthlyExpenses?: Record<string, number>
  initialContribution?: number
  initialExpense?: number
  initialExpectedIncome?: number
  /** Saldo condicionado não financia saídas; continua compondo patrimônio. */
  protectedAssets?: number
  monthlyProtectedContributions?: Record<string, number>
  initialProtectedContribution?: number
  /** Liberação que cabe nos recursos mensais, após considerar plano e sobras. */
  freedContributionByMonth?: Record<string, number>
  startMonth: string
  /** Ativos financeiros de hoje. Dívidas e bens entram separados. */
  startAssets: number
  monthlyContribution: number
  annualReturnPct: number
  inflationPct: number
  horizonMonths: number
  events: ExpectedEvent[]
  /** Restante previsto após conciliar fatos já recebidos/pagos. */
  remainingByOccurrence?: Record<string, number>
  debts?: ProjectedDebt[]
  properties?: ProjectedProperty[]
  /** Somar ao aporte a parcela de cada dívida já quitada. */
  reinvestFreedInstallments?: boolean
}

/**
 * Patrimônio mês a mês. Sem liquidação inicial, o primeiro ponto é o saldo
 * informado, sem aporte nem rendimento. Pendências iniciais explícitas projetam
 * o restante do ciclo no primeiro ponto, sem inventar movimentos realizados.
 *
 * Três curvas correm separadas. Os ativos financeiros recebem aporte, eventos e
 * rendimento. Cada dívida corre juros e é abatida pela parcela — que *não* sai
 * dos ativos, porque já é um custo fixo do mês: o que sobra depois dela é
 * justamente o aporte. E cada bem se valoriza pela premissa dele.
 *
 * Sem a terceira curva, um financiamento aparecia como perda pura: o saldo caía
 * e nada crescia do outro lado, como se a amortização evaporasse.
 */
export function projectNetWorth(input: ProjectionInput): ForecastPoint[] {
  const monthlyRate = Math.pow(1 + input.annualReturnPct / 100, 1 / 12) - 1
  const monthlyInflation = Math.pow(1 + input.inflationPct / 100, 1 / 12) - 1

  // Cópia local: a projeção consome os saldos, e o estado do app é imutável.
  const debts = (input.debts ?? []).map((debt) => ({ ...debt }))
  const propertyList = (input.properties ?? []).map((property) => ({ ...property }))
  const startDebt = debts.reduce((sum, debt) => sum + debt.balance, 0)
  const startSecured = debts
    .filter((debt) => debt.secured)
    .reduce((sum, debt) => sum + debt.balance, 0)
  const startProperties = propertyList.reduce((sum, property) => sum + property.value, 0)
  const startNetWorth = input.startAssets + startProperties - startDebt
  const startFinancialNetWorth = input.startAssets - (startDebt - startSecured)
  const initialContribution = input.initialContribution ?? 0
  const initialSaved = input.includeExpectedIncome ? input.initialExpectedIncome ?? 0 : 0
  let protectedAssets = Math.max(0, input.protectedAssets ?? 0) + (input.initialProtectedContribution ?? 0)
  const initialNetAssets = input.startAssets + initialContribution + initialSaved - (input.initialExpense ?? 0)
  let assets = Math.max(protectedAssets, initialNetAssets)
  let unfunded = Math.max(0, protectedAssets - initialNetAssets)
  const initialChange = assets - input.startAssets - unfunded

  const points: ForecastPoint[] = [
    {
      month: input.startMonth,
      assets,
      properties: startProperties,
      debt: startDebt,
      securedDebt: startSecured,
      netWorth: startNetWorth + initialChange,
      financialNetWorth: startFinancialNetWorth + initialChange,
      assetsReal: assets,
      propertiesReal: startProperties,
      netWorthReal: startNetWorth + initialChange,
      financialNetWorthReal: startFinancialNetWorth + initialChange,
      contribution: initialContribution,
      eventsSaved: initialSaved,
      unfunded,
      returns: 0,
      debtPaid: 0,
      equityBuilt: 0,
      occurrences: [],
    },
  ]

  for (let index = 1; index <= input.horizonMonths; index += 1) {
    const month = addMonths(input.startMonth, index)
    const occurrences = occurrencesInMonth(input.events, month)
    const eventsSaved = occurrences.reduce((sum, item) => {
      if (item.event.kind === 'income' && input.includeExpectedIncome === false) return sum
      const remaining = input.remainingByOccurrence?.[item.id] ?? item.amount
      return sum + item.savedAmount * (item.amount > 0 ? Math.max(0, remaining) / item.amount : 0)
    }, 0)
    const returns = assets * monthlyRate

    let debtPaid = 0
    let equityBuilt = 0
    let freedInstallments = 0
    for (const debt of debts) {
      if (debt.balance <= 0) {
        if (input.reinvestFreedInstallments) freedInstallments += debt.installment
        continue
      }
      const next = advanceDebtMonth(debt.balance, debt.monthlyRatePct, debt.installment)
      const amortized = debt.balance - next.balance
      debtPaid += amortized
      if (debt.secured) equityBuilt += amortized
      debt.balance = next.balance
    }

    for (const property of propertyList) {
      property.value = advanceAssetMonth(property.value, property.annualAppreciationPct)
    }

    const contribution = (input.monthlyContributions?.[month] ?? input.monthlyContribution) + (input.freedContributionByMonth?.[month] ?? freedInstallments)
    protectedAssets = protectedAssets * (1 + monthlyRate) + (input.monthlyProtectedContributions?.[month] ?? 0)
    const nextAssets = assets + contribution + eventsSaved + returns - unfunded - (input.monthlyExpenses?.[month] ?? 0)
    assets = Math.max(protectedAssets, nextAssets)
    unfunded = Math.max(0, protectedAssets - nextAssets)
    const debt = debts.reduce((sum, item) => sum + item.balance, 0)
    const securedDebt = debts
      .filter((item) => item.secured)
      .reduce((sum, item) => sum + item.balance, 0)
    const properties = propertyList.reduce((sum, item) => sum + item.value, 0)
    const netWorth = assets + properties - debt - unfunded
    const financialNetWorth = assets - (debt - securedDebt) - unfunded
    // Deflator acumulado até este mês: os valores em reais de hoje.
    const deflator = Math.pow(1 + monthlyInflation, index)

    points.push({
      month,
      assets,
      properties,
      debt,
      securedDebt,
      netWorth,
      financialNetWorth,
      assetsReal: assets / deflator,
      propertiesReal: properties / deflator,
      netWorthReal: netWorth / deflator,
      financialNetWorthReal: financialNetWorth / deflator,
      contribution,
      eventsSaved,
      unfunded,
      returns,
      debtPaid,
      equityBuilt,
      occurrences,
    })
  }

  return points
}

/**
 * Patrimônio projetado para um mês — null se estiver fora do horizonte.
 * `metric` escolhe a curva: `financial` é o dinheiro (o que uma meta de
 * poupança mede), `net` é o balanço inteiro, com bens e financiamento.
 */
export function projectedAt(
  points: ForecastPoint[],
  month: string,
  real = false,
  metric: 'net' | 'financial' = 'financial',
): number | null {
  const pick = (point: ForecastPoint) =>
    metric === 'financial'
      ? real
        ? point.financialNetWorthReal
        : point.financialNetWorth
      : real
        ? point.netWorthReal
        : point.netWorth
  const point = points.find((item) => item.month === month)
  if (point) return pick(point)
  // Mês anterior ao início: o presente é a melhor resposta possível.
  const first = points[0]
  if (first && monthsBetween(first.month, month) <= 0) return pick(first)
  return null
}

export const EVENT_SUGGESTIONS: {
  name: string
  kind: ExpectedEventKind
  recurrence: ExpectedEventRecurrence
  monthIndex: number
}[] = [
  { name: '13º salário', kind: 'income', recurrence: 'yearly', monthIndex: 12 },
  { name: 'Bônus anual', kind: 'income', recurrence: 'yearly', monthIndex: 3 },
  { name: 'Férias', kind: 'income', recurrence: 'yearly', monthIndex: 1 },
  { name: 'Restituição do IR', kind: 'income', recurrence: 'yearly', monthIndex: 6 },
  { name: 'IPTU', kind: 'expense', recurrence: 'yearly', monthIndex: 2 },
  { name: 'IPVA', kind: 'expense', recurrence: 'yearly', monthIndex: 1 },
  { name: 'Seguro do carro', kind: 'expense', recurrence: 'yearly', monthIndex: 5 },
  { name: 'Matrícula / material', kind: 'expense', recurrence: 'yearly', monthIndex: 1 },
]

/** Próxima ocorrência de um mês do calendário (1–12), a partir de hoje. */
export function nextMonthKeyFor(monthIndex: number, from = monthKey()): string {
  const [year, current] = from.split('-').map(Number)
  const target = Math.min(12, Math.max(1, monthIndex))
  const targetYear = target >= current ? year : year + 1
  return `${targetYear}-${String(target).padStart(2, '0')}`
}
