import type { FinancialGoal } from '../types'
import type { RepositoryDocument } from './repository'
import { documentOccurrence, forecastCommand } from './forecastCommands'
import { goalIncomeAllocationError, goalIncomeBudget, type GoalIncomeAllocation } from '../lib/goalFunding'
import type { ExpectedEvent } from '../types'

export function allocateGoalIncomeInDocument(document: RepositoryDocument, eventId: string, originalMonth: string, allocations: GoalIncomeAllocation[]): RepositoryDocument {
  const events = document.collections.forecastEvents as ExpectedEvent[] ?? []
  const event = events.find((row) => row.id === eventId)
  if (!event) throw new Error('Entrada prevista não encontrada.')
  const item = documentOccurrence(document, event, originalMonth)
  if (item.event.kind !== 'income' || item.cancelled) throw new Error('Escolha uma entrada ativa para dividir entre as metas.')
  const error = goalIncomeAllocationError(allocations, goalIncomeBudget(item))
  if (error) throw new Error(error)
  const goals = document.collections.goals as FinancialGoal[] ?? []
  const old = event.occurrenceOverrides?.[originalMonth]?.goalAllocations ?? []
  for (const allocation of allocations) {
    const goal = goals.find((row) => row.id === allocation.goalId)
    if (!goal || goal.kind === 'tracking' || goal.archivedAt && !old.some((row) => row.goalId === goal.id && row.amount === allocation.amount)) throw new Error('Destine a entrada somente a metas de acumulação ativas.')
  }
  return { ...document, collections: { ...document.collections, forecastEvents: events.map((row) => row.id === eventId
    ? { ...row, occurrenceOverrides: { ...row.occurrenceOverrides, [originalMonth]: { ...row.occurrenceOverrides?.[originalMonth], goalAllocations: allocations } } }
    : row) } }
}

export const allocateGoalIncome = (eventId: string, originalMonth: string, allocations: GoalIncomeAllocation[], revision?: string | null) =>
  forecastCommand((document) => allocateGoalIncomeInDocument(document, eventId, originalMonth, allocations), revision)

export const setGoalGroups = (groups: { goalId: string; groupName: string }[], revision?: string | null) => forecastCommand((document) => {
  const goals = document.collections.goals as FinancialGoal[] ?? []
  for (const row of groups) if (!goals.some((goal) => goal.id === row.goalId && !goal.archivedAt && goal.kind !== 'tracking')) throw new Error('Uma das metas mudou. Revise os grupos antes de salvar.')
  return { ...document, collections: { ...document.collections, goals: goals.map((goal) => {
    const group = groups.find((row) => row.goalId === goal.id)
    return group ? { ...goal, groupName: group.groupName.trim() || undefined } : goal
  }) } }
}, revision)
