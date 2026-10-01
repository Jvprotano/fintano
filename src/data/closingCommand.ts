import type { MonthlyActuals, MonthlySnapshot } from '../types'
import { normalizeActuals } from '../lib/actuals'
import { advanceCycleMonth, normalizeActiveCycle } from '../lib/activeCycle'
import { nowIso, uid } from '../lib/shared'
import { payInvoiceInDocument } from '../hooks/useCreditCards'
import type { RepositoryDocument } from './repository'
import type { MonthlyPlan } from '../lib/monthlyPlans'

export interface CloseCycleInput {
  month: string
  snapshot: Omit<MonthlySnapshot, 'id' | 'closedAt'>
  costRows: { id: string; planned: number }[]
  wantRows: { id: string; planned: number }[]
  payInvoiceDueMonth?: string
}

export function closeCycleInDocument(
  document: RepositoryDocument,
  input: CloseCycleInput,
): RepositoryDocument | null {
  const cycle = normalizeActiveCycle(
    document.collections.activeCycle as Parameters<typeof normalizeActiveCycle>[0],
  )
  if (cycle.month !== input.month || input.snapshot.month !== input.month) return null
  const plan = Array.isArray(document.collections.monthlyPlans)
    ? (document.collections.monthlyPlans as MonthlyPlan[]).find((item) => item.month === input.month)
    : undefined
  if (plan ? plan.sourceTemplateId !== input.snapshot.scenarioId :
    document.collections.activeScenarioId && document.collections.activeScenarioId !== input.snapshot.scenarioId) return null

  const storedHistory = Array.isArray(document.collections.history)
    ? document.collections.history as MonthlySnapshot[] : []
  const previous = storedHistory.find((item) => item.month === input.month)
  const storedActuals = Array.isArray(document.collections.actuals)
    ? document.collections.actuals as MonthlyActuals[] : []
  const current = normalizeActuals(storedActuals.find((item) => item.month === input.month) ?? { month: input.month })
  const filledCosts = { ...current.costs }
  for (const row of input.costRows) {
    if (!Object.hasOwn(filledCosts, row.id)) filledCosts[row.id] = row.planned
  }
  const filledWants = { ...current.wants }
  for (const row of input.wantRows) {
    if (!Object.hasOwn(filledWants, row.id)) filledWants[row.id] = row.planned
  }
  const closed: MonthlySnapshot = {
    ...input.snapshot,
    id: previous?.id ?? uid(),
    closedAt: nowIso(),
  }
  const filledMonth: MonthlyActuals = { ...current, costs: filledCosts, wants: filledWants }
  const hasFacts = Object.keys(filledCosts).length > 0 || Object.keys(filledWants).length > 0 ||
    current.extraIncome.length > 0 || current.extraExpenses.length > 0
  let next: RepositoryDocument = {
    ...document,
    collections: {
      ...document.collections,
      actuals: [
        ...storedActuals.filter((item) => item.month !== input.month),
        ...(hasFacts ? [filledMonth] : []),
      ].sort((a, b) => a.month.localeCompare(b.month)),
      history: [...storedHistory.filter((item) => item.month !== input.month), closed]
        .sort((a, b) => a.month.localeCompare(b.month)),
      activeCycle: previous ? cycle : { ...cycle, month: advanceCycleMonth(input.month) },
    },
  }
  if (input.payInvoiceDueMonth) {
    const paid = payInvoiceInDocument(next, input.payInvoiceDueMonth)
    if (!paid) return null
    next = paid
  }
  return next
}
