import type { CostItem, DeductionItem, DiversificationSlice, WantItem } from './budget'
import type { SalaryInputMode } from './core'

export interface FinanceScenarioData {
  /** Destinos do aporte direto, por identidade; não são movimentos realizados. */
  contributionDestinations?: { type: 'holding' | 'goal'; id: string; amount: number }[]
  salaryNet: number
  salaryInputMode: SalaryInputMode
  /** Valor total de aporte escolhido em reais; null usa a sugestão percentual. */
  plannedInvestmentAmount?: number | null
  costs: CostItem[]
  wants: WantItem[]
  deductions: DeductionItem[]
  selectedModelId: string
  diversification: DiversificationSlice[]
  customModel: { n: number; d: number; i: number }
}

export interface FinanceScenario extends FinanceScenarioData {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ScenarioSummary {
  id: string
  name: string
  availableForBudget: number
  totalCosts: number
  totalWantsAmount: number
  totalPlannedInvestment: number
  balanceAfterPlan: number
  savingsRate: number
}
