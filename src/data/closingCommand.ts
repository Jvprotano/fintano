import type { CardThirdParty, CreditCardEntry, MonthlyActuals, MonthlySnapshot } from '../types'
import { thirdPartiesForEntries } from './cardThirdParties'
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
  invoiceKnown?: boolean
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
  if (input.invoiceKnown !== true) return null
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
  if (!current.paycheck || input.costRows.some((row) => !Object.hasOwn(current.costs, row.id)) ||
    input.wantRows.some((row) => !Object.hasOwn(current.wants, row.id))) return null
  const closed: MonthlySnapshot = {
    ...input.snapshot,
    id: previous?.id ?? uid(),
    closedAt: nowIso(),
  }
  let next: RepositoryDocument = {
    ...document,
    collections: {
      ...document.collections,
      cardThirdParties: thirdPartiesForEntries(document.collections.cardThirdParties as CardThirdParty[] ?? [],
        (document.collections.cardEntries as CreditCardEntry[] ?? []).filter((entry) =>
          (entry.isPrepaid ? entry.cashCycleMonth ?? entry.dueMonth : entry.dueMonth) === input.month)),
      actuals: [...storedActuals.filter((item) => item.month !== input.month), current]
        .sort((a, b) => a.month.localeCompare(b.month)),
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
