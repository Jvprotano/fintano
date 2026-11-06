import type { LedgerEntry } from './core'
import type { GoalCurrency } from './exchange'

export interface EmergencyFundState {
  current: number
  targetMonths: number
  transactions: LedgerEntry[]
}

export type GoalInclusionType =
  | 'reserve'
  | 'investments'
  | 'goals'
  | 'class'
  | 'holding'
  | 'debts'
  | 'assets'

export interface GoalInclusion {
  type: GoalInclusionType
  id?: string
  /** Valor fixo destinado; ausência em uma inclusão de posição acompanha 100% do saldo utilizável. */
  amount?: number
}

export type GoalKind = 'funding' | 'tracking'

export interface FinancialGoal {
  id: string
  name: string
  /** Agrupa objetivos relacionados, sem criar outro saldo. */
  groupName?: string
  targetAmount: number
  /** Unidade do alvo. Livros, posições e destinações continuam em reais. */
  currency?: GoalCurrency
  marginPct?: number
  targetMonth?: string
  color: string
  transactions: LedgerEntry[]
  createdAt: string
  completedAt?: string
  kind?: GoalKind
  includes?: GoalInclusion[]
  archivedAt?: string
}

export interface GoalHoldingAllocationSummary {
  holdingId: string
  holdingName: string
  institution?: string
  requested: number
  allocated: number
  unavailable: number
}

export interface GoalSummary extends FinancialGoal {
  ownBalance: number
  includedBalance: number
  current: number
  includedLabels: string[]
  holdingAllocations: GoalHoldingAllocationSummary[]
  allocatedBalance: number
  trackingBalance: number
  targetAmountBrl: number | null
  exchangeRate: number | null
  ownedInTargetCurrency: number
  currentInTargetCurrency: number | null
  remainingInTargetCurrency: number | null
  remaining: number | null
  progress: number | null
  monthsLeft: number | null
  suggestedMonthly: number | null
  isComplete: boolean
}

export interface InvestmentAssetClass {
  id: string
  name: string
  color: string
}

export interface InvestmentHolding {
  fx?: { currency: 'EUR' | 'USD'; balance: number; rate: number }
  /** Data do último saldo conferido; movimentos posteriores conservam essa referência. */
  valuationDate?: string
  id: string
  name: string
  assetClassId: string
  institution?: string
  marketValue: number
  transactions: LedgerEntry[]
  archivedAt?: string
}

export interface HoldingSummary extends InvestmentHolding {
  invested: number
  gain: number
  gainPct: number
  annualizedPct: number | null
}

export interface AssetClassSummary {
  id: string
  name: string
  color: string
  marketValue: number
  invested: number
  gain: number
  gainPct: number
  allocationPct: number
  holdings: HoldingSummary[]
}

export interface InvestmentsSummary {
  totalMarketValue: number
  totalInvested: number
  totalGain: number
  totalGainPct: number
  financialAssets: number
  physicalAssets: number
  grossAssets: number
  liabilities: number
  securedLiabilities: number
  unsecuredLiabilities: number
  financialNetWorth: number
  netWorth: number
  reserveBalance: number
  goalsBalance: number
  classes: AssetClassSummary[]
}
