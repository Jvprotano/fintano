import type {
  CostItem, Debt, ExpectedEvent, FinanceScenario, FinancialGoal,
  ForecastFund, MonthlyActuals, WantItem,
} from '../types'
import type { FinancialHolding } from '../lib/investments'
import type { MonthlyPlan } from '../lib/monthlyPlans'
import { isCardEnvelopeWant, isWantIncludedInCardPlan } from '../lib/scenario'
import { uid } from '../lib/shared'
import { runRepositoryCommand } from './repositoryCommand'

type CatalogKind = 'holding' | 'goal' | 'debt' | 'cost' | 'want'

/** Exclui somente um cadastro sem saldo, movimentos ou referências, sobre a revisão atual. */
export function deleteUnusedCatalog(kind: CatalogKind, id: string, scenarioId?: string): boolean {
  return runRepositoryCommand({
    id: uid(),
    apply: (document) => {
      const collections = document.collections
      const holdings = Array.isArray(collections.investmentHoldings)
        ? collections.investmentHoldings as FinancialHolding[] : []
      const goals = Array.isArray(collections.goals) ? collections.goals as FinancialGoal[] : []
      const debts = Array.isArray(collections.debts) ? collections.debts as Debt[] : []
      const scenarios = Array.isArray(collections.scenarios)
        ? collections.scenarios as FinanceScenario[] : []
      const plans = Array.isArray(collections.monthlyPlans)
        ? collections.monthlyPlans as MonthlyPlan[] : []
      const actuals = Array.isArray(collections.actuals)
        ? collections.actuals as MonthlyActuals[] : []
      const events = Array.isArray(collections.forecastEvents)
        ? collections.forecastEvents as ExpectedEvent[] : []
      const funds = Array.isArray(collections.forecastFunds)
        ? collections.forecastFunds as ForecastFund[] : []

      if (kind === 'holding') {
        const target = holdings.find((item) => item.id === id)
        if (!target || target.marketValue !== 0 || target.transactions?.length ||
          goals.some((goal) => goal.includes?.some((item) => item.type === 'holding' && item.id === id)) ||
          scenarios.some((scenario) => scenario.deductions?.some((item) => item.linkedHoldingId === id)) ||
          plans.some((plan) => plan.deductions?.some((item) => item.linkedHoldingId === id))) return null
        return { ...document, collections: {
          ...collections, investmentHoldings: holdings.filter((item) => item.id !== id),
        } }
      }

      if (kind === 'goal') {
        const target = goals.find((item) => item.id === id)
        if (!target || target.transactions?.length || target.includes?.length ||
          events.some((event) => event.goalId === id || Object.values(event.occurrenceOverrides ?? {}).some((override) => override.goalAllocations?.some((row) => row.goalId === id))) || funds.some((fund) => fund.goalId === id)) return null
        return { ...document, collections: { ...collections, goals: goals.filter((item) => item.id !== id) } }
      }

      if (kind === 'debt') {
        const target = debts.find((item) => item.id === id)
        if (!target || target.balance !== 0 || target.transactions?.length) return null
        return { ...document, collections: { ...collections, debts: debts.filter((item) => item.id !== id) } }
      }

      const scenario = scenarios.find((item) => item.id === scenarioId)
      const plan = plans.find((item) => item.month === scenarioId)
      const source = plan ?? scenario
      if (!source) return null
      if (kind === 'cost') {
        const target = source.costs.find((item: CostItem) => item.id === id)
        if (!target || actuals.some((month) => Object.hasOwn(month.costs ?? {}, id)) ||
          debts.some((debt) => debt.linkedCostId === id)) return null
        return { ...document, collections: { ...collections,
          ...(plan ? { monthlyPlans: plans.map((item) => item.month === scenarioId
            ? { ...item, costs: item.costs.filter((cost) => cost.id !== id) } : item) }
            : { scenarios: scenarios.map((item) => item.id === scenarioId
              ? { ...item, costs: item.costs.filter((cost) => cost.id !== id) } : item) }),
        } }
      }
      const target = source.wants.find((item: WantItem) => item.id === id)
      if (!target || actuals.some((month) => Object.hasOwn(month.wants ?? {}, id)) ||
        (isCardEnvelopeWant(target) && source.wants.some((item) => isWantIncludedInCardPlan(item, source.wants)))) return null
      return { ...document, collections: { ...collections,
        ...(plan ? { monthlyPlans: plans.map((item) => item.month === scenarioId
          ? { ...item, wants: item.wants.filter((want) => want.id !== id) } : item) }
          : { scenarios: scenarios.map((item) => item.id === scenarioId
            ? { ...item, wants: item.wants.filter((want) => want.id !== id) } : item) }),
      } }
    },
  }).ok
}
