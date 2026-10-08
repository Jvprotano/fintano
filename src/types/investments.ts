import type { LedgerEntry } from './core'

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
  /** Valor da posição reservado para uma meta de dinheiro. */
  amount?: number
}

export type GoalKind = 'funding' | 'tracking'

export interface FinancialGoal {
  id: string
  name: string
  /** Agrupa objetivos relacionados, sem criar outro saldo. */
  groupName?: string
  targetAmount: number
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
  remaining: number
  progress: number
  monthsLeft: number | null
  suggestedMonthly: number
  isComplete: boolean
}

export interface InvestmentAssetClass {
  id: string
  name: string
  color: string
}

export interface InvestmentHolding {
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
