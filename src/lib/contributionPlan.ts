import type { Debt, FinanceScenario, FinancialGoal } from '../types'
import type { FinancialHolding } from './investments'
import { calculateScenario } from './scenario'
import { advanceDebtMonth } from './debts'

export type ContributionDestination = NonNullable<FinanceScenario['contributionDestinations']>[number]

export function contributionPlan(scenario: FinanceScenario, holdings: FinancialHolding[], goals: FinancialGoal[], debts: Debt[] = []) {
  const metrics = calculateScenario(scenario, { current: 0, targetMonths: 6, transactions: [] })
  const uncoveredInstallments = debts.filter((debt) => !debt.archivedAt && debt.balance > 0).reduce((sum, debt) => {
    const cost = scenario.costs.find((cost) => cost.id === debt.linkedCostId && !cost.archivedAt)
    return sum + Math.max(0, advanceDebtMonth(debt.balance, debt.monthlyRatePct, debt.installment).paid - (cost ? cost.value : 0))
  }, 0)
  const affordable = Math.max(0, metrics.paycheckInAccount - metrics.totalCosts - metrics.totalWantsAmount - uncoveredInstallments)
  const capacity = Math.min(metrics.directInvestmentTarget, affordable)
  const requested = scenario.contributionDestinations ?? []
  const promised = requested.reduce((sum, row) => sum + row.amount, 0)
  const unavailable = requested.filter((row) => row.type === 'holding'
    ? !holdings.some((holding) => holding.id === row.id && !holding.archivedAt)
    : !goals.some((goal) => goal.id === row.id && !goal.archivedAt && goal.kind !== 'tracking'))
  const excess = Math.max(0, promised - capacity)
  // Um plano impossível precisa ser revisto, sem simular promessas como recursos.
  const destinations = excess > 0.005 || unavailable.length ? [] : requested
  return { capacity, affordable, promised, excess, unavailable, destinations, uncoveredInstallments,
    unassigned: Math.max(0, capacity - promised), payroll: metrics.investmentDeductions }
}

export function destinationError(rows: ContributionDestination[]): string | null {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = `${row.type}:${row.id}`
    if (!['holding', 'goal'].includes(row.type) || !row.id || !Number.isFinite(row.amount) || row.amount <= 0 || Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.00001 || seen.has(key)) return 'Informe destinos distintos e valores positivos em centavos.'
    seen.add(key)
  }
  return null
}
