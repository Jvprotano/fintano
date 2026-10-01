import type { LedgerEntry } from './core'

export type DebtKind = 'financiamento' | 'emprestimo' | 'consignado' | 'cartao' | 'outros'

export interface Debt {
  id: string
  name: string
  kind: DebtKind
  balance: number
  monthlyRatePct: number
  installment: number
  remainingInstallments: number
  linkedCostId?: string
  linkedAssetId?: string
  transactions: LedgerEntry[]
  createdAt: string
  settledAt?: string
  archivedAt?: string
}

export interface DebtSummary extends Debt {
  annualRatePct: number
  monthlyInterest: number
  amortizationShare: number
  monthsToPayoff: number | null
  totalRemaining: number
  interestRemaining: number
  isSettled: boolean
  linkedCostMismatch: number | null
  isSecured: boolean
  assetValue: number | null
  equity: number | null
  ltvPct: number | null
}

export interface UnsecuredDebtsSummary {
  balance: number
  installment: number
  monthlyInterest: number
  interestRemaining: number
  weightedAnnualRatePct: number
  costliest: DebtSummary | null
  count: number
}

export interface DebtsSummary {
  totalBalance: number
  totalInstallment: number
  totalMonthlyInterest: number
  totalInterestRemaining: number
  securedBalance: number
  unsecured: UnsecuredDebtsSummary
  debts: DebtSummary[]
}
