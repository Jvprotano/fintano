import type { ForecastPoint, GoalSummary } from '../types'
import { summarizeGoals, type GoalContext } from './goals'
import { holdingPurpose, usableHoldingValue, type FinancialHolding } from './investments'
import { incomeAllocationParts } from './goalFunding'
import type { ReconciledOccurrence } from './forecastCoverage'

export interface SourceContribution { type: 'holding' | 'goal'; id: string; amount: number; protectedAmount?: number }

/** As metas observam suas fontes, nunca o crescimento do patrimônio líquido agregado. */
export function projectGoalSources(input: {
  points: ForecastPoint[]; holdings: FinancialHolding[]; goals: GoalSummary[]
  contributions: Record<string, SourceContribution[]>; items: ReconciledOccurrence[]
  annualReturnPct: number; conditional: boolean; startAssets: number
  protectedContributions?: Record<string, number>
}) {
  const holdings = input.holdings.map((holding) => structuredClone(holding))
  const balances = Object.fromEntries(input.goals.map((goal) => [goal.id, goal.ownBalance]))
  let free = Math.max(0, input.startAssets - holdings.reduce((sum, holding) => sum + holding.marketValue, 0) - Object.values(balances).reduce((sum, value) => sum + value, 0))
  const rate = Math.pow(1 + input.annualReturnPct / 100, 1 / 12) - 1
  let previousAssets = input.startAssets
  return input.points.map((point, index) => {
    if (index > 0) {
      free *= 1 + rate
      for (const holding of holdings) {
        holding.marketValue *= 1 + rate
        if (holding.pension?.employerBalance !== undefined) holding.pension.employerBalance *= 1 + rate
        if (holding.pension?.employerRestrictedBalance !== undefined) holding.pension.employerRestrictedBalance *= 1 + rate
      }
      for (const id of Object.keys(balances)) balances[id] *= 1 + rate
    }
    const sources = input.contributions[point.month] ?? []
    let assigned = 0
    let protectedAssigned = 0
    for (const source of sources) {
      const holding = holdings.find((row) => source.type === 'holding' && row.id === source.id)
      if (holding) {
        holding.marketValue += source.amount
        if (holding.pension && source.protectedAmount) {
          if (holding.pension.employerBalance !== undefined) holding.pension.employerBalance += source.protectedAmount
          if (holding.pension.employerRestrictedBalance !== undefined) holding.pension.employerRestrictedBalance += source.protectedAmount
        }
        assigned += source.amount
        protectedAssigned += source.protectedAmount ?? 0
      } else if (source.type === 'goal' && balances[source.id] !== undefined) { balances[source.id] += source.amount; assigned += source.amount }
    }
    free += Math.max(0, point.contribution - assigned - Math.max(0, (input.protectedContributions?.[point.month] ?? 0) - protectedAssigned))
    let incomeAssigned = 0
    let incomeTotal = 0
    if (input.conditional) for (const item of input.items.filter((row) => row.event.kind === 'income' && (index === 0 ? row.month <= point.month : row.month === point.month))) {
      if (!item.savedAmount || item.cancelled) continue
      incomeTotal += item.remainingAmount * (item.event.savedPct ?? 100) / 100
      for (const part of incomeAllocationParts(item)) if (balances[part.goalId] !== undefined) {
        balances[part.goalId] += part.expected; incomeAssigned += part.expected
      }
    }
    free += Math.max(0, incomeTotal - incomeAssigned)
    // As saídas usam primeiro a parcela sem finalidade; depois rateiam as fontes
    // utilizáveis. É hipótese mensal explícita, não previsão de conta bancária.
    let expense = Math.max(0, previousAssets * (index > 0 ? 1 + rate : 1) + point.contribution + incomeTotal - point.assets)
    const freeUsed = Math.min(free, expense); free -= freeUsed; expense -= freeUsed
    const usable = holdings.reduce((sum, holding) => sum + usableHoldingValue(holding), 0) + Object.values(balances).reduce((sum, value) => sum + value, 0)
    const fraction = usable > 0 ? Math.min(1, expense / usable) : 0
    for (const holding of holdings) {
      const used = usableHoldingValue(holding) * fraction
      if (holding.pension?.employerBalance !== undefined) {
        const personal = holding.marketValue - holding.pension.employerBalance
        holding.pension.employerBalance -= Math.max(0, used - personal)
      }
      holding.marketValue -= used
    }
    for (const id of Object.keys(balances)) balances[id] *= 1 - fraction
    const portfolio = holdings.filter((holding) => holdingPurpose(holding) === 'portfolio')
    const context: GoalContext = {
      reserveBalance: holdings.filter((holding) => holdingPurpose(holding) === 'emergency_fund').reduce((sum, holding) => sum + usableHoldingValue(holding), 0),
      investmentsBalance: portfolio.reduce((sum, holding) => sum + usableHoldingValue(holding), 0),
      holdings: portfolio.map((holding) => ({ ...holding, marketValue: usableHoldingValue(holding) })),
      classBalances: [...new Set(portfolio.map((holding) => holding.assetClassId))].map((id) => ({ id, name: id, marketValue: portfolio.filter((holding) => holding.assetClassId === id).reduce((sum, holding) => sum + usableHoldingValue(holding), 0) })),
      goalOwnBalances: balances, assetsBalance: point.properties, debtBalance: point.debt,
    }
    previousAssets = point.assets
    return { month: point.month, goals: summarizeGoals(input.goals.map((goal) => ({ ...goal, transactions: [{ id: 'projection', amount: balances[goal.id], date: `${point.month}-01`, kind: 'opening_balance' }] })), context) }
  })
}
