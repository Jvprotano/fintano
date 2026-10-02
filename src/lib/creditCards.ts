import type {
  BudgetArea,
  CardCycleStatus,
  CreditCardAccount,
  CreditCardEntry,
  CreditCardSettings,
  CreditCardSummary,
} from '../types'
import { BUDGET_AREAS } from '../types/constants'
import { addMonths, finiteNumber, normalizeText, uid } from './shared'

const DAY_MS = 24 * 60 * 60 * 1000

export function normalizeCardAccount(raw: Partial<CreditCardAccount> | undefined): CreditCardAccount {
  const clampDay = (value: unknown, fallback: number) =>
    Math.max(1, Math.min(31, Math.round(finiteNumber(value, fallback))))

  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Cartão',
    currentDueMonth: isMonthKey(raw?.currentDueMonth) ? raw.currentDueMonth : undefined,
    confirmedEmptyDueMonths: Array.isArray(raw?.confirmedEmptyDueMonths)
      ? raw.confirmedEmptyDueMonths.filter(isMonthKey) : undefined,
    closingDay: clampDay(raw?.closingDay, 30),
    dueDay: clampDay(raw?.dueDay, 5),
    limit: Math.max(0, finiteNumber(raw?.limit)),
  }
}

/** Extrai o dia de um texto livre de vencimento antigo ("05/07" → 5). */
export function parsePaymentDay(raw: string | undefined, fallback = 5): number {
  const match = raw?.match(/(\d{1,2})/)
  const day = match ? Number(match[1]) : NaN
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : fallback
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

export function inferDueMonthFromPaymentDate(raw: string | undefined, now = new Date()): string {
  const match = raw?.match(/(\d{1,2})(?:\D+(\d{1,2}))?/)
  const explicitMonth = match?.[2] ? Number(match[2]) : NaN

  if (Number.isFinite(explicitMonth) && explicitMonth >= 1 && explicitMonth <= 12) {
    return `${now.getFullYear()}-${String(explicitMonth).padStart(2, '0')}`
  }

  return monthKeyFromDate(nextDateForDay(parsePaymentDay(raw, 5), now))
}

function paymentDateForMonth(day: number, dueMonth: string): string {
  const [, month] = dueMonth.split('-')
  return `${String(day).padStart(2, '0')}/${month ?? '01'}`
}

export function normalizeCreditCardSettings(
  raw: Partial<CreditCardSettings> | undefined,
  now = new Date(),
): CreditCardSettings {
  const paymentDate = raw?.paymentDate?.trim() || '05/07'
  return {
    paymentDate,
    personalSpendingLimit: Math.max(0, finiteNumber(raw?.personalSpendingLimit, 1500)),
    currentDueMonth: isMonthKey(raw?.currentDueMonth)
      ? raw.currentDueMonth
      : inferDueMonthFromPaymentDate(paymentDate, now),
  }
}

export function advanceCreditCardSettingsCycle(settings: CreditCardSettings): CreditCardSettings {
  const currentDueMonth =
    settings.currentDueMonth ?? inferDueMonthFromPaymentDate(settings.paymentDate)
  const nextDueMonth = addMonths(currentDueMonth, 1)
  const dueDay = parsePaymentDay(settings.paymentDate, 5)

  return {
    ...settings,
    paymentDate: paymentDateForMonth(dueDay, nextDueMonth),
    currentDueMonth: nextDueMonth,
  }
}

/** Próxima ocorrência de um dia do mês, a partir de `from`. */
function nextDateForDay(day: number, from: Date): Date {
  const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()
  const thisMonth = new Date(from.getFullYear(), from.getMonth(), Math.min(day, daysInMonth))
  if (thisMonth.getTime() >= startOfDay(from).getTime()) return thisMonth
  const nextDaysInMonth = new Date(from.getFullYear(), from.getMonth() + 2, 0).getDate()
  return new Date(from.getFullYear(), from.getMonth() + 1, Math.min(day, nextDaysInMonth))
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Onde cada cartão está no seu ciclo. Com fechamentos diferentes, "a fatura" não
 * é uma coisa só: um cartão pode ter fechado ontem e o outro fechar só semana
 * que vem — e o que já fechou não aceita mais compras deste ciclo.
 */
export function describeCardCycles(
  accounts: CreditCardAccount[],
  summary: CreditCardSummary,
  now = new Date(),
): CardCycleStatus[] {
  const today = startOfDay(now)
  const days = (target: Date) => Math.round((target.getTime() - today.getTime()) / DAY_MS)

  return accounts.map((account) => {
    const totals = summary.totalsByCard.find(
      (card) => card.accountId === account.id || normalizeText(card.cardName) === normalizeText(account.name),
    )
    const personalAmount = totals?.personalAmount ?? 0
    const totalAmount = totals?.totalAmount ?? 0
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const closingThisMonth = Math.min(account.closingDay, daysInMonth)

    return {
      ...account,
      isClosed: now.getDate() > closingThisMonth,
      daysToClosing: days(nextDateForDay(account.closingDay, now)),
      daysToDue: days(nextDateForDay(account.dueDay, now)),
      personalAmount,
      totalAmount,
      usagePct: account.limit > 0 ? (totalAmount / account.limit) * 100 : null,
    }
  })
}

/** Nomes de cartão que aparecem nos lançamentos mas não estão cadastrados. */
export function unregisteredCardNames(
  entries: CreditCardEntry[],
  accounts: CreditCardAccount[],
): string[] {
  const known = new Set(accounts.map((account) => normalizeText(account.name)))
  const names = new Map<string, string>()
  for (const entry of entries) {
    if (entry.accountId && accounts.some((account) => account.id === entry.accountId)) continue
    const key = normalizeText(entry.cardName)
    if (!key || known.has(key) || names.has(key)) continue
    names.set(key, entry.cardName)
  }
  return Array.from(names.values())
}

const isBudgetArea = (value: unknown): value is BudgetArea =>
  typeof value === 'string' && (BUDGET_AREAS as string[]).includes(value)

export function normalizeCreditCardEntry(entry: CreditCardEntry): CreditCardEntry {
  const amount = finiteNumber(entry.amount)
  const installmentCurrent = finiteNumber(entry.installmentCurrent)
  const installmentTotal = finiteNumber(entry.installmentTotal)

  return {
    id: entry.id || uid(),
    cycle: entry.cycle === 'next' ? 'next' : 'current',
    accountId: entry.accountId || undefined,
    dueMonth: isMonthKey(entry.dueMonth) ? entry.dueMonth : undefined,
    description: entry.description?.trim() || 'Lançamento sem descrição',
    purchaseDate: entry.purchaseDate?.trim() || '',
    cardName: entry.cardName?.trim() || 'Cartão',
    amount,
    personalAmount: finiteNumber(entry.personalAmount, amount),
    remainingAmount: finiteNumber(entry.remainingAmount),
    budgetArea: isBudgetArea(entry.budgetArea) ? entry.budgetArea : undefined,
    ownerName: entry.ownerName?.trim() || '',
    ownerNote: entry.ownerNote?.trim() || '',
    installmentCurrent: installmentCurrent > 0 ? installmentCurrent : undefined,
    installmentTotal: installmentTotal > 0 ? installmentTotal : undefined,
    isRecurring: entry.isRecurring === true ? true : undefined,
    isPrepaid: entry.isPrepaid === true ? true : undefined,
    autoGenerated: entry.autoGenerated === true ? true : undefined,
    sourceEntryId: entry.sourceEntryId || undefined,
    entryType: entry.entryType === 'invoiceCredit' ? 'invoiceCredit' : undefined,
    creditSource: entry.entryType === 'invoiceCredit' && entry.creditSource === 'reward' ? 'reward' : entry.entryType === 'invoiceCredit' ? 'payment' : undefined,
    cashCycleMonth: entry.entryType === 'invoiceCredit' && /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.cashCycleMonth ?? '') ? entry.cashCycleMonth : undefined,
    originCreditId: entry.entryType === 'invoiceCredit' ? entry.originCreditId : undefined,
    sourceForecastOccurrenceId: entry.entryType === 'invoiceCredit' ? undefined : entry.sourceForecastOccurrenceId || undefined,
  }
}

export function buildRemainingInstallmentsAmount(amount: number, current?: number, total?: number) {
  if (!current || !total || current >= total) return 0
  return amount * (total - current)
}

function creditCardPurchaseKey(entry: CreditCardEntry) {
  return `${normalizeText(entry.description)}|${entry.accountId ?? normalizeText(entry.cardName)}`
}

/**
 * Leva a data curta de uma assinatura para o mês da fatura seguinte.
 * Textos que não representam uma data dd/mm são preservados para não apagar
 * informações legadas digitadas livremente.
 */
function recurringPurchaseDateForMonth(purchaseDate: string, targetMonth?: string): string {
  const match = purchaseDate.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2}|\d{4}))?\s*$/)
  if (!match) return purchaseDate

  const day = Number(match[1])
  const sourceMonth = Number(match[2])
  if (day < 1 || day > 31 || sourceMonth < 1 || sourceMonth > 12) return purchaseDate

  const targetMatch = targetMonth?.match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  const sourceYear = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : 2000
  const targetYear = targetMatch
    ? Number(targetMatch[1])
    : sourceYear + (sourceMonth === 12 ? 1 : 0)
  const targetMonthNumber = targetMatch ? Number(targetMatch[2]) : (sourceMonth % 12) + 1
  const lastDay = new Date(targetYear, targetMonthNumber, 0).getDate()
  const targetDay = Math.min(day, lastDay)
  const yearSuffix = match[3]
    ? `/${match[3].length === 2 ? String(targetYear).slice(-2) : String(targetYear)}`
    : ''

  return `${String(targetDay).padStart(2, '0')}/${String(targetMonthNumber).padStart(2, '0')}${yearSuffix}`
}

/**
 * Recalcula os lançamentos gerados automaticamente da próxima fatura a partir da
 * fatura atual: assinaturas recorrentes repetem e compras parceladas seguem para
 * a parcela seguinte. Lançamentos manuais da próxima fatura são mantidos e
 * bloqueiam a geração de duplicatas da mesma compra.
 */
export function syncGeneratedNextEntries(
  entries: CreditCardEntry[],
  nextInvoiceSpendingMonth?: string,
): CreditCardEntry[] {
  const currentEntries = entries.filter((entry) => entry.cycle === 'current')
  const manualNextEntries = entries.filter(
    (entry) => entry.cycle === 'next' && !entry.autoGenerated,
  )
  const manualNextKeys = new Set(manualNextEntries.filter((entry) => entry.entryType !== 'invoiceCredit').map(creditCardPurchaseKey))
  const manualNextSourceIds = new Set(
    manualNextEntries.filter((entry) => entry.entryType !== 'invoiceCredit').map((entry) => entry.sourceEntryId).filter(Boolean),
  )
  const isCoveredByManualEntry = (entry: CreditCardEntry) =>
    manualNextKeys.has(creditCardPurchaseKey(entry)) || manualNextSourceIds.has(entry.id)
  const generated: CreditCardEntry[] = []

  for (const entry of currentEntries) {
    if (entry.entryType === 'invoiceCredit' || !entry.isRecurring || isCoveredByManualEntry(entry)) continue
    generated.push(
      normalizeCreditCardEntry({
        ...entry,
        id: uid(),
        cycle: 'next',
        autoGenerated: true,
        sourceEntryId: entry.id,
        dueMonth: entry.dueMonth ? addMonths(entry.dueMonth, 1) : undefined,
        purchaseDate: recurringPurchaseDateForMonth(
          entry.purchaseDate,
          entry.dueMonth ?? nextInvoiceSpendingMonth,
        ),
        remainingAmount: 0,
        // Antecipar o pagamento vale só para o ciclo atual; a próxima cobrança volta a ser devida.
        isPrepaid: undefined,
      }),
    )
  }

  const latestInstallments = new Map<string, CreditCardEntry>()
  for (const entry of currentEntries) {
    if (entry.entryType === 'invoiceCredit' || entry.isRecurring || !entry.installmentCurrent || !entry.installmentTotal) continue
    const key = `${creditCardPurchaseKey(entry)}|${entry.installmentTotal}`
    const existing = latestInstallments.get(key)
    if (!existing || entry.installmentCurrent > (existing.installmentCurrent ?? 0)) {
      latestInstallments.set(key, entry)
    }
  }

  for (const entry of latestInstallments.values()) {
    const nextInstallment = (entry.installmentCurrent ?? 0) + 1
    const total = entry.installmentTotal ?? 0
    if (nextInstallment > total || isCoveredByManualEntry(entry)) continue
    generated.push(
      normalizeCreditCardEntry({
        ...entry,
        id: uid(),
        cycle: 'next',
        autoGenerated: true,
        sourceEntryId: entry.id,
        dueMonth: entry.dueMonth ? addMonths(entry.dueMonth, 1) : undefined,
        installmentCurrent: nextInstallment,
        remainingAmount: buildRemainingInstallmentsAmount(entry.amount, nextInstallment, total),
        isPrepaid: undefined,
      }),
    )
  }

  return [...currentEntries, ...manualNextEntries, ...generated]
}

/** Mantém na próxima fatura apenas a parte do abatimento que não encontrou saldo pessoal neste cartão. */
export function carryUnappliedCredits(entries: CreditCardEntry[]): CreditCardEntry[] {
  const current = entries.filter((entry) => entry.cycle === 'current')
  const personalDueByCard = new Map<string, number>()
  for (const entry of current) {
    if (entry.entryType === 'invoiceCredit' || entry.isPrepaid) continue
    const key = entry.accountId ?? entry.cardName
    personalDueByCard.set(key, (personalDueByCard.get(key) ?? 0) + entry.personalAmount)
  }
  const carried: CreditCardEntry[] = []
  for (const credit of current) {
    if (credit.entryType !== 'invoiceCredit') continue
    const key = credit.accountId ?? credit.cardName
    const available = Math.max(0, personalDueByCard.get(key) ?? 0)
    const applied = Math.min(Math.max(0, credit.amount), available)
    personalDueByCard.set(key, available - applied)
    const remainder = Math.max(0, credit.amount - applied)
    if (remainder > 0.005) {
      carried.push(normalizeCreditCardEntry({
        ...credit,
        id: uid(),
        cycle: 'current',
        amount: remainder,
        personalAmount: remainder,
        originCreditId: credit.originCreditId ?? credit.id,
      }))
    }
  }
  return carried
}

export function calculateCreditCardSummary(
  entries: CreditCardEntry[],
  settings: CreditCardSettings,
): CreditCardSummary {
  const currentEntries = entries.filter((entry) => entry.cycle === 'current')
  const nextEntries = entries.filter((entry) => entry.cycle === 'next')
  // Compras pagas antecipadamente continuam listadas, mas não são mais devidas:
  // ficam fora dos totais da fatura, do limite pessoal e dos agrupamentos.
  const currentDueEntries = currentEntries.filter((entry) => !entry.isPrepaid && entry.entryType !== 'invoiceCredit')
  const currentPrepaidEntries = currentEntries.filter((entry) => entry.isPrepaid && entry.entryType !== 'invoiceCredit')
  const currentCredits = currentEntries.filter((entry) => entry.entryType === 'invoiceCredit')
  const personalDueByCard = new Map<string, number>()
  for (const entry of currentDueEntries) {
    const key = entry.accountId ?? entry.cardName
    personalDueByCard.set(key, (personalDueByCard.get(key) ?? 0) + entry.personalAmount)
  }
  const appliedCreditByCard = new Map<string, number>()
  for (const credit of currentCredits) {
    const key = credit.accountId ?? credit.cardName
    const alreadyApplied = appliedCreditByCard.get(key) ?? 0
    const available = Math.max(0, (personalDueByCard.get(key) ?? 0) - alreadyApplied)
    appliedCreditByCard.set(key, alreadyApplied + Math.min(Math.max(0, credit.amount), available))
  }
  const currentCreditTotal = currentCredits.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)
  const currentAppliedCreditTotal = Array.from(appliedCreditByCard.values()).reduce((sum, value) => sum + value, 0)
  const currentUnappliedCreditTotal = currentCreditTotal - currentAppliedCreditTotal
  const currentTotal = currentDueEntries.reduce((sum, entry) => sum + entry.amount, 0) - currentAppliedCreditTotal
  const currentPersonalTotal = currentDueEntries.reduce((sum, entry) => sum + entry.personalAmount, 0) - currentAppliedCreditTotal
  const currentThirdPartyTotal = currentDueEntries.reduce(
    (sum, entry) => sum + Math.max(0, entry.amount - entry.personalAmount),
    0,
  )
  const currentPrepaidTotal = currentPrepaidEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const currentPersonalPrepaidTotal = currentPrepaidEntries.reduce(
    (sum, entry) => sum + entry.personalAmount,
    0,
  )
  const nextPurchases = nextEntries.filter((entry) => entry.entryType !== 'invoiceCredit' && !entry.isPrepaid)
  const nextCredits = nextEntries.filter((entry) => entry.entryType === 'invoiceCredit')
  const nextPersonalGross = nextPurchases.reduce((sum, entry) => sum + entry.personalAmount, 0)
  const nextPersonalByCard = new Map<string, number>()
  for (const entry of nextPurchases) {
    const key = entry.accountId ?? entry.cardName
    nextPersonalByCard.set(key, (nextPersonalByCard.get(key) ?? 0) + entry.personalAmount)
  }
  const nextCreditByCard = new Map<string, number>()
  for (const credit of nextCredits) {
    const key = credit.accountId ?? credit.cardName
    nextCreditByCard.set(key, (nextCreditByCard.get(key) ?? 0) + Math.max(0, credit.amount))
  }
  const nextCreditApplied = Array.from(nextCreditByCard).reduce(
    (sum, [cardName, credit]) => sum + Math.min(credit, Math.max(0, nextPersonalByCard.get(cardName) ?? 0)), 0,
  )
  const nextTotal = nextPurchases.reduce((sum, entry) => sum + entry.amount, 0) - nextCreditApplied
  const nextPersonalTotal = nextPersonalGross - nextCreditApplied
  const remainingInstallmentsTotal = currentEntries.filter((entry) => entry.entryType !== 'invoiceCredit').reduce(
    (sum, entry) => sum + entry.remainingAmount,
    0,
  )
  const remainingPersonalInstallmentsTotal = currentEntries.filter((entry) => entry.entryType !== 'invoiceCredit').reduce(
    (sum, entry) => sum + (entry.personalAmount / (entry.amount || 1)) * entry.remainingAmount,
    0,
  )

  const byCard = new Map<
    string,
    { totalAmount: number; personalAmount: number; thirdPartyAmount: number }
  >()
  const byOwner = new Map<
    string,
    { totalAmount: number; personalAmount: number; thirdPartyAmount: number }
  >()
  // Uma compra antecipada já saiu do bolso neste mês: continua contando como
  // gasto realizado da área, mesmo fora do total devido da fatura.
  const personalByArea: Record<BudgetArea, number> = {
    necessidades: 0,
    desejos: 0,
    investimentos: 0,
  }
  let unclassifiedPersonal = 0

  for (const entry of currentEntries) {
    if (entry.entryType === 'invoiceCredit') continue
    if (entry.budgetArea) personalByArea[entry.budgetArea] += entry.personalAmount
    else unclassifiedPersonal += entry.personalAmount
  }

  const cardNameByKey = new Map<string, string>()
  for (const entry of currentDueEntries) {
    const thirdPartyAmount = Math.max(0, entry.amount - entry.personalAmount)
    const key = entry.accountId ?? entry.cardName
    cardNameByKey.set(key, entry.cardName)
    const existing = byCard.get(key) ?? {
      totalAmount: 0,
      personalAmount: 0,
      thirdPartyAmount: 0,
    }
    byCard.set(key, {
      totalAmount: existing.totalAmount + entry.amount,
      personalAmount: existing.personalAmount + entry.personalAmount,
      thirdPartyAmount: existing.thirdPartyAmount + thirdPartyAmount,
    })

    if (thirdPartyAmount > 0) {
      const owner = entry.ownerName || entry.ownerNote || 'Outro'
      const ownerExisting = byOwner.get(owner) ?? {
        totalAmount: 0,
        personalAmount: 0,
        thirdPartyAmount: 0,
      }
      byOwner.set(owner, {
        totalAmount: ownerExisting.totalAmount + thirdPartyAmount,
        personalAmount: ownerExisting.personalAmount,
        thirdPartyAmount: ownerExisting.thirdPartyAmount + thirdPartyAmount,
      })
    }
  }

  for (const [key, applied] of appliedCreditByCard) {
    const existing = byCard.get(key)
    if (existing) byCard.set(key, { ...existing, totalAmount: existing.totalAmount - applied, personalAmount: existing.personalAmount - applied })
  }

  return {
    currentTotal,
    currentPersonalTotal,
    currentThirdPartyTotal,
    currentPrepaidTotal,
    currentPersonalPrepaidTotal,
    currentCreditTotal,
    currentAppliedCreditTotal,
    currentUnappliedCreditTotal,
    nextTotal,
    nextPersonalTotal,
    remainingInstallmentsTotal,
    remainingPersonalInstallmentsTotal,
    availablePersonalLimit: settings.personalSpendingLimit - currentPersonalTotal,
    totalsByCard: Array.from(byCard.entries())
      .map(([key, totals]) => ({ accountId: key, cardName: cardNameByKey.get(key) ?? key, ...totals }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    totalsByOwner: Array.from(byOwner.entries())
      .map(([cardName, totals]) => ({ cardName, ...totals }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    currentEntriesCount: currentEntries.length,
    nextEntriesCount: nextEntries.length,
    personalByArea,
    unclassifiedPersonal,
  }
}
