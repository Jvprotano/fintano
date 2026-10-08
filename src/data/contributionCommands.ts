import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'
import type { Debt, FinancialGoal } from '../types'
import type { FinancialHolding } from '../lib/investments'
import { planAsScenario, type MonthlyPlan } from '../lib/monthlyPlans'
import { contributionPlan, destinationError, type ContributionDestination } from '../lib/contributionPlan'
import { nowIso, uid } from '../lib/shared'

export function setContributionDestinationsInDocument(document: RepositoryDocument, fallback: MonthlyPlan, rows: ContributionDestination[]) {
  const error = destinationError(rows)
  if (error) throw new Error(error)
  const plans = document.collections.monthlyPlans as MonthlyPlan[] ?? []
  const current = plans.find((plan) => plan.month === fallback.month) ?? fallback
  const candidate = { ...current, contributionDestinations: rows }
  const plan = contributionPlan(planAsScenario(candidate), document.collections.investmentHoldings as FinancialHolding[] ?? [], document.collections.goals as FinancialGoal[] ?? [], document.collections.debts as Debt[] ?? [])
  if (plan.excess > 0.005) throw new Error('Os destinos excedem o aporte disponível no plano. Reduza os valores ou revise a renda, os gastos e o aporte.')
  if (plan.unavailable.length) throw new Error('Um destino não está ativo ou é apenas um indicador. Revise a divisão.')
  return { ...document, collections: { ...document.collections, monthlyPlans: [...plans.filter((plan) => plan.month !== current.month), { ...candidate, updatedAt: nowIso(), customized: true }].sort((a, b) => a.month.localeCompare(b.month)) } }
}

export const setContributionDestinations = (plan: MonthlyPlan, rows: ContributionDestination[], revision: string | null) =>
  runRepositoryCommand({ id: uid(), expectedRevision: revision, apply: (document) => setContributionDestinationsInDocument(document, plan, rows) })
