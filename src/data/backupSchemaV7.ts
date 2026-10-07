import type {
  AssetKind,
  BudgetArea,
  CostCategory,
  DebtKind,
  DeductionType,
  ExpectedEventKind,
  ExpectedEventRecurrence,
  EventCashTreatment,
  GoalInclusionType,
  GoalKind,
  PaymentMethod,
  SalaryInputMode,
} from '../types'
import type { InvestmentPurpose } from '../lib/investments'

export type MoneyCents = number
export type MonthKey = string

export interface FinTanoBackupV7 {
  app: 'fintano'
  schemaVersion: 7
  exportedAt: string
  currency: 'BRL'
  timezone: 'America/Sao_Paulo'
  profile: {
    activeCycle: { month: MonthKey; salaryHintDay: number; cardDueHintDay: number }
    activePlanningTemplateId: string
  }
  planning: {
    templates: PlanningTemplateV7[]
    cycles: CyclePlanV7[]
  }
  actuals: {
    cycles: CycleActualsV7[]
  }
  cards: {
    currentDueMonth: MonthKey
    personalSpendingLimitCents: MoneyCents
    accounts: CardAccountV7[]
    charges: CardChargeV7[]
    statements: CardStatementV7[]
  }
  investments: {
    reserveTargetMonths: number
    classes: InvestmentClassV7[]
    holdings: InvestmentHoldingV7[]
    valuations: InvestmentValuationV7[]
    ledgerEntries: DomainLedgerEntryV7[]
  }
  balanceSheet: {
    assets: AssetV7[]
    debts: DebtV7[]
  }
  goals: GoalV7[]
  forecast: {
    events: ForecastEventV7[]
    assumptions: ForecastAssumptionsV7
  }
  history: {
    closures: CycleClosureV7[]
  }
}

export interface PlanningTemplateV7 {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  salaryCents: MoneyCents
  investmentTargetCents?: MoneyCents | null
  salaryInputMode: SalaryInputMode
  costs: {
    id: string
    name: string
    amountCents: MoneyCents
    category: CostCategory
    sharedAmountCents?: MoneyCents
    sharedWith?: string
    paidWith: PaymentMethod
    archivedAt?: string
  }[]
  wants: {
    id: string
    name: string
    kind?: 'regular' | 'card_envelope'
    plannedAmountCents: MoneyCents
    paidWith: PaymentMethod
    includedInCardPlan?: boolean
    archivedAt?: string
  }[]
  payrollDeductions: {
    id: string
    name: string
    amountCents: MoneyCents
    type: DeductionType
    employerContributionCents: MoneyCents
    linkedHoldingId?: string
  }[]
  budgetModel: {
    selectedId: string
    customPercentages: { needs: number; wants: number; investments: number }
  }
  investmentAllocation: {
    id: string
    name: string
    percentage: number
    color: string
  }[]
}

export interface CyclePlanV7 {
  id: string
  month: MonthKey
  planningTemplateId: string
  status: 'open' | 'closed'
  capturedAt: string
  totals: {
    availableForBudgetCents: MoneyCents
    costsCents: MoneyCents
    wantsCents: MoneyCents
    personalInvestmentCents: MoneyCents
    cardCents: MoneyCents
  }
}

export interface CycleActualsV7 {
  month: MonthKey
  paycheck?: { amountCents: MoneyCents; payrollInvestmentCents: MoneyCents; employerInvestmentCents: MoneyCents;
    origin?: 'manual' | 'confirmed_from_plan' }
  costPayments: { planItemId: string; amountCents: MoneyCents; origin?: 'manual' | 'confirmed_from_plan' }[]
  wantPayments: { planItemId: string; amountCents: MoneyCents; origin?: 'manual' | 'confirmed_from_plan' }[]
  cashMovements: {
    id: string
    kind: 'income' | 'expense'
    name: string
    amountCents: MoneyCents
    sourceForecastEventId?: string
    sourceOccurrenceId?: string
    occurredAt?: string
  }[]
}

export interface CardAccountV7 {
  id: string
  name: string
  currentDueMonth?: MonthKey
  confirmedEmptyDueMonths?: MonthKey[]
  closingDay: number
  dueDay: number
  limitCents: MoneyCents
}

export interface CardChargeV7 {
  id: string
  accountId: string
  description: string
  purchaseDate: string
  spendingMonth: MonthKey
  dueMonth: MonthKey
  amountCents: MoneyCents
  personalAmountCents: MoneyCents
  remainingAmountCents: MoneyCents
  budgetArea?: BudgetArea
  ownerName?: string
  ownerNote?: string
  installmentNumber?: number
  installmentCount?: number
  recurring?: boolean
  prepaid?: boolean
  generatedFromChargeId?: string
  entryType?: 'invoiceCredit'
  creditSource?: 'payment' | 'reward'
  cashCycleMonth?: MonthKey
  originCreditId?: string
  sourceForecastOccurrenceId?: string
}

export interface CardStatementV7 {
  id: string
  accountId: string | null
  dueMonth: MonthKey
  totalCents: MoneyCents | null
  personalTotalCents: MoneyCents
  paidAt: string
  charges?: CardChargeV7[]
  forecastOccurrences?: { id: string; amountCents: MoneyCents }[]
  credits?: { id: string; accountId: string; description: string; date: string; amountCents: MoneyCents; source: 'payment' | 'reward'; cashCycleMonth?: MonthKey; originCreditId?: string }[]
  spending: {
    month: MonthKey
    spentPersonalCents: MoneyCents
    duePersonalCents: MoneyCents
    personalByAreaCents: Record<BudgetArea, MoneyCents>
    unclassifiedPersonalCents: MoneyCents
  }[]
}

export interface InvestmentClassV7 {
  id: string
  name: string
  color: string
}

export interface InvestmentHoldingV7 {
  id: string
  name: string
  assetClassId: string
  institution?: string
  purpose: InvestmentPurpose
  benchmark?: string
  liquidity?: string
  archivedAt?: string
}

export interface InvestmentValuationV7 {
  id: string
  holdingId: string
  asOf: string
  valueCents: MoneyCents
  source: 'current_position'
}

export type LedgerOwnerType = 'holding' | 'goal' | 'debt'
export type LedgerEntryKind =
  | 'opening_balance'
  | 'contribution'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'balance_increase'
  | 'amortization'
  | 'adjustment'

export interface DomainLedgerEntryV7 {
  id: string
  ownerType: LedgerOwnerType
  ownerId: string
  kind: LedgerEntryKind
  amountCents: MoneyCents
  competenceMonth: MonthKey
  occurredAt: string
  recordedAt?: string
  operationId?: string
  cashTreatment?: 'extra' | 'planned_cost'
  linkedCostId?: string
  kindSource?: 'user' | 'legacy_inferred' | 'legacy_ambiguous'
  note?: string
}

export interface AssetV7 {
  id: string
  name: string
  kind: AssetKind
  currentValueCents: MoneyCents
  annualAppreciationPct: number
  rentEquivalentCents?: MoneyCents
  createdAt: string
  note?: string
  archivedAt?: string
}

export interface DebtV7 {
  id: string
  name: string
  kind: DebtKind
  currentBalanceCents: MoneyCents
  monthlyRatePct: number
  installmentCents: MoneyCents
  remainingInstallments: number
  linkedPlanCostId?: string
  linkedAssetId?: string
  createdAt: string
  settledAt?: string
  archivedAt?: string
}

export interface GoalV7 {
  id: string
  name: string
  targetAmountCents: MoneyCents
  targetMonth?: MonthKey
  color: string
  createdAt: string
  completedAt?: string
  archivedAt?: string
  kind: GoalKind
  includes: {
    type: GoalInclusionType
    id?: string
    amountCents?: MoneyCents
  }[]
}

export interface ForecastEventV7 {
  id: string
  name: string
  kind: ExpectedEventKind
  amountCents: MoneyCents
  month: MonthKey
  date?: string
  recurrence: ExpectedEventRecurrence
  groupId?: string
  cashTreatment?: EventCashTreatment
  cardDueMonth?: MonthKey
  confirmed?: boolean
  occurrenceOverrides?: Record<string, { date?: string; month?: MonthKey; amountCents?: MoneyCents; cancelled?: boolean; realizedAmountCents?: MoneyCents; realizedAt?: string }>
  savedPct?: number
  goalId?: string
  note?: string
  createdAt: string
}

export interface ForecastAssumptionsV7 {
  monthlyContributionCents: MoneyCents | null
  annualReturnPct: number
  inflationPct: number
  showInRealTerms: boolean
  includeLeftover: boolean
  reinvestFreedInstallments: boolean
  horizonMonths: number
}

export interface CycleClosureV7 {
  id: string
  month: MonthKey
  closedAt: string
  planningTemplateId: string
  planningTemplateNameAtClose: string
  plan: {
    availableForBudgetCents: MoneyCents
    costsCents: MoneyCents
    wantsCents: MoneyCents
    personalInvestmentCents: MoneyCents
    cardCents: MoneyCents
  }
  cash: {
    paycheckCents: MoneyCents
    thirdPartyAdvancedCents?: MoneyCents
    reimbursementsReceivedCents?: MoneyCents
    extraIncomeCents: MoneyCents
    extraIncomeEntries: { id: string; name: string; amountCents: MoneyCents; sourceForecastEventId?: string; sourceOccurrenceId?: string; occurredAt?: string }[]
    extraExpenseCents: MoneyCents
    extraExpenseEntries: { id: string; name: string; amountCents: MoneyCents; sourceForecastEventId?: string; sourceOccurrenceId?: string; occurredAt?: string }[]
    costsCents: MoneyCents
    wantsCents: MoneyCents
    leftoverCents: MoneyCents
  }
  investments: {
    payrollPersonalCents: MoneyCents
    employerCents: MoneyCents | null
    directAtCloseCents: MoneyCents
    openingBalanceCents: MoneyCents
  }
  balanceSheetMark: {
    financialAssetsCents: MoneyCents
    physicalAssetsCents: MoneyCents
    liabilitiesCents: MoneyCents
    securedLiabilitiesCents: MoneyCents
    emergencyFundCents: MoneyCents
  }
  costByCategoryCents: Partial<Record<CostCategory, MoneyCents>>
  wantAllocations: {
    id: string
    name: string
    plannedCents: MoneyCents
    actualCents: MoneyCents
    paidWith: PaymentMethod
  }[]
  card: {
    personalTotalCents: MoneyCents
    personalByAreaCents: Partial<Record<BudgetArea, MoneyCents>>
  }
  note?: string
}

export interface BackupValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  entityId?: string
}

export interface BackupInspection {
  backup: FinTanoBackupV9
  migratedFromVersion: number | null
  issues: BackupValidationIssue[]
  counts: {
    planningTemplates: number
    cyclePlans: number
    monthlyPlans: number
    cyclesWithActuals: number
    cardCharges: number
    holdings: number
    valuations: number
    ledgerEntries: number
    closures: number
  }
}

export interface FinTanoBackupV8 extends Omit<FinTanoBackupV7, 'schemaVersion' | 'forecast'> {
  schemaVersion: 8
  forecast: FinTanoBackupV7['forecast'] & {
    funds: { id: string; name: string; reservedAmountCents: MoneyCents; goalId?: string }[]
  }
}

/** v9 explicita o valor atual sem reduzir o histórico de avaliações aceito no arquivo. */
export interface FinTanoBackupV9 extends Omit<FinTanoBackupV8, 'schemaVersion' | 'investments' | 'cards'> {
  schemaVersion: 9
  cards: FinTanoBackupV8['cards'] & { thirdParties?: CardThirdPartyV9[] }
  profile: FinTanoBackupV8['profile'] & { recurringTemplateId?: string }
  planning: FinTanoBackupV8['planning'] & { monthlyPlans?: MonthlyPlanV9[] }
  investments: Omit<FinTanoBackupV8['investments'], 'holdings'> & {
    holdings: (InvestmentHoldingV7 & { currentValueCents: MoneyCents })[]
  }
}

export interface MonthlyPlanV9 {
  id: string
  month: MonthKey
  sourceTemplateId: string
  sourceTemplateName: string
  createdAt: string
  updatedAt: string
  customized: boolean
  fixedReference?: { fixedAt: string; template: PlanningTemplateV7 }
  data: Omit<PlanningTemplateV7, 'id' | 'name' | 'createdAt' | 'updatedAt'>
}

export interface CardThirdPartyV9 {
  id: string; entryId: string; accountId: string; dueMonth: MonthKey; cashMonth: MonthKey
  description: string; ownerName: string; amountCents: MoneyCents; fundedBy: 'user' | 'third_party'
  payments: { id: string; amountCents: MoneyCents; cycleMonth: MonthKey; occurredOn: string }[]
}
