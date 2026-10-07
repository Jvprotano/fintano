import { useCallback, useMemo } from 'react'
import type { GoalSummary } from '../types'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import { summarizeGoalFunding, type GoalIncomeAllocation } from '../lib/goalFunding'
import { allocateGoalIncome, setGoalGroups } from '../data/goalFundingCommands'

export function useGoalFunding(goals: GoalSummary[], items: ReconciledOccurrence[], currentMonth: string) {
  const groups = useMemo(() => summarizeGoalFunding(goals, items, currentMonth), [goals, items, currentMonth])
  const saveAllocation = useCallback((eventId: string, originalMonth: string, allocations: GoalIncomeAllocation[], revision: string | null) =>
    allocateGoalIncome(eventId, originalMonth, allocations, revision), [])
  const saveGroups = useCallback((rows: { goalId: string; groupName: string }[], revision: string | null) => setGoalGroups(rows, revision), [])
  return { groups, saveAllocation, saveGroups }
}
