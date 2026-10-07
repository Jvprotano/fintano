import type { ExpectedOccurrenceOverride, GoalSummary } from '../types'
import type { ReconciledOccurrence } from './forecastCoverage'
import { monthsBetween } from './shared'

export type GoalIncomeAllocation = NonNullable<ExpectedOccurrenceOverride['goalAllocations']>[number]
const cents = (value: number) => Math.round(value * 100)

/** Distribui em centavos pelo que falta, sem ultrapassar a verba ou cada necessidade. */
export function distributeGoalIncome(budget: number, needs: { goalId: string; amount: number }[]): GoalIncomeAllocation[] {
  const weights = needs.map((row) => Math.max(0, cents(row.amount)))
  const total = weights.reduce((sum, amount) => sum + amount, 0)
  const available = Math.min(Math.max(0, cents(budget)), total)
  if (!total || !available) return []
  const exact = weights.map((weight) => available * weight / total)
  const amounts = exact.map(Math.floor)
  let rest = available - amounts.reduce((sum, amount) => sum + amount, 0)
  const order = exact.map((value, index) => ({ index, fraction: value - amounts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of order) { if (rest-- <= 0) break; amounts[index]++ }
  return needs.flatMap((row, index) => amounts[index] > 0 ? [{ goalId: row.goalId, amount: amounts[index] / 100 }] : [])
}

export function goalIncomeBudget(item: ReconciledOccurrence): number {
  return cents(item.amount * (item.event.savedPct ?? 100) / 100) / 100
}

export function goalIncomeAllocationError(allocations: GoalIncomeAllocation[], budget: number): string | null {
  if (!Array.isArray(allocations)) return 'A divisão da entrada deve ser uma lista de metas e valores.'
  const seen = new Set<string>()
  let total = 0
  for (const row of allocations) {
    if (!row || typeof row.goalId !== 'string' || !row.goalId || seen.has(row.goalId) ||
      !Number.isFinite(row.amount) || row.amount <= 0 || !Number.isSafeInteger(cents(row.amount)) ||
      Math.abs(row.amount * 100 - cents(row.amount)) > 0.00001) return 'Confira as metas e os valores da divisão; cada meta deve aparecer uma única vez.'
    seen.add(row.goalId)
    total += cents(row.amount)
  }
  return total > cents(budget) ? 'A soma destinada às metas excede a parte da entrada que você planeja guardar.' : null
}

export function incomeAllocationParts(item: ReconciledOccurrence) {
  const allocations = item.event.occurrenceOverrides?.[item.originalMonth]?.goalAllocations ?? []
  const full = distributeGoalIncome(goalIncomeBudget(item), allocations)
  const total = full.reduce((sum, row) => sum + cents(row.amount), 0) / 100
  // Recebido não vira saldo da meta. Só o restante ainda previsto reduz a necessidade condicional.
  const remainingRatio = item.amount > 0 ? Math.max(0, Math.min(1, (item.amount - item.paidAmount) / item.amount)) : 0
  const pending = distributeGoalIncome(total * remainingRatio, full)
  return full.map((row) => {
    const expected = pending.find((part) => part.goalId === row.goalId)?.amount ?? 0
    return { ...row, expected: item.cancelled ? 0 : expected, received: cents(row.amount - expected) / 100 }
  })
}

export function summarizeGoalFunding(goals: GoalSummary[], items: ReconciledOccurrence[], currentMonth: string) {
  const rows = goals.filter((goal) => !goal.archivedAt && goal.kind === 'funding').map((goal) => {
    const sources = items.filter((item) => item.event.kind === 'income').flatMap((item) => {
      const allocation = incomeAllocationParts(item).find((row) => row.goalId === goal.id)
      return allocation ? [{ item, ...allocation, inTime: !goal.targetMonth || item.month <= goal.targetMonth }] : []
    })
    const expected = sources.filter((source) => source.inTime).reduce((sum, source) => sum + cents(source.expected), 0) / 100
    const covered = Math.min(goal.remaining, expected)
    const conditionalRemaining = cents(Math.max(0, goal.remaining - covered)) / 100
    const months = goal.targetMonth && goal.targetMonth >= currentMonth ? monthsBetween(currentMonth, goal.targetMonth) + 1 : null
    return { goal, sources, expected, covered, conditionalRemaining,
      monthlyWithoutIncome: months ? goal.remaining / months : null,
      monthlyWithIncome: months ? conditionalRemaining / months : null,
      received: sources.reduce((sum, source) => sum + cents(source.received), 0) / 100,
      lateIncome: sources.filter((source) => !source.inTime).reduce((sum, source) => sum + cents(source.expected), 0) / 100,
    }
  })
  const names = [...new Set(rows.map((row) => row.goal.groupName ?? ''))]
  return names.map((name) => {
    const members = rows.filter((row) => (row.goal.groupName ?? '') === name)
    const sum = (read: (row: typeof members[number]) => number) => members.reduce((total, row) => total + cents(read(row)), 0) / 100
    return { name, rows: members, target: sum((row) => row.goal.targetAmount), current: sum((row) => row.goal.current),
      remaining: sum((row) => row.goal.remaining), expected: sum((row) => row.covered),
      conditionalRemaining: sum((row) => row.conditionalRemaining),
      monthlyWithoutIncome: sum((row) => row.monthlyWithoutIncome ?? 0),
      monthlyWithIncome: sum((row) => row.monthlyWithIncome ?? 0),
    }
  })
}
