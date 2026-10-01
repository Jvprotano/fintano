import type {
  Asset,
  BudgetArea,
  CostCategory,
  CreditCardAccount,
  CreditCardEntry,
  CreditCardSettings,
  Debt,
  EmergencyFundState,
  ExpectedEvent,
  FinanceScenario,
  FinancialGoal,
  ForecastAssumptions,
  InvestmentAssetClass,
  LedgerEntry,
  MonthlyActuals,
  MonthlySnapshot,
} from '../types'
import { BUDGET_AREAS, DEFAULT_INVESTMENT_CLASSES } from '../types/constants'
import { normalizeActiveCycle } from '../lib/activeCycle'
import {
  cardEntrySpendingMonth,
  normalizePaidInvoiceSnapshots,
  type PaidInvoiceSnapshot,
} from '../lib/cardCycleAccounting'
import {
  inferDueMonthFromPaymentDate,
  normalizeCardAccount,
  normalizeCreditCardEntry,
  normalizeCreditCardSettings,
} from '../lib/creditCards'
import { normalizeActuals } from '../lib/actuals'
import { normalizeAsset } from '../lib/assets'
import { normalizeDebt } from '../lib/debts'
import {
  DEFAULT_ASSUMPTIONS,
  normalizeAssumptions,
  normalizeExpectedEvent,
} from '../lib/forecast'
import { normalizeGoal } from '../lib/goals'
import { normalizeSnapshot } from '../lib/history'
import {
  holdingPurpose,
  normalizeAssetClass,
  normalizeEmergencyFund,
  normalizeHolding,
  type FinancialHolding,
} from '../lib/investments'
import {
  calculateScenario,
  convertLegacyScenario,
  normalizeScenario,
  type LegacyScenario,
} from '../lib/scenario'
import { addMonths, finiteNumber, normalizeText } from '../lib/shared'
import {
  LEGACY_DOMAIN_KEYS,
  REPOSITORY_SCHEMA_VERSION,
  type RepositoryCollection,
  type RepositoryDocument,
} from './repository'
import type {
  BackupInspection,
  BackupValidationIssue,
  CardAccountV7,
  CycleClosureV7,
  DomainLedgerEntryV7,
  FinTanoBackupV7,
  FinTanoBackupV8,
  LedgerEntryKind,
  LedgerOwnerType,
  MoneyCents,
  MonthKey,
  CyclePlanV7,
} from './backupSchemaV7'

export interface LegacyBackupPayloadLike {
  app?: string
  version?: number
  exportedAt?: string
  localStorage?: Record<string, string>
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

export const toCents = (amount: unknown): MoneyCents => Math.round(finiteNumber(amount) * 100)
export const fromCents = (amount: unknown): number => Math.round(finiteNumber(amount)) / 100

function validMonth(value: unknown, fallback: MonthKey): MonthKey {
  return typeof value === 'string' && MONTH_RE.test(value) ? value : fallback
}

/** Converte datas brasileiras legadas sem deixar o runtime interpretar mês e dia ao acaso. */
export function normalizePersistedInstant(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string' || !value.trim()) return fallback
  if (ISO_RE.test(value) && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (!match) return fallback
  const [, day, month, year, hour = '12', minute = '00', second = '00'] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}-03:00`
  return Number.isNaN(Date.parse(iso)) ? fallback : new Date(iso).toISOString()
}

function monthFromInstant(value: string, fallback: MonthKey): MonthKey {
  const direct = value.slice(0, 7)
  if (MONTH_RE.test(direct)) return direct
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return match ? `${match[3]}-${match[2].padStart(2, '0')}` : fallback
}

function collection<T>(document: RepositoryDocument, key: RepositoryCollection, fallback: T): T {
  const value = document.collections[key]
  return value === undefined ? fallback : (value as T)
}

function areaMapToCents(source: Partial<Record<BudgetArea, number>> | undefined) {
  return Object.fromEntries(
    BUDGET_AREAS.map((area) => [area, toCents(source?.[area])]),
  ) as Record<BudgetArea, MoneyCents>
}

function areaMapFromCents(source: Partial<Record<BudgetArea, MoneyCents>> | undefined) {
  return Object.fromEntries(
    BUDGET_AREAS.map((area) => [area, fromCents(source?.[area])]),
  ) as Record<BudgetArea, number>
}

function inferLedgerKind(
  ownerType: LedgerOwnerType,
  entry: LedgerEntry,
): LedgerEntryKind {
  const note = normalizeText(entry.note ?? '')
  if (note.includes('saldo inicial') || note.includes('aporte inicial')) return 'opening_balance'
  if (ownerType === 'debt') return entry.amount < 0 ? 'amortization' : 'balance_increase'
  return entry.amount < 0 ? 'withdrawal' : 'contribution'
}

function ledgerToV7(
  ownerType: LedgerOwnerType,
  ownerId: string,
  entries: LedgerEntry[],
  fallbackMonth: MonthKey,
): DomainLedgerEntryV7[] {
  return entries.map((entry) => {
    const occurredAt = normalizePersistedInstant(entry.date)
    return {
      id: entry.id,
      ownerType,
      ownerId,
      kind: inferLedgerKind(ownerType, entry),
      amountCents: toCents(entry.amount),
      competenceMonth: validMonth(
        entry.cycleMonth,
        monthFromInstant(entry.date, fallbackMonth),
      ),
      occurredAt,
      note: entry.note?.trim() || undefined,
    }
  })
}

function ledgerFromV7(entries: DomainLedgerEntryV7[], ownerType: LedgerOwnerType, ownerId: string) {
  return entries
    .filter((entry) => entry.ownerType === ownerType && entry.ownerId === ownerId)
    .map<LedgerEntry>((entry) => ({
      id: entry.id,
      amount: fromCents(entry.amountCents),
      cycleMonth: entry.competenceMonth,
      date: entry.occurredAt,
      note:
        entry.note ||
        (entry.kind === 'opening_balance' ? 'Saldo inicial' : undefined),
    }))
}

function ensureAccounts(
  stored: CreditCardAccount[],
  entries: CreditCardEntry[],
  settings: CreditCardSettings,
): CreditCardAccount[] {
  const accounts = stored.map(normalizeCardAccount)
  const names = new Set(accounts.map((account) => normalizeText(account.name)))
  const dueDay = Number(settings.paymentDate.match(/\d{1,2}/)?.[0] ?? 5)
  for (const entry of entries) {
    if (names.has(normalizeText(entry.cardName))) continue
    accounts.push(
      normalizeCardAccount({
        id: `migrated-card-${normalizeText(entry.cardName).replace(/[^a-z0-9]+/g, '-')}`,
        name: entry.cardName,
        closingDay: 30,
        dueDay,
        limit: 0,
      }),
    )
    names.add(normalizeText(entry.cardName))
  }
  return accounts
}

function snapshotToClosure(raw: Partial<MonthlySnapshot>): CycleClosureV7 {
  const snapshot = normalizeSnapshot(raw)
  const employerKnown =
    raw.employerInvestmentKnown === true || typeof raw.employerInvested === 'number'
  return {
    id: snapshot.id,
    month: snapshot.month,
    closedAt: normalizePersistedInstant(snapshot.closedAt),
    planningTemplateId: snapshot.scenarioId,
    planningTemplateNameAtClose: snapshot.scenarioName,
    plan: {
      availableForBudgetCents: toCents(snapshot.availableForBudget),
      costsCents: toCents(snapshot.costsPlanned),
      wantsCents: toCents(snapshot.wantsPlanned),
      personalInvestmentCents: toCents(snapshot.investedPlanned),
      cardCents: toCents(snapshot.cardPlanned),
    },
    cash: {
      paycheckCents: toCents(snapshot.paycheckInAccount),
      extraIncomeCents: toCents(snapshot.extraIncome),
      extraIncomeEntries: snapshot.extraIncomeEntries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        amountCents: toCents(entry.amount),
        sourceForecastEventId: entry.sourceEventId,
        sourceOccurrenceId: entry.sourceOccurrenceId,
        occurredAt: entry.occurredAt,
      })),
      extraExpenseCents: toCents(snapshot.extraExpense),
      extraExpenseEntries: snapshot.extraExpenseEntries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        amountCents: toCents(entry.amount),
        sourceForecastEventId: entry.sourceEventId,
        sourceOccurrenceId: entry.sourceOccurrenceId,
        occurredAt: entry.occurredAt,
      })),
      costsCents: toCents(snapshot.costs),
      wantsCents: toCents(snapshot.wants),
      leftoverCents: toCents(snapshot.cashLeftover),
    },
    investments: {
      payrollPersonalCents: toCents(snapshot.payrollInvested),
      employerCents: employerKnown ? toCents(snapshot.employerInvested) : null,
      directAtCloseCents: toCents(snapshot.directInvestedAtClose),
      openingBalanceCents: toCents(snapshot.openingBalance),
    },
    balanceSheetMark: {
      financialAssetsCents: toCents(snapshot.grossAssets),
      physicalAssetsCents: toCents(snapshot.physicalAssets),
      liabilitiesCents: toCents(snapshot.liabilities),
      securedLiabilitiesCents: toCents(snapshot.securedLiabilities),
      emergencyFundCents: toCents(snapshot.emergencyFund),
    },
    costByCategoryCents: Object.fromEntries(
      Object.entries(snapshot.costsByCategory).map(([key, value]) => [key, toCents(value)]),
    ) as Partial<Record<CostCategory, MoneyCents>>,
    wantAllocations: snapshot.wantAllocations.map((item) => ({
      id: item.id,
      name: item.name,
      plannedCents: toCents(item.planned),
      actualCents: toCents(item.actual),
      paidWith: item.paidWith === 'card' ? 'card' : 'account',
    })),
    card: {
      personalTotalCents: toCents(snapshot.cardPersonalTotal),
      personalByAreaCents: Object.fromEntries(
        Object.entries(snapshot.cardByArea).map(([key, value]) => [key, toCents(value)]),
      ) as Partial<Record<BudgetArea, MoneyCents>>,
    },
    note: snapshot.note,
  }
}

function closureToSnapshot(closure: CycleClosureV7): MonthlySnapshot {
  const availableForBudget = fromCents(closure.plan.availableForBudgetCents)
  const extraIncome = fromCents(closure.cash.extraIncomeCents)
  const extraExpense = fromCents(closure.cash.extraExpenseCents)
  const costs = fromCents(closure.cash.costsCents)
  const wants = fromCents(closure.cash.wantsCents)
  const payrollInvested = fromCents(closure.investments.payrollPersonalCents)
  const directInvestedAtClose = fromCents(closure.investments.directAtCloseCents)
  const invested = payrollInvested + directInvestedAtClose
  return normalizeSnapshot({
    id: closure.id,
    month: closure.month,
    closedAt: closure.closedAt,
    scenarioId: closure.planningTemplateId,
    scenarioName: closure.planningTemplateNameAtClose,
    availableForBudget,
    paycheckInAccount: fromCents(closure.cash.paycheckCents),
    extraIncome,
    extraIncomeEntries: closure.cash.extraIncomeEntries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      amount: fromCents(entry.amountCents),
      sourceEventId: entry.sourceForecastEventId,
      sourceOccurrenceId: entry.sourceOccurrenceId,
      occurredAt: entry.occurredAt,
    })),
    extraExpense,
    extraExpenseEntries: closure.cash.extraExpenseEntries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      amount: fromCents(entry.amountCents),
      sourceEventId: entry.sourceForecastEventId,
      sourceOccurrenceId: entry.sourceOccurrenceId,
      occurredAt: entry.occurredAt,
    })),
    costs,
    costsPlanned: fromCents(closure.plan.costsCents),
    wants,
    wantsPlanned: fromCents(closure.plan.wantsCents),
    wantAllocations: closure.wantAllocations.map((item) => ({
      id: item.id,
      name: item.name,
      planned: fromCents(item.plannedCents),
      actual: fromCents(item.actualCents),
      paidWith: item.paidWith,
      includedInCardPlan: false,
    })),
    payrollInvested,
    employerInvested: fromCents(closure.investments.employerCents),
    employerInvestmentKnown: closure.investments.employerCents !== null,
    directInvestedAtClose,
    openingBalance: fromCents(closure.investments.openingBalanceCents),
    investmentProjectionVersion: 1,
    invested,
    investmentPlanCaptured: true,
    investedPlanned: fromCents(closure.plan.personalInvestmentCents),
    balance:
      fromCents(closure.cash.paycheckCents) + extraIncome - extraExpense - costs - wants - directInvestedAtClose,
    savingsRate: availableForBudget + extraIncome > 0 ? (invested / (availableForBudget + extraIncome)) * 100 : 0,
    costsByCategory: Object.fromEntries(
      Object.entries(closure.costByCategoryCents).map(([key, value]) => [key, fromCents(value)]),
    ),
    grossAssets: fromCents(closure.balanceSheetMark.financialAssetsCents),
    physicalAssets: fromCents(closure.balanceSheetMark.physicalAssetsCents),
    liabilities: fromCents(closure.balanceSheetMark.liabilitiesCents),
    securedLiabilities: fromCents(closure.balanceSheetMark.securedLiabilitiesCents),
    netWorth:
      fromCents(closure.balanceSheetMark.financialAssetsCents) +
      fromCents(closure.balanceSheetMark.physicalAssetsCents) -
      fromCents(closure.balanceSheetMark.liabilitiesCents),
    emergencyFund: fromCents(closure.balanceSheetMark.emergencyFundCents),
    cardPersonalTotal: fromCents(closure.card.personalTotalCents),
    cardPlanned: fromCents(closure.plan.cardCents),
    cardByArea: Object.fromEntries(
      Object.entries(closure.card.personalByAreaCents).map(([key, value]) => [key, fromCents(value)]),
    ),
    cashLeftover: fromCents(closure.cash.leftoverCents),
    note: closure.note,
  })
}

export function repositoryToBackupV7(
  document: RepositoryDocument,
  exportedAt = new Date().toISOString(),
): FinTanoBackupV7 {
  const activeCycle = normalizeActiveCycle(collection(document, 'activeCycle', undefined))
  const scenarios = collection<FinanceScenario[]>(document, 'scenarios', []).map(normalizeScenario)
  const activeScenarioId = collection(document, 'activeScenarioId', scenarios[0]?.id ?? '')
  const actuals = collection<MonthlyActuals[]>(document, 'actuals', []).map(normalizeActuals)
  const settings = normalizeCreditCardSettings(
    collection<CreditCardSettings>(document, 'cardSettings', {
      paymentDate: '05/01',
      personalSpendingLimit: 0,
      currentDueMonth: activeCycle.month,
    }),
  )
  const currentDueMonth = settings.currentDueMonth ?? inferDueMonthFromPaymentDate(settings.paymentDate)
  const entries = collection<CreditCardEntry[]>(document, 'cardEntries', []).map(
    normalizeCreditCardEntry,
  )
  const accounts = ensureAccounts(
    collection<CreditCardAccount[]>(document, 'cardAccounts', []),
    entries,
    settings,
  )
  const accountByName = new Map(accounts.map((account) => [normalizeText(account.name), account]))
  const emergency = normalizeEmergencyFund(
    collection<EmergencyFundState>(document, 'emergencyFund', {
      current: 0,
      targetMonths: 6,
      transactions: [],
    }),
  )
  const holdings = collection<FinancialHolding[]>(document, 'investmentHoldings', []).map(
    normalizeHolding,
  )
  const goals = collection<FinancialGoal[]>(document, 'goals', []).map((goal, index) =>
    normalizeGoal(goal, index),
  )
  const debts = collection<Debt[]>(document, 'debts', []).map(normalizeDebt)
  const fallbackMonth = activeCycle.month
  const ledgerEntries = [
    ...holdings.flatMap((holding) =>
      ledgerToV7('holding', holding.id, holding.transactions, fallbackMonth),
    ),
    ...goals.flatMap((goal) => ledgerToV7('goal', goal.id, goal.transactions, fallbackMonth)),
    ...debts.flatMap((debt) => ledgerToV7('debt', debt.id, debt.transactions, fallbackMonth)),
  ]
  const closures = collection<Partial<MonthlySnapshot>[]>(document, 'history', []).map(
    snapshotToClosure,
  )
  const cyclePlans: CyclePlanV7[] = closures.map((closure) => ({
    id: `cycle-plan-${closure.month}`,
    month: closure.month,
    planningTemplateId: closure.planningTemplateId,
    status: 'closed',
    capturedAt: closure.closedAt,
    totals: { ...closure.plan },
  }))
  if (!cyclePlans.some((plan) => plan.month === activeCycle.month)) {
    const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId)
    if (activeScenario) {
      const metrics = calculateScenario(activeScenario, emergency)
      cyclePlans.push({
        id: `cycle-plan-${activeCycle.month}`,
        month: activeCycle.month,
        planningTemplateId: activeScenario.id,
        status: 'open',
        capturedAt: exportedAt,
        totals: {
          availableForBudgetCents: toCents(metrics.availableForBudget),
          costsCents: toCents(metrics.totalCosts),
          wantsCents: toCents(metrics.totalWantsAmount),
          personalInvestmentCents: toCents(metrics.totalPlannedInvestment),
          cardCents: toCents(metrics.plannedOnCard),
        },
      })
    }
  }

  return {
    app: 'fintano',
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    exportedAt,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    profile: {
      activeCycle,
      activePlanningTemplateId: activeScenarioId,
    },
    planning: {
      templates: scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        createdAt: normalizePersistedInstant(scenario.createdAt),
        updatedAt: normalizePersistedInstant(scenario.updatedAt),
        salaryCents: toCents(scenario.salaryNet),
        salaryInputMode: scenario.salaryInputMode,
        costs: scenario.costs.map((cost) => ({
          id: cost.id,
          name: cost.name,
          amountCents: toCents(cost.value),
          category: cost.category,
          sharedAmountCents:
            cost.sharedAmount === undefined ? undefined : toCents(cost.sharedAmount),
          sharedWith: cost.sharedWith,
          paidWith: cost.paidWith === 'card' ? 'card' : 'account',
          archivedAt: cost.archivedAt,
        })),
        wants: scenario.wants.map((want) => ({
          id: want.id,
          name: want.name,
          plannedAmountCents: toCents(want.plannedAmount),
          paidWith: want.paidWith === 'account' ? 'account' : 'card',
          includedInCardPlan: want.includedInCardPlan,
          archivedAt: want.archivedAt,
        })),
        payrollDeductions: scenario.deductions.map((deduction) => ({
          id: deduction.id,
          name: deduction.name,
          amountCents: toCents(deduction.value),
          type: deduction.type,
          employerContributionCents: toCents(deduction.employerContribution),
          linkedHoldingId: deduction.linkedHoldingId,
        })),
        budgetModel: {
          selectedId: scenario.selectedModelId,
          customPercentages: {
            needs: scenario.customModel.n,
            wants: scenario.customModel.d,
            investments: scenario.customModel.i,
          },
        },
        investmentAllocation: scenario.diversification,
      })),
      cycles: cyclePlans,
    },
    actuals: {
      cycles: actuals.map((cycle) => ({
        month: cycle.month,
        costPayments: Object.entries(cycle.costs).map(([planItemId, amount]) => ({
          planItemId,
          amountCents: toCents(amount),
        })),
        wantPayments: Object.entries(cycle.wants).map(([planItemId, amount]) => ({
          planItemId,
          amountCents: toCents(amount),
        })),
        cashMovements: [
          ...cycle.extraIncome.map((entry) => ({
            id: entry.id,
            kind: 'income' as const,
            name: entry.name,
            amountCents: toCents(entry.amount),
            sourceForecastEventId: entry.sourceEventId,
            sourceOccurrenceId: entry.sourceOccurrenceId,
            occurredAt: entry.occurredAt,
          })),
          ...cycle.extraExpenses.map((entry) => ({
            id: entry.id,
            kind: 'expense' as const,
            name: entry.name,
            amountCents: toCents(entry.amount),
            sourceForecastEventId: entry.sourceEventId,
            sourceOccurrenceId: entry.sourceOccurrenceId,
            occurredAt: entry.occurredAt,
          })),
        ],
      })),
    },
    cards: {
      currentDueMonth,
      personalSpendingLimitCents: toCents(settings.personalSpendingLimit),
      accounts: accounts.map<CardAccountV7>((account) => ({
        id: account.id,
        name: account.name,
        closingDay: account.closingDay,
        dueDay: account.dueDay,
        limitCents: toCents(account.limit),
      })),
      charges: entries.map((entry) => {
        const account = accountByName.get(normalizeText(entry.cardName)) ?? accounts[0]
        const dueMonth = entry.cycle === 'current' ? currentDueMonth : addMonths(currentDueMonth, 1)
        return {
          id: entry.id,
          accountId: account?.id ?? '',
          description: entry.description,
          purchaseDate: entry.purchaseDate,
          spendingMonth: validMonth(
            (entry as CreditCardEntry & { spendingMonth?: string }).spendingMonth,
            cardEntrySpendingMonth(entry, currentDueMonth),
          ),
          dueMonth,
          amountCents: toCents(entry.amount),
          personalAmountCents: toCents(entry.personalAmount),
          remainingAmountCents: toCents(entry.remainingAmount),
          budgetArea: entry.budgetArea,
          ownerName: entry.ownerName || undefined,
          ownerNote: entry.ownerNote || undefined,
          installmentNumber: entry.installmentCurrent,
          installmentCount: entry.installmentTotal,
          recurring: entry.isRecurring,
          prepaid: entry.isPrepaid,
          generatedFromChargeId: entry.sourceEntryId,
          entryType: entry.entryType,
          creditSource: entry.creditSource,
          cashCycleMonth: entry.cashCycleMonth,
          originCreditId: entry.originCreditId,
          sourceForecastOccurrenceId: entry.sourceForecastOccurrenceId,
        }
      }),
      statements: normalizePaidInvoiceSnapshots(
        collection<PaidInvoiceSnapshot[]>(document, 'cardPaidInvoices', []),
      ).map((statement) => ({
        id: `statement-${statement.dueMonth}`,
        accountId: null,
        dueMonth: statement.dueMonth,
        totalCents: statement.total === null ? null : toCents(statement.total),
        personalTotalCents: toCents(statement.personalTotal),
        paidAt: normalizePersistedInstant(statement.paidAt),
        forecastOccurrences: statement.forecastOccurrences?.map((item) => ({ id: item.id, amountCents: toCents(item.amount) })),
        credits: statement.credits?.map((credit) => ({
          id: credit.id,
          accountId: accountByName.get(normalizeText(credit.cardName))?.id ?? accounts[0]?.id ?? '',
          description: credit.description,
          date: credit.purchaseDate,
          amountCents: toCents(credit.amount),
          source: credit.source,
          cashCycleMonth: credit.cashCycleMonth,
          originCreditId: credit.originCreditId,
        })),
        spending: statement.spending.map((row) => ({
          month: row.spendingMonth,
          spentPersonalCents: toCents(row.spentPersonalTotal),
          duePersonalCents: toCents(row.duePersonalTotal),
          personalByAreaCents: areaMapToCents(row.personalByArea),
          unclassifiedPersonalCents: toCents(row.unclassifiedPersonal),
        })),
      })),
    },
    investments: {
      reserveTargetMonths: emergency.targetMonths,
      classes: collection<InvestmentAssetClass[]>(
        document,
        'investmentClasses',
        DEFAULT_INVESTMENT_CLASSES,
      ).map((item, index) => normalizeAssetClass(item, index)),
      holdings: holdings.map((holding) => ({
        id: holding.id,
        name: holding.name,
        assetClassId: holding.assetClassId,
        institution: holding.institution,
        purpose: holdingPurpose(holding),
        benchmark: holding.benchmark,
        liquidity: holding.liquidity,
        archivedAt: holding.archivedAt,
      })),
      valuations: holdings.map((holding) => ({
        id: `valuation-${holding.id}-${exportedAt}`,
        holdingId: holding.id,
        asOf: exportedAt,
        valueCents: toCents(holding.marketValue),
        source: 'current_position' as const,
      })),
      ledgerEntries,
    },
    balanceSheet: {
      assets: collection<Asset[]>(document, 'assets', []).map(normalizeAsset).map((asset) => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        currentValueCents: toCents(asset.value),
        annualAppreciationPct: asset.annualAppreciationPct,
        rentEquivalentCents:
          asset.rentEquivalent === undefined ? undefined : toCents(asset.rentEquivalent),
        createdAt: normalizePersistedInstant(asset.createdAt),
        note: asset.note,
        archivedAt: asset.archivedAt,
      })),
      debts: debts.map((debt) => ({
        id: debt.id,
        name: debt.name,
        kind: debt.kind,
        currentBalanceCents: toCents(debt.balance),
        monthlyRatePct: debt.monthlyRatePct,
        installmentCents: toCents(debt.installment),
        remainingInstallments: debt.remainingInstallments,
        linkedPlanCostId: debt.linkedCostId,
        linkedAssetId: debt.linkedAssetId,
        createdAt: normalizePersistedInstant(debt.createdAt),
        settledAt: debt.settledAt ? normalizePersistedInstant(debt.settledAt) : undefined,
        archivedAt: debt.archivedAt,
      })),
    },
    goals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmountCents: toCents(goal.targetAmount),
      targetMonth: goal.targetMonth,
      color: goal.color,
      createdAt: normalizePersistedInstant(goal.createdAt),
      completedAt: goal.completedAt ? normalizePersistedInstant(goal.completedAt) : undefined,
      archivedAt: goal.archivedAt,
      kind: goal.kind === 'tracking' ? 'tracking' : 'funding',
      includes: (goal.includes ?? []).map((item) => ({
        type: item.type,
        id: item.id,
        amountCents: item.amount === undefined ? undefined : toCents(item.amount),
      })),
    })),
    forecast: {
      events: collection<ExpectedEvent[]>(document, 'forecastEvents', [])
        .map(normalizeExpectedEvent)
        .map((event) => ({
          id: event.id,
          name: event.name,
          kind: event.kind,
          amountCents: toCents(event.amount),
          month: event.month,
          date: event.date,
          recurrence: event.recurrence,
          groupId: event.groupId,
          cashTreatment: event.cashTreatment,
          cardDueMonth: event.cardDueMonth,
          confirmed: event.confirmed,
          occurrenceOverrides: event.occurrenceOverrides && Object.fromEntries(
            Object.entries(event.occurrenceOverrides).map(([month, override]) => [month, {
              date: override.date, month: override.month,
              amountCents: override.amount === undefined ? undefined : toCents(override.amount),
              cancelled: override.cancelled,
              realizedAmountCents: override.realizedAmount === undefined ? undefined : toCents(override.realizedAmount),
              realizedAt: override.realizedAt,
            }]),
          ),
          savedPct: event.savedPct,
          goalId: event.goalId,
          note: event.note,
          createdAt: normalizePersistedInstant(event.createdAt),
        })),
      assumptions: (() => {
        const assumptions = normalizeAssumptions(
          collection<ForecastAssumptions>(document, 'forecastAssumptions', DEFAULT_ASSUMPTIONS),
        )
        return {
          monthlyContributionCents:
            assumptions.monthlyContribution === null
              ? null
              : toCents(assumptions.monthlyContribution),
          annualReturnPct: assumptions.annualReturnPct,
          inflationPct: assumptions.inflationPct,
          showInRealTerms: assumptions.showInRealTerms,
          includeLeftover: assumptions.includeLeftover,
          reinvestFreedInstallments: assumptions.reinvestFreedInstallments,
          horizonMonths: assumptions.horizonMonths,
        }
      })(),
    },
    history: {
      closures,
    },
  }
}

export function backupV7ToRepository(backup: FinTanoBackupV7): RepositoryDocument {
  const accounts: CreditCardAccount[] = backup.cards.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    closingDay: account.closingDay,
    dueDay: account.dueDay,
    limit: fromCents(account.limitCents),
  }))
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const scenarios: FinanceScenario[] = backup.planning.templates.map((template) =>
    normalizeScenario({
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      salaryNet: fromCents(template.salaryCents),
      salaryInputMode: template.salaryInputMode,
      costs: template.costs.map((cost) => ({
        id: cost.id,
        name: cost.name,
        value: fromCents(cost.amountCents),
        category: cost.category,
        sharedAmount:
          cost.sharedAmountCents === undefined ? undefined : fromCents(cost.sharedAmountCents),
        sharedWith: cost.sharedWith,
        paidWith: cost.paidWith,
        archivedAt: cost.archivedAt,
      })),
      wants: template.wants.map((want) => ({
        id: want.id,
        name: want.name,
        plannedAmount: fromCents(want.plannedAmountCents),
        paidWith: want.paidWith,
        includedInCardPlan: want.includedInCardPlan,
        archivedAt: want.archivedAt,
      })),
      deductions: template.payrollDeductions.map((deduction) => ({
        id: deduction.id,
        name: deduction.name,
        value: fromCents(deduction.amountCents),
        type: deduction.type,
        employerContribution: fromCents(deduction.employerContributionCents),
        linkedHoldingId: deduction.linkedHoldingId,
      })),
      selectedModelId: template.budgetModel.selectedId,
      customModel: {
        n: template.budgetModel.customPercentages.needs,
        d: template.budgetModel.customPercentages.wants,
        i: template.budgetModel.customPercentages.investments,
      },
      diversification: template.investmentAllocation,
    }),
  )
  const actuals: MonthlyActuals[] = backup.actuals.cycles.map((cycle) => ({
    month: cycle.month,
    costs: Object.fromEntries(
      cycle.costPayments.map((item) => [item.planItemId, fromCents(item.amountCents)]),
    ),
    wants: Object.fromEntries(
      cycle.wantPayments.map((item) => [item.planItemId, fromCents(item.amountCents)]),
    ),
    extraIncome: cycle.cashMovements
      .filter((item) => item.kind === 'income')
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: fromCents(item.amountCents),
        sourceEventId: item.sourceForecastEventId,
        sourceOccurrenceId: item.sourceOccurrenceId,
        occurredAt: item.occurredAt,
      })),
    extraExpenses: cycle.cashMovements
      .filter((item) => item.kind === 'expense')
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: fromCents(item.amountCents),
        sourceEventId: item.sourceForecastEventId,
        sourceOccurrenceId: item.sourceOccurrenceId,
        occurredAt: item.occurredAt,
      })),
  }))
  const latestValuationByHolding = new Map<string, (typeof backup.investments.valuations)[number]>()
  for (const valuation of backup.investments.valuations) {
    const current = latestValuationByHolding.get(valuation.holdingId)
    if (!current || valuation.asOf > current.asOf) {
      latestValuationByHolding.set(valuation.holdingId, valuation)
    }
  }
  const holdings: FinancialHolding[] = backup.investments.holdings.map((holding) => ({
    id: holding.id,
    name: holding.name,
    assetClassId: holding.assetClassId,
    institution: holding.institution,
    marketValue: fromCents(latestValuationByHolding.get(holding.id)?.valueCents),
    transactions: ledgerFromV7(backup.investments.ledgerEntries, 'holding', holding.id),
    purpose: holding.purpose,
    benchmark: holding.benchmark,
    liquidity: holding.liquidity,
    archivedAt: holding.archivedAt,
  }))
  const goals: FinancialGoal[] = backup.goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: fromCents(goal.targetAmountCents),
    targetMonth: goal.targetMonth,
    color: goal.color,
    transactions: ledgerFromV7(backup.investments.ledgerEntries, 'goal', goal.id),
    createdAt: goal.createdAt,
    completedAt: goal.completedAt,
    archivedAt: goal.archivedAt,
    kind: goal.kind,
    includes: goal.includes.map((item) => ({
      type: item.type,
      id: item.id,
      amount: item.amountCents === undefined ? undefined : fromCents(item.amountCents),
    })),
  }))
  const debts: Debt[] = backup.balanceSheet.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    kind: debt.kind,
    balance: fromCents(debt.currentBalanceCents),
    monthlyRatePct: debt.monthlyRatePct,
    installment: fromCents(debt.installmentCents),
    remainingInstallments: debt.remainingInstallments,
    linkedCostId: debt.linkedPlanCostId,
    linkedAssetId: debt.linkedAssetId,
    archivedAt: debt.archivedAt,
    transactions: ledgerFromV7(backup.investments.ledgerEntries, 'debt', debt.id),
    createdAt: debt.createdAt,
    settledAt: debt.settledAt,
  }))
  const firstDueDay = accounts[0]?.dueDay ?? backup.profile.activeCycle.cardDueHintDay
  const paymentDate = `${String(firstDueDay).padStart(2, '0')}/${backup.cards.currentDueMonth.slice(5)}`
  const cardEntries: CreditCardEntry[] = backup.cards.charges.map((charge) => {
    const account = accountById.get(charge.accountId)
    const cycle = charge.dueMonth === backup.cards.currentDueMonth ? 'current' : 'next'
    return {
      id: charge.id,
      cycle,
      description: charge.description,
      purchaseDate: charge.purchaseDate,
      cardName: account?.name ?? 'Cartão',
      amount: fromCents(charge.amountCents),
      personalAmount: fromCents(charge.personalAmountCents),
      remainingAmount: fromCents(charge.remainingAmountCents),
      budgetArea: charge.budgetArea,
      ownerName: charge.ownerName,
      ownerNote: charge.ownerNote,
      installmentCurrent: charge.installmentNumber,
      installmentTotal: charge.installmentCount,
      isRecurring: charge.recurring,
      isPrepaid: charge.prepaid,
      autoGenerated: charge.generatedFromChargeId ? true : undefined,
      sourceEntryId: charge.generatedFromChargeId,
      entryType: charge.entryType,
      creditSource: charge.creditSource,
      cashCycleMonth: charge.cashCycleMonth,
      originCreditId: charge.originCreditId,
      sourceForecastOccurrenceId: charge.sourceForecastOccurrenceId,
      spendingMonth: charge.spendingMonth,
    } as CreditCardEntry
  })

  return {
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    collections: {
      activeCycle: backup.profile.activeCycle,
      activeScenarioId: backup.profile.activePlanningTemplateId,
      scenarios,
      actuals,
      assets: backup.balanceSheet.assets.map<Asset>((asset) => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        value: fromCents(asset.currentValueCents),
        annualAppreciationPct: asset.annualAppreciationPct,
        rentEquivalent:
          asset.rentEquivalentCents === undefined
            ? undefined
            : fromCents(asset.rentEquivalentCents),
        createdAt: asset.createdAt,
        note: asset.note,
        archivedAt: asset.archivedAt,
      })),
      debts,
      cardAccounts: accounts,
      cardEntries,
      cardPaidInvoices: backup.cards.statements.map<PaidInvoiceSnapshot>((statement) => ({
        dueMonth: statement.dueMonth,
        total: statement.totalCents === null ? null : fromCents(statement.totalCents),
        personalTotal: fromCents(statement.personalTotalCents),
        paidAt: statement.paidAt,
        forecastOccurrences: statement.forecastOccurrences?.map((item) => ({ id: item.id, amount: fromCents(item.amountCents) })),
        credits: statement.credits?.map((credit) => ({
          id: credit.id,
          cardName: accountById.get(credit.accountId)?.name ?? 'Cartão',
          description: credit.description,
          purchaseDate: credit.date,
          amount: fromCents(credit.amountCents),
          source: credit.source,
          cashCycleMonth: credit.cashCycleMonth,
          originCreditId: credit.originCreditId,
        })),
        spending: statement.spending.map((row) => ({
          spendingMonth: row.month,
          spentPersonalTotal: fromCents(row.spentPersonalCents),
          duePersonalTotal: fromCents(row.duePersonalCents),
          personalByArea: areaMapFromCents(row.personalByAreaCents),
          unclassifiedPersonal: fromCents(row.unclassifiedPersonalCents),
        })),
      })),
      cardSettings: {
        paymentDate,
        personalSpendingLimit: fromCents(backup.cards.personalSpendingLimitCents),
        currentDueMonth: backup.cards.currentDueMonth,
      },
      emergencyFund: {
        current: 0,
        targetMonths: backup.investments.reserveTargetMonths,
        transactions: [],
      },
      forecastAssumptions: {
        monthlyContribution:
          backup.forecast.assumptions.monthlyContributionCents === null
            ? null
            : fromCents(backup.forecast.assumptions.monthlyContributionCents),
        annualReturnPct: backup.forecast.assumptions.annualReturnPct,
        inflationPct: backup.forecast.assumptions.inflationPct,
        showInRealTerms: backup.forecast.assumptions.showInRealTerms,
        includeLeftover: backup.forecast.assumptions.includeLeftover,
        reinvestFreedInstallments: backup.forecast.assumptions.reinvestFreedInstallments,
        horizonMonths: backup.forecast.assumptions.horizonMonths,
      },
      forecastEvents: backup.forecast.events.map<ExpectedEvent>((event) => ({
        id: event.id,
        name: event.name,
        kind: event.kind,
        amount: fromCents(event.amountCents),
        month: event.month,
        date: event.date,
        recurrence: event.recurrence,
        groupId: event.groupId,
        cashTreatment: event.cashTreatment,
        cardDueMonth: event.cardDueMonth,
        confirmed: event.confirmed,
        occurrenceOverrides: event.occurrenceOverrides && Object.fromEntries(
          Object.entries(event.occurrenceOverrides).map(([month, override]) => [month, {
            date: override.date, month: override.month,
            amount: override.amountCents === undefined ? undefined : fromCents(override.amountCents),
            cancelled: override.cancelled,
            realizedAmount: override.realizedAmountCents === undefined ? undefined : fromCents(override.realizedAmountCents),
            realizedAt: override.realizedAt,
          }]),
        ),
        savedPct: event.savedPct,
        goalId: event.goalId,
        note: event.note,
        createdAt: event.createdAt,
      })),
      goals,
      history: backup.history.closures.map(closureToSnapshot),
      investmentClasses: backup.investments.classes,
      investmentHoldings: holdings,
    },
  }
}

function parseLegacyCollection<T>(storage: Record<string, string>, key: string, fallback: T): T {
  const raw = storage[key]
  if (raw === undefined) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function legacyPayloadToRepository(payload: LegacyBackupPayloadLike): RepositoryDocument {
  const storage = payload.localStorage ?? {}
  const collections: Partial<Record<RepositoryCollection, unknown>> = {}
  for (const [collectionName, storageKey] of Object.entries(LEGACY_DOMAIN_KEYS) as [
    RepositoryCollection,
    string,
  ][]) {
    if (storage[storageKey] === undefined) continue
    collections[collectionName] = parseLegacyCollection(storage, storageKey, null)
  }

  if (!Array.isArray(collections.scenarios)) {
    const legacy = parseLegacyCollection<LegacyScenario[]>(storage, 'uf_scenarios_v2', [])
    if (Array.isArray(legacy) && legacy.length) {
      collections.scenarios = legacy.map(convertLegacyScenario)
      collections.activeScenarioId = parseLegacyCollection(
        storage,
        'uf_active_scenario_v2',
        legacy[0]?.id ?? '',
      )
    }
  }

  const entries = Array.isArray(collections.cardEntries)
    ? (collections.cardEntries as CreditCardEntry[])
    : []
  if (!Array.isArray(collections.cardAccounts) && entries.length) {
    const settings = normalizeCreditCardSettings(
      (collections.cardSettings as CreditCardSettings | undefined) ?? {
        paymentDate: '05/01',
        personalSpendingLimit: 0,
      },
    )
    collections.cardAccounts = ensureAccounts([], entries, settings)
  }
  if (!Array.isArray(collections.cardPaidInvoices)) {
    const legacyInvoice = parseLegacyCollection<Partial<PaidInvoiceSnapshot> | null>(
      storage,
      'uf_credit_card_last_paid_invoice_v1',
      null,
    )
    collections.cardPaidInvoices = legacyInvoice ? [legacyInvoice] : []
  }

  return {
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    updatedAt: payload.exportedAt ?? new Date().toISOString(),
    collections,
  }
}

function isBackupV7(value: unknown): value is FinTanoBackupV7 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FinTanoBackupV7>
  return (
    candidate.app === 'fintano' &&
    candidate.schemaVersion === 7 &&
    candidate.currency === 'BRL' &&
    candidate.timezone === 'America/Sao_Paulo' &&
    !!candidate.profile &&
    Array.isArray(candidate.planning?.templates) &&
    Array.isArray(candidate.planning?.cycles) &&
    Array.isArray(candidate.actuals?.cycles) &&
    Array.isArray(candidate.cards?.accounts) &&
    Array.isArray(candidate.cards?.charges) &&
    Array.isArray(candidate.investments?.holdings) &&
    Array.isArray(candidate.investments?.valuations) &&
    Array.isArray(candidate.investments?.ledgerEntries) &&
    Array.isArray(candidate.forecast?.events) &&
    Array.isArray(candidate.goals) &&
    Array.isArray(candidate.balanceSheet?.debts) &&
    Array.isArray(candidate.history?.closures)
  )
}

function inspectV8(backup: FinTanoBackupV8, migratedFromVersion: number | null): BackupInspection {
  const issues: BackupValidationIssue[] = []
  const add = (
    severity: BackupValidationIssue['severity'],
    code: string,
    message: string,
    entityId?: string,
  ) => issues.push({ severity, code, message, entityId })

  const ids = (items: { id: string }[], label: string) => {
    const seen = new Set<string>()
    for (const item of items) {
      if (!item.id) add('error', 'missing_id', `${label} sem ID.`)
      else if (seen.has(item.id)) add('error', 'duplicate_id', `${label} com ID duplicado.`, item.id)
      seen.add(item.id)
    }
    return seen
  }
  const templateIds = ids(backup.planning.templates, 'Planejamento')
  const accountIds = ids(backup.cards.accounts, 'Cartão')
  const holdingIds = ids(backup.investments.holdings, 'Posição')
  const classIds = ids(backup.investments.classes, 'Classe de ativo')
  const assetIds = ids(backup.balanceSheet.assets, 'Bem')
  const costIds = new Set(backup.planning.templates.flatMap((template) => template.costs.map((cost) => cost.id)))
  ids(backup.investments.valuations, 'Avaliação de posição')
  const goalIds = ids(backup.goals, 'Meta')
  for (const goal of backup.goals) {
    for (const inclusion of goal.includes ?? []) {
      if (inclusion.type === 'holding' && inclusion.id && !holdingIds.has(inclusion.id)) {
        add('warning', 'goal_holding_missing', 'Meta aponta para posição inexistente.', goal.id)
      }
      if (inclusion.type === 'class' && inclusion.id && !classIds.has(inclusion.id)) {
        add('warning', 'goal_class_missing', 'Meta aponta para classe inexistente.', goal.id)
      }
    }
  }
  for (const debt of backup.balanceSheet.debts) {
    if (debt.linkedPlanCostId && !costIds.has(debt.linkedPlanCostId)) {
      add('warning', 'debt_cost_missing', 'Dívida aponta para custo inexistente.', debt.id)
    }
    if (debt.linkedAssetId && !assetIds.has(debt.linkedAssetId)) {
      add('warning', 'debt_asset_missing', 'Dívida aponta para bem inexistente.', debt.id)
    }
  }
  for (const asset of backup.balanceSheet.assets) {
    if (asset.archivedAt && !Number.isFinite(Date.parse(asset.archivedAt))) {
      add('error', 'asset_archive_invalid', 'Bem tem data de arquivamento inválida.', asset.id)
    }
  }
  for (const event of backup.forecast.events) {
    if (event.goalId && !goalIds.has(event.goalId)) {
      add('warning', 'forecast_goal_missing', 'Evento aponta para meta inexistente.', event.id)
    }
  }
  for (const holding of backup.investments.holdings) {
    if (holding.archivedAt && !Number.isFinite(Date.parse(holding.archivedAt))) {
      add('error', 'holding_archive_invalid', 'Posição tem data de arquivamento inválida.', holding.id)
    }
  }
  for (const goal of backup.goals) {
    if (goal.archivedAt && !Number.isFinite(Date.parse(goal.archivedAt))) {
      add('error', 'goal_archive_invalid', 'Meta tem data de arquivamento inválida.', goal.id)
    }
  }
  for (const debt of backup.balanceSheet.debts) {
    if (debt.archivedAt && !Number.isFinite(Date.parse(debt.archivedAt))) {
      add('error', 'debt_archive_invalid', 'Dívida tem data de arquivamento inválida.', debt.id)
    }
  }
  for (const template of backup.planning.templates) {
    for (const cost of template.costs) {
      if (cost.archivedAt && !Number.isFinite(Date.parse(cost.archivedAt))) {
        add('error', 'cost_archive_invalid', 'Custo tem data de arquivamento inválida.', cost.id)
      }
    }
    for (const want of template.wants) {
      if (want.archivedAt && !Number.isFinite(Date.parse(want.archivedAt))) {
        add('error', 'want_archive_invalid', 'Desejo tem data de arquivamento inválida.', want.id)
      }
    }
  }
  const fundIds = ids(backup.forecast.funds, 'Grupo de compromisso')
  ids(backup.forecast.events, 'Evento esperado')
  const debtIds = ids(backup.balanceSheet.debts, 'Dívida')
  ids(backup.cards.charges, 'Cobrança')
  ids(backup.investments.ledgerEntries, 'Movimentação')
  ids(backup.history.closures, 'Fechamento')

  for (const event of backup.forecast.events) {
    if (event.groupId && !fundIds.has(event.groupId)) {
      add('error', 'forecast_fund_missing', 'Evento aponta para grupo inexistente.', event.id)
    }
    if (event.date && event.date.slice(0, 7) !== event.month) {
      add('error', 'forecast_date_month_mismatch', 'Data do evento não corresponde ao mês.', event.id)
    }
    if (event.date && !validCalendarDate(event.date)) {
      add('error', 'forecast_date_invalid', 'Data inválida no evento esperado.', event.id)
    }
    if (event.amountCents <= 0) {
      add('error', 'forecast_amount_invalid', 'Evento esperado precisa ter valor positivo.', event.id)
    }
    if (event.cashTreatment === 'card' && event.cardDueMonth && event.cardDueMonth < event.month) {
      add('error', 'forecast_card_due_invalid', 'Fatura não pode vencer antes da cobrança.', event.id)
    }
    for (const [originalMonth, override] of Object.entries(event.occurrenceOverrides ?? {})) {
      if (!MONTH_RE.test(originalMonth) || (override.date && !validCalendarDate(override.date)) ||
        (override.month && !MONTH_RE.test(override.month)) ||
        (override.date && override.month && override.date.slice(0, 7) !== override.month) ||
        (override.realizedAt && !validCalendarDate(override.realizedAt)) ||
        (override.realizedAmountCents !== undefined && override.realizedAmountCents <= 0)) {
        add('error', 'forecast_override_invalid', 'Ajuste de ocorrência tem mês ou data inválida.', event.id)
      }
    }
  }
  const usedFundingGoals = new Set<string>()
  for (const fund of backup.forecast.funds) {
    if (fund.reservedAmountCents < 0) add('error', 'forecast_fund_negative', 'Valor reservado não pode ser negativo.', fund.id)
    if (fund.goalId && !goalIds.has(fund.goalId)) add('warning', 'forecast_fund_goal_missing', 'A meta vinculada ao grupo não existe mais; o valor manual continua disponível.', fund.id)
    if (fund.goalId && usedFundingGoals.has(fund.goalId)) add('error', 'forecast_goal_reused', 'A mesma meta não pode financiar dois grupos.', fund.id)
    if (fund.goalId) usedFundingGoals.add(fund.goalId)
  }

  for (const plan of backup.planning.cycles) {
    if (!templateIds.has(plan.planningTemplateId)) {
      add('warning', 'cycle_plan_template_missing', 'Plano mensal aponta para modelo inexistente.', plan.id)
    }
  }

  if (!templateIds.has(backup.profile.activePlanningTemplateId)) {
    add('error', 'active_template_missing', 'O planejamento ativo não existe no arquivo.')
  }
  for (const charge of backup.cards.charges) {
    if (!accountIds.has(charge.accountId)) {
      add('error', 'card_reference_missing', 'Cobrança aponta para cartão inexistente.', charge.id)
    }
  }
  for (const statement of backup.cards.statements) {
    for (const credit of statement.credits ?? []) {
      if (!accountIds.has(credit.accountId)) {
        add('error', 'card_credit_reference_missing', 'Abatimento aponta para cartão inexistente.', credit.id)
      }
    }
  }
  for (const entry of backup.investments.ledgerEntries) {
    const ownerExists =
      (entry.ownerType === 'holding' && holdingIds.has(entry.ownerId)) ||
      (entry.ownerType === 'goal' && goalIds.has(entry.ownerId)) ||
      (entry.ownerType === 'debt' && debtIds.has(entry.ownerId))
    if (!ownerExists) {
      add('error', 'ledger_owner_missing', 'Movimentação aponta para entidade inexistente.', entry.id)
    }
  }
  for (const valuation of backup.investments.valuations) {
    if (!holdingIds.has(valuation.holdingId)) {
      add('error', 'valuation_holding_missing', 'Avaliação aponta para posição inexistente.', valuation.id)
    }
  }
  for (const template of backup.planning.templates) {
    for (const deduction of template.payrollDeductions) {
      if (deduction.type === 'previdencia_privada' && !deduction.linkedHoldingId) {
        add(
          'warning',
          'pension_holding_missing',
          `A previdência “${deduction.name}” ainda não está vinculada a uma posição patrimonial.`,
          deduction.id,
        )
      } else if (deduction.linkedHoldingId && !holdingIds.has(deduction.linkedHoldingId)) {
        add(
          'error',
          'pension_holding_invalid',
          'Previdência aponta para uma posição inexistente.',
          deduction.id,
        )
      }
    }
  }
  for (const closure of backup.history.closures) {
    if (!templateIds.has(closure.planningTemplateId)) {
      add(
        'warning',
        'closure_template_missing',
        `Fechamento ${closure.month} preserva o nome do planejamento, mas o modelo original não existe mais.`,
        closure.id,
      )
    }
    if (closure.investments.employerCents === null) {
      add(
        'warning',
        'employer_contribution_unknown',
        `Contrapartida da empresa não informada em ${closure.month}.`,
        closure.id,
      )
    }
  }

  const scanMoney = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scanMoney(item, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key
      if (
        key.endsWith('Cents') &&
        child !== null &&
        child !== undefined &&
        typeof child !== 'object' &&
        !Number.isInteger(child)
      ) {
        add('error', 'money_not_integer', `${nextPath} precisa ser inteiro em centavos.`)
      }
      scanMoney(child, nextPath)
    }
  }
  scanMoney(backup, '')

  return {
    backup,
    migratedFromVersion,
    issues,
    counts: {
      planningTemplates: backup.planning.templates.length,
      cyclePlans: backup.planning.cycles.length,
      cyclesWithActuals: backup.actuals.cycles.length,
      cardCharges: backup.cards.charges.length,
      holdings: backup.investments.holdings.length,
      valuations: backup.investments.valuations.length,
      ledgerEntries: backup.investments.ledgerEntries.length,
      closures: backup.history.closures.length,
    },
  }
}

export function inspectBackupPayload(payload: unknown): BackupInspection {
  if (isBackupV8(payload)) return inspectV8(payload, null)
  if (isBackupV7(payload)) return inspectV8(migrateV7ToV8(payload), 7)
  if (!payload || typeof payload !== 'object') throw new Error('Backup inválido.')
  const legacy = payload as LegacyBackupPayloadLike
  if (!legacy.localStorage || typeof legacy.localStorage !== 'object') {
    throw new Error('O arquivo não contém dados reconhecidos do FinTano.')
  }
  const backup = repositoryToBackupV8(
    legacyPayloadToRepository(legacy),
    legacy.exportedAt ?? new Date().toISOString(),
  )
  return inspectV8(backup, typeof legacy.version === 'number' ? legacy.version : 6)
}

function migrateV7ToV8(backup: FinTanoBackupV7): FinTanoBackupV8 {
  return { ...backup, schemaVersion: 8, forecast: { ...backup.forecast, funds: [] } }
}

function isBackupV8(value: unknown): value is FinTanoBackupV8 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FinTanoBackupV8>
  return candidate.app === 'fintano' && candidate.schemaVersion === 8 &&
    candidate.currency === 'BRL' && candidate.timezone === 'America/Sao_Paulo' &&
    Array.isArray(candidate.forecast?.events) && Array.isArray(candidate.forecast?.funds) &&
    Array.isArray(candidate.planning?.templates) && Array.isArray(candidate.planning?.cycles) &&
    Array.isArray(candidate.actuals?.cycles) && Array.isArray(candidate.cards?.accounts) &&
    Array.isArray(candidate.cards?.charges) && Array.isArray(candidate.cards?.statements) &&
    Array.isArray(candidate.investments?.holdings) && Array.isArray(candidate.investments?.valuations) &&
    Array.isArray(candidate.investments?.ledgerEntries) && Array.isArray(candidate.balanceSheet?.debts) &&
    Array.isArray(candidate.goals) &&
    Array.isArray(candidate.history?.closures)
}

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function repositoryToBackupV8(document: RepositoryDocument, exportedAt = new Date().toISOString()): FinTanoBackupV8 {
  const base = repositoryToBackupV7(document, exportedAt)
  const funds = Array.isArray(document.collections.forecastFunds)
    ? document.collections.forecastFunds as { id: string; name: string; reservedAmount: number; goalId?: string }[] : []
  return {
    ...base,
    schemaVersion: 8,
    forecast: { ...base.forecast, funds: funds.map((fund) => ({
      id: fund.id, name: fund.name, reservedAmountCents: toCents(fund.reservedAmount), goalId: fund.goalId,
    })) },
  }
}

export function backupV8ToRepository(backup: FinTanoBackupV8): RepositoryDocument {
  const base = backupV7ToRepository({ ...backup, schemaVersion: 7 })
  base.collections.forecastFunds = backup.forecast.funds.map((fund) => ({
    id: fund.id, name: fund.name, reservedAmount: fromCents(fund.reservedAmountCents), goalId: fund.goalId,
  }))
  return base
}

export function createEmptyBackupV7(exportedAt = new Date().toISOString()): FinTanoBackupV7 {
  const month = new Date().toISOString().slice(0, 7)
  return repositoryToBackupV7(
    {
      schemaVersion: 7,
      updatedAt: exportedAt,
      collections: {
        activeCycle: { month, salaryHintDay: 1, cardDueHintDay: 5 },
        activeScenarioId: '',
        scenarios: [],
      },
    },
    exportedAt,
  )
}

export function createEmptyBackupV8(exportedAt = new Date().toISOString()): FinTanoBackupV8 {
  return migrateV7ToV8(createEmptyBackupV7(exportedAt))
}

export function migratedBackupFileName(originalName: string): string {
  const base = originalName.replace(/\.json$/i, '')
  return `${base}-v8.json`
}

export function migrationReport(inspection: BackupInspection) {
  return {
    schemaVersion: 8,
    migratedFromVersion: inspection.migratedFromVersion,
    generatedAt: new Date().toISOString(),
    counts: inspection.counts,
    issues: inspection.issues,
  }
}
