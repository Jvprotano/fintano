import type { BudgetArea, CreditCardAccount, CreditCardCycle, CreditCardEntry } from '../types'
import { BUDGET_AREAS } from '../types/constants'
import { addMonths, finiteNumber } from './shared'

const MONTH_RE = /^\d{4}-\d{2}$/

export interface PaidInvoiceMonthSummary {
  spendingMonth: string
  /** Soma pessoal listada no bucket, incluindo itens antecipados. */
  spentPersonalTotal: number
  /** Parte pessoal que efetivamente permaneceu na fatura a pagar. */
  duePersonalTotal: number
  /** Distribuição apenas do valor efetivamente devido na fatura. */
  personalByArea: Record<BudgetArea, number>
  unclassifiedPersonal: number
}

export interface PaidInvoiceSnapshot {
  id?: string
  accountId?: string | null
  dueMonth: string
  /** Total cheio da fatura, incluindo terceiros. null em snapshots antigos. */
  total: number | null
  /** Parte pessoal efetivamente paga na fatura. */
  personalTotal: number
  paidAt: string
  /** Composição preservada no instante do pagamento. */
  spending: PaidInvoiceMonthSummary[]
  forecastOccurrences?: { id: string; amount: number }[]
  credits?: { id: string; accountId?: string; cardName: string; description: string; purchaseDate: string; amount: number; source: 'payment' | 'reward'; cashCycleMonth?: string; originCreditId?: string }[]
  entries?: CreditCardEntry[]
}

export interface CardMonthSpending {
  spendingMonth: string
  dueMonth: string
  sourceCycle: CreditCardCycle | null
  /** Soma pessoal listada no bucket, inclusive itens antecipados. */
  spentPersonalTotal: number
  /** Parte pessoal efetivamente devida na fatura do ciclo. */
  duePersonalTotal: number
  /** Distribuição do valor devido; soma com duePersonalTotal. */
  personalByArea: Record<BudgetArea, number>
  unclassifiedPersonal: number
  paid: boolean
  /** false apenas quando um estado legado já girou a fatura sem preservar detalhe. */
  amountKnown: boolean
}

export interface CycleInvoiceCash {
  dueMonth: string
  /** Total cheio da fatura, incluindo terceiros. null quando não foi preservado. */
  total: number | null
  personalTotal: number
  paid: boolean
  /** false quando uma versão antiga já girou a fatura e não deixou snapshot do valor pago. */
  amountKnown: boolean
}

export interface CardCycleAccounting {
  /** Fatura cujo vencimento cai no mesmo mês civil do ciclo. Mantida para leitura de caixa. */
  invoiceThisCycle: CycleInvoiceCash
  /** Fatura que encerra o ciclo ativo e normalmente vence no mês seguinte. */
  invoiceFormedByCycle: CycleInvoiceCash
  /** Detalhe do bucket de cartão associado ao ciclo ativo. */
  spendingThisCycle: CardMonthSpending
}

function emptyAreaMap(): Record<BudgetArea, number> {
  return Object.fromEntries(BUDGET_AREAS.map((area) => [area, 0])) as Record<BudgetArea, number>
}

function normalizeAreaMap(raw: Partial<Record<BudgetArea, number>> | undefined) {
  const result = emptyAreaMap()
  for (const area of BUDGET_AREAS) result[area] = Math.max(0, finiteNumber(raw?.[area]))
  return result
}

function normalizePaidInvoiceMonthSummary(
  raw: Partial<PaidInvoiceMonthSummary> | null | undefined,
): PaidInvoiceMonthSummary | null {
  if (!raw || typeof raw.spendingMonth !== 'string' || !MONTH_RE.test(raw.spendingMonth)) {
    return null
  }
  return {
    spendingMonth: raw.spendingMonth,
    spentPersonalTotal: Math.max(0, finiteNumber(raw.spentPersonalTotal)),
    duePersonalTotal: Math.max(0, finiteNumber(raw.duePersonalTotal)),
    personalByArea: normalizeAreaMap(raw.personalByArea),
    unclassifiedPersonal: Math.max(0, finiteNumber(raw.unclassifiedPersonal)),
  }
}

export function normalizePaidInvoiceSnapshot(
  raw: Partial<PaidInvoiceSnapshot> | null | undefined,
): PaidInvoiceSnapshot | null {
  if (!raw || typeof raw.dueMonth !== 'string' || !MONTH_RE.test(raw.dueMonth)) return null
  const spending = Array.isArray(raw.spending)
    ? raw.spending
        .map((item) => normalizePaidInvoiceMonthSummary(item))
        .filter((item): item is PaidInvoiceMonthSummary => item !== null)
    : []

  return {
    id: raw.id,
    accountId: raw.accountId ?? null,
    dueMonth: raw.dueMonth,
    total:
      typeof raw.total === 'number' && Number.isFinite(raw.total)
        ? Math.max(0, raw.total)
        : null,
    personalTotal: Math.max(0, finiteNumber(raw.personalTotal)),
    paidAt: typeof raw.paidAt === 'string' ? raw.paidAt : '',
    spending,
    forecastOccurrences: Array.isArray(raw.forecastOccurrences) ? raw.forecastOccurrences.filter((item) =>
      item && typeof item.id === 'string' && Number.isFinite(item.amount) && item.amount > 0,
    ) : [],
    credits: Array.isArray(raw.credits) ? raw.credits.filter((credit) =>
      credit && typeof credit === 'object' &&
      typeof credit.id === 'string' && typeof credit.cardName === 'string' &&
      typeof credit.description === 'string' && Number.isFinite(credit.amount) && credit.amount > 0,
    ).map((credit) => ({ ...credit, source: credit.source === 'reward' ? 'reward' as const : 'payment' as const })) : [],
    entries: Array.isArray(raw.entries) ? raw.entries : undefined,
  }
}

export function normalizePaidInvoiceSnapshots(raw: unknown): PaidInvoiceSnapshot[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizePaidInvoiceSnapshot(item as Partial<PaidInvoiceSnapshot>))
    .filter((item): item is PaidInvoiceSnapshot => item !== null)
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
}

/**
 * O mês do cartão é definido pelo bucket da fatura, não pela data impressa da compra.
 *
 * Ex.: com fatura atual vencendo em Setembro, tudo que está em `current` pertence ao
 * fechamento do Ciclo Agosto. Isso inclui parcelas antigas e também compras avulsas
 * feitas depois que a fatura anterior já havia sido encerrada, ainda que tenham data
 * 31/07. `purchaseDate` continua sendo informação da transação, não a fronteira do ciclo.
 */
export function cardEntrySpendingMonth(entry: CreditCardEntry, currentDueMonth: string): string {
  return addMonths(entry.dueMonth ?? (entry.cycle === 'current' ? currentDueMonth : addMonths(currentDueMonth, 1)), -1)
}

export function withCardEntrySpendingMonth(
  entry: CreditCardEntry,
  currentDueMonth: string,
): CreditCardEntry {
  return {
    ...entry,
    spendingMonth: cardEntrySpendingMonth(entry, currentDueMonth),
  } as CreditCardEntry
}

function cycleForDueMonth(currentDueMonth: string, dueMonth: string): CreditCardCycle | null {
  if (dueMonth === currentDueMonth) return 'current'
  if (dueMonth === addMonths(currentDueMonth, 1)) return 'next'
  return null
}

function summarizeEntriesForMonth(
  entries: CreditCardEntry[],
  sourceCycle: CreditCardCycle,
  spendingMonth: string,
  dueMonth: string,
  currentDueMonth: string,
): CardMonthSpending {
  const matching = entries.filter(
    (entry) =>
      entry.cycle === sourceCycle && entry.entryType !== 'invoiceCredit' && cardEntrySpendingMonth(entry, currentDueMonth) === spendingMonth,
  )
  const personalByArea = emptyAreaMap()
  let unclassifiedPersonal = 0
  let spentPersonalTotal = 0
  let duePersonalTotal = 0

  for (const entry of matching) {
    spentPersonalTotal += entry.personalAmount
    if (entry.isPrepaid) continue

    duePersonalTotal += entry.personalAmount
    if (entry.budgetArea) personalByArea[entry.budgetArea] += entry.personalAmount
    else unclassifiedPersonal += entry.personalAmount
  }

  return {
    spendingMonth,
    dueMonth,
    sourceCycle,
    spentPersonalTotal,
    duePersonalTotal,
    personalByArea,
    unclassifiedPersonal,
    paid: false,
    amountKnown: true,
  }
}

/** Congela a fatura completa e o bucket do ciclo antes de girá-la. */
export function createPaidInvoiceSnapshot(input: {
  entries: CreditCardEntry[]
  currentDueMonth: string
  total: number
  personalTotal: number
  accountId?: string | null
  paidAt?: string
}): PaidInvoiceSnapshot {
  const currentEntries = input.entries.filter((entry) => entry.cycle === 'current' && entry.entryType !== 'invoiceCredit')
  const months = new Map<string, PaidInvoiceMonthSummary>()

  for (const entry of currentEntries) {
    const spendingMonth = cardEntrySpendingMonth(entry, input.currentDueMonth)
    const row = months.get(spendingMonth) ?? {
      spendingMonth,
      spentPersonalTotal: 0,
      duePersonalTotal: 0,
      personalByArea: emptyAreaMap(),
      unclassifiedPersonal: 0,
    }

    row.spentPersonalTotal += entry.personalAmount
    if (!entry.isPrepaid) {
      row.duePersonalTotal += entry.personalAmount
      if (entry.budgetArea) row.personalByArea[entry.budgetArea] += entry.personalAmount
      else row.unclassifiedPersonal += entry.personalAmount
    }
    months.set(spendingMonth, row)
  }

  return {
    id: input.accountId ? `invoice-${input.accountId}-${input.currentDueMonth}` : undefined,
    accountId: input.accountId ?? null,
    dueMonth: input.currentDueMonth,
    total: Math.max(0, finiteNumber(input.total)),
    personalTotal: Math.max(0, finiteNumber(input.personalTotal)),
    paidAt: input.paidAt ?? new Date().toISOString(),
    entries: input.accountId ? input.entries.map((entry) => ({ ...entry })) : undefined,
    spending: Array.from(months.values()).sort((a, b) => a.spendingMonth.localeCompare(b.spendingMonth)),
    forecastOccurrences: currentEntries.filter((entry) => entry.sourceForecastOccurrenceId).map((entry) => ({
      id: entry.sourceForecastOccurrenceId!, amount: entry.personalAmount,
    })),
    credits: input.entries.filter((entry) => entry.cycle === 'current' && entry.entryType === 'invoiceCredit').map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      cardName: entry.cardName,
      description: entry.description,
      purchaseDate: entry.purchaseDate,
      amount: entry.amount,
      source: entry.creditSource === 'reward' ? 'reward' as const : 'payment' as const,
      cashCycleMonth: entry.cashCycleMonth,
      originCreditId: entry.originCreditId,
    })),
  }
}

/** Pagamentos avulsos já debitados da conta no ciclo, inclusive após girar a fatura. */
export function cardAdvancePaymentsForMonth(
  entries: CreditCardEntry[],
  paidInvoices: PaidInvoiceSnapshot[],
  month: string,
): number {
  const payments = new Map<string, number>()
  for (const entry of entries) {
    if (entry.entryType === 'invoiceCredit' && entry.creditSource !== 'reward' && !entry.originCreditId && entry.cashCycleMonth === month) {
      payments.set(entry.id, Math.max(0, entry.amount))
    }
  }
  for (const invoice of paidInvoices) {
    for (const credit of invoice.credits ?? []) {
      if (credit.source === 'payment' && !credit.originCreditId && credit.cashCycleMonth === month && !payments.has(credit.id)) {
        payments.set(credit.id, Math.max(0, credit.amount))
      }
    }
  }
  return Array.from(payments.values()).reduce((sum, value) => sum + value, 0)
}

function latestPaidInvoiceForDueMonth(paidInvoices: PaidInvoiceSnapshot[], dueMonth: string) {
  return [...paidInvoices].reverse().find((snapshot) => snapshot.dueMonth === dueMonth)
}

function latestPaidSpendingForMonth(
  paidInvoices: PaidInvoiceSnapshot[],
  spendingMonth: string,
  expectedDueMonth: string,
) {
  for (const snapshot of [...paidInvoices].reverse()) {
    const row = snapshot.spending.find((item) => item.spendingMonth === spendingMonth)
    if (row && snapshot.dueMonth === expectedDueMonth) return { snapshot, row }
  }
  for (const snapshot of [...paidInvoices].reverse()) {
    const row = snapshot.spending.find((item) => item.spendingMonth === spendingMonth)
    if (row) return { snapshot, row }
  }
  return null
}

function resolveInvoice(input: {
  dueMonth: string
  currentDueMonth: string
  currentTotal: number
  currentPersonalTotal: number
  nextTotal: number
  nextPersonalTotal: number
  paidInvoices: PaidInvoiceSnapshot[]
}): CycleInvoiceCash {
  const {
    dueMonth,
    currentDueMonth,
    currentTotal,
    currentPersonalTotal,
    nextTotal,
    nextPersonalTotal,
    paidInvoices,
  } = input

  if (currentDueMonth === dueMonth) {
    return {
      dueMonth,
      total: currentTotal,
      personalTotal: currentPersonalTotal,
      paid: false,
      amountKnown: true,
    }
  }
  if (addMonths(currentDueMonth, 1) === dueMonth) {
    return {
      dueMonth,
      total: nextTotal,
      personalTotal: nextPersonalTotal,
      paid: false,
      amountKnown: true,
    }
  }

  const paidInvoice = latestPaidInvoiceForDueMonth(paidInvoices, dueMonth)
  if (paidInvoice) {
    return {
      dueMonth,
      total: paidInvoice.total,
      personalTotal: paidInvoice.personalTotal,
      paid: true,
      amountKnown: true,
    }
  }

  return { dueMonth, total: null, personalTotal: 0, paid: false, amountKnown: false }
}

/**
 * O fechamento do ciclo usa a fatura/bucket que termina aquele ciclo. Em Agosto,
 * normalmente é a fatura que vence em Setembro. Pagar antes ou junto do fechamento
 * produz o mesmo resultado porque a fatura é congelada em snapshot antes do giro.
 */
export function calculateCardCycleAccounting(input: {
  entries: CreditCardEntry[]
  accounts?: CreditCardAccount[]
  currentDueMonth: string
  activeCycleMonth: string
  currentTotal: number
  currentPersonalTotal: number
  nextTotal: number
  nextPersonalTotal: number
  paidInvoices?: PaidInvoiceSnapshot[]
}): CardCycleAccounting {
  const {
    entries,
    currentDueMonth,
    activeCycleMonth,
    currentTotal,
    currentPersonalTotal,
    nextTotal,
    nextPersonalTotal,
  } = input
  const paidInvoices = normalizePaidInvoiceSnapshots(input.paidInvoices ?? [])
  if (input.accounts?.length) {
    const dueFor = (month: string): CycleInvoiceCash => {
      let total = 0
      let personalTotal = 0
      let amountKnown = true
      let paidCount = 0
      for (const account of input.accounts!) {
        const snapshot = paidInvoices.find((item) => item.accountId === account.id && item.dueMonth === month)
        if (snapshot) {
          total += snapshot.total ?? 0
          personalTotal += snapshot.personalTotal
          amountKnown &&= snapshot.total !== null
          paidCount++
          continue
        }
        const openMonth = account.currentDueMonth ?? currentDueMonth
        const accountEntries = entries.filter((entry) => entry.accountId === account.id && entry.dueMonth === month)
        if (month !== openMonth && month !== addMonths(openMonth, 1) &&
          accountEntries.length === 0 && !account.confirmedEmptyDueMonths?.includes(month)) {
          // Faturas legadas agregadas não permitem inferir a parte de cada cartão.
          amountKnown = false
          continue
        }
        if (accountEntries.length === 0 && !account.confirmedEmptyDueMonths?.includes(month)) {
          amountKnown = false
          continue
        }
        const statement = summarizeInvoiceEntries(accountEntries)
        total += statement.total
        personalTotal += statement.personalTotal
      }
      const legacy = paidInvoices.find((item) => !item.accountId && item.dueMonth === month)
      if (legacy) {
        // Um agregado legado é conhecido no total; a composição por cartão permanece desconhecida.
        return { dueMonth: month, total: legacy.total, personalTotal: legacy.personalTotal,
          paid: true, amountKnown: legacy.total !== null }
      }
      return { dueMonth: month, total: amountKnown ? total : null, personalTotal,
        paid: paidCount === input.accounts!.length, amountKnown }
    }
    const spendingMonth = activeCycleMonth
    const dueMonth = addMonths(spendingMonth, 1)
    const rows: CardMonthSpending[] = []
    let known = true
    for (const account of input.accounts) {
      const snapshot = paidInvoices.find((item) => item.accountId === account.id && item.dueMonth === dueMonth)
      if (snapshot) {
        const row = snapshot.spending.find((item) => item.spendingMonth === spendingMonth)
        if (row) rows.push({ ...row, dueMonth, sourceCycle: null, paid: true, amountKnown: true })
        continue
      }
      const openMonth = account.currentDueMonth ?? currentDueMonth
      if (dueMonth !== openMonth && dueMonth !== addMonths(openMonth, 1)) { known = false; continue }
      const matching = entries.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)
      if (matching.length === 0 && !account.confirmedEmptyDueMonths?.includes(dueMonth)) known = false
      rows.push(summarizeEntriesForMonth(matching, dueMonth === openMonth ? 'current' : 'next',
        spendingMonth, dueMonth, openMonth))
    }
    const personalByArea = emptyAreaMap()
    for (const row of rows) for (const area of BUDGET_AREAS) personalByArea[area] += row.personalByArea[area]
    const legacy = paidInvoices.find((item) => !item.accountId && item.dueMonth === dueMonth)
    const legacyRow = legacy?.spending.find((item) => item.spendingMonth === spendingMonth)
    const spendingThisCycle = legacyRow && !rows.length
      ? { ...legacyRow, dueMonth, sourceCycle: null, paid: true, amountKnown: true }
      : { spendingMonth, dueMonth, sourceCycle: null,
          spentPersonalTotal: rows.reduce((sum, row) => sum + row.spentPersonalTotal, 0),
          duePersonalTotal: rows.reduce((sum, row) => sum + row.duePersonalTotal, 0),
          personalByArea, unclassifiedPersonal: rows.reduce((sum, row) => sum + row.unclassifiedPersonal, 0),
          paid: rows.length > 0 && rows.every((row) => row.paid), amountKnown: known }
    return { invoiceThisCycle: dueFor(activeCycleMonth),
      invoiceFormedByCycle: dueFor(dueMonth), spendingThisCycle }
  }

  const invoiceThisCycle = resolveInvoice({
    dueMonth: activeCycleMonth,
    currentDueMonth,
    currentTotal,
    currentPersonalTotal,
    nextTotal,
    nextPersonalTotal,
    paidInvoices,
  })

  const closingDueMonth = addMonths(activeCycleMonth, 1)
  const invoiceFormedByCycle = resolveInvoice({
    dueMonth: closingDueMonth,
    currentDueMonth,
    currentTotal,
    currentPersonalTotal,
    nextTotal,
    nextPersonalTotal,
    paidInvoices,
  })

  const sourceCycle = cycleForDueMonth(currentDueMonth, closingDueMonth)
  let spendingThisCycle: CardMonthSpending
  if (sourceCycle) {
    spendingThisCycle = summarizeEntriesForMonth(
      entries,
      sourceCycle,
      activeCycleMonth,
      closingDueMonth,
      currentDueMonth,
    )
  } else {
    const paid = latestPaidSpendingForMonth(paidInvoices, activeCycleMonth, closingDueMonth)
    spendingThisCycle = paid
      ? {
          ...paid.row,
          dueMonth: paid.snapshot.dueMonth,
          sourceCycle: null,
          paid: true,
          amountKnown: true,
        }
      : {
          spendingMonth: activeCycleMonth,
          dueMonth: closingDueMonth,
          sourceCycle: null,
          spentPersonalTotal: 0,
          duePersonalTotal: 0,
          personalByArea: emptyAreaMap(),
          unclassifiedPersonal: 0,
          paid: false,
          amountKnown: false,
        }
  }

  return { invoiceThisCycle, invoiceFormedByCycle, spendingThisCycle }
}

export function summarizeInvoiceEntries(entries: CreditCardEntry[]) {
  const due = entries.filter((entry) => entry.entryType !== 'invoiceCredit' && !entry.isPrepaid)
  const credits = entries.filter((entry) => entry.entryType === 'invoiceCredit')
  const applied = Math.min(due.reduce((sum, entry) => sum + entry.personalAmount, 0),
    credits.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0))
  return { total: due.reduce((sum, entry) => sum + entry.amount, 0) - applied,
    personalTotal: due.reduce((sum, entry) => sum + entry.personalAmount, 0) - applied }
}
