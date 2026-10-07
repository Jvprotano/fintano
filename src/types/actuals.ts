import type { CostCategory, CostItem, WantItem } from './budget'
import type { BudgetArea, PaymentMethod } from './core'

export interface ExtraIncomeEntry {
  id: string
  name: string
  amount: number
  sourceEventId?: string
  sourceOccurrenceId?: string
  occurredAt?: string
}

export type ExtraExpenseEntry = ExtraIncomeEntry

export interface MonthlyActuals {
  month: string
  /** Folha efetivamente recebida; ausente significa que ainda não foi confirmada. */
  paycheck?: { amount: number; payrollInvestment: number; employerInvestment: number;
    origin?: 'manual' | 'confirmed_from_plan' }
  costs: Record<string, number>
  costOrigins?: Record<string, 'manual' | 'confirmed_from_plan'>
  /** Valor efetivamente destinado a cada item de Desejos neste ciclo. */
  wants: Record<string, number>
  wantOrigins?: Record<string, 'manual' | 'confirmed_from_plan'>
  extraIncome: ExtraIncomeEntry[]
  extraExpenses: ExtraExpenseEntry[]
}

export interface ActualsSummary {
  month: string
  paycheck: MonthlyActuals['paycheck'] | null
  extraIncome: ExtraIncomeEntry[]
  extraIncomeTotal: number
  extraExpenses: ExtraExpenseEntry[]
  extraExpenseTotal: number
  effectiveCosts: number
  confirmedCosts: number
  pendingCosts: number
  plannedCosts: number
  variance: number
  informedCount: number
  byCategory: Map<CostCategory, number>
  rows: {
    cost: CostItem
    planned: number
    actual: number | null
    origin: 'manual' | 'confirmed_from_plan' | null
    effective: number
    variance: number
  }[]
  effectiveWants: number
  confirmedWants: number
  pendingWants: number
  plannedWants: number
  wantsVariance: number
  informedWantsCount: number
  wantRows: {
    want: WantItem
    planned: number
    actual: number | null
    origin: 'manual' | 'confirmed_from_plan' | null
    effective: number
    variance: number
  }[]
}

export interface WantAllocationSnapshot {
  id: string
  name: string
  planned: number
  actual: number
  paidWith?: PaymentMethod
  /** Campo legado usado para remover detalhamentos do cartão gravados pela versão inicial. */
  includedInCardPlan: boolean
}

export interface MonthlySnapshot {
  corrections?: HistoryCorrection[]
  planEstimated?: boolean
  id: string
  month: string
  closedAt: string
  scenarioId: string
  scenarioName: string
  availableForBudget: number
  paycheckInAccount: number
  extraIncome: number
  extraIncomeEntries: ExtraIncomeEntry[]
  thirdPartyAdvanced?: number
  reimbursementsReceived?: number
  extraExpense: number
  extraExpenseEntries: ExtraExpenseEntry[]
  costs: number
  costsPlanned: number
  /** Total efetivamente destinado a Desejos fora do cartão no ciclo. */
  wants: number
  wantsPlanned: number
  wantAllocations: WantAllocationSnapshot[]
  /** Previdência descontada em folha, congelada no fechamento do ciclo. */
  payrollInvested: number
  /** Contrapartida da empresa creditada na previdência; não reduz o caixa. */
  employerInvested: number
  /** Ausente em fechamentos antigos: zero conhecido não é o mesmo que dado desconhecido. */
  employerInvestmentKnown: boolean
  /** Aporte líquido do livro-razão no instante do fechamento, mantido para auditoria. */
  directInvestedAtClose: number
  /** Posição de abertura registrada no mês; patrimônio, não aporte do ciclo. */
  openingBalance: number
  /** A partir da versão 1, o realizado direto é projetado do livro-razão atual. */
  investmentProjectionVersion: number
  invested: number
  /** Distingue uma meta realmente fechada do fallback neutro de snapshots antigos. */
  investmentPlanCaptured: boolean
  investedPlanned: number
  balance: number
  savingsRate: number
  costsByCategory: Partial<Record<CostCategory, number>>
  /** Nome legado no storage: representa somente ativos financeiros. */
  grossAssets: number
  physicalAssets: number
  liabilities: number
  securedLiabilities: number
  netWorth: number
  emergencyFund: number
  cardPersonalTotal: number
  cardPlanned: number
  cardByArea: Partial<Record<BudgetArea, number>>
  cashLeftover: number
  note?: string
}

export interface HistoryCorrection {
  id: string
  correctedAt: string
  reason: string
  revisedMonths: string[]
  changes: { label: string; before: string; after: string; source: string }[]
}

export interface HistoryPoint extends MonthlySnapshot {
  financialAssets: number
  unsecuredLiabilities: number
  financialNetWorth: number
  propertyEquity: number
  netWorthDelta: number | null
  costsDelta: number | null
  wantsDelta: number | null
  investedDelta: number | null
  cardDelta: number | null
}

export type SnapshotPatch = Partial<
  Pick<
    MonthlySnapshot,
    | 'availableForBudget'
    | 'paycheckInAccount'
    | 'extraIncome'
    | 'extraExpense'
    | 'costs'
    | 'costsPlanned'
    | 'wants'
    | 'wantsPlanned'
    | 'payrollInvested'
    | 'employerInvested'
    | 'investedPlanned'
    | 'grossAssets'
    | 'physicalAssets'
    | 'liabilities'
    | 'securedLiabilities'
    | 'emergencyFund'
    | 'cardPersonalTotal'
    | 'cardPlanned'
    | 'cashLeftover'
    | 'note'
  >
>

export interface HistoryStats {
  months: number
  averageCosts: number
  averageWants: number
  averageInvested: number
  averageSavingsRate: number
  averageCardPersonal: number
  netWorthGrowth: number
  netWorthGrowthPct: number
  bestSavingsMonth: MonthlySnapshot | null
}
