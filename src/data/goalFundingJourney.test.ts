// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeGoal, summarizeGoals } from '../lib/goals'
import { normalizeExpectedEvent, occurrenceFor, eventTerms } from '../lib/forecast'
import { summarizeGoalFunding, distributeGoalIncome } from '../lib/goalFunding'
import { buildForecastAgenda } from '../lib/forecastCoverage'
import { allocateGoalIncomeInDocument, allocateGoalIncome, setGoalGroups } from './goalFundingCommands'
import { forecastContext, realizeForecastInDocument, editForecastInDocument, editOccurrenceInDocument } from './forecastCommands'
import { repositoryToBackupV9, backupV9ToRepository, inspectBackupPayload } from './backupV7'
import { readRepositoryDocument, writeRepositoryDocument, type RepositoryDocument } from './repository'
import { repositoryRevision } from './repositoryCommand'
import { deleteUnusedCatalog } from './catalogDeletion'
import type { ExpectedEvent, FinancialGoal } from '../types'
import { createDefaultScenario } from '../lib/scenario'

function base(): RepositoryDocument {
  const scenario = createDefaultScenario('Atual')
  const goals = [
    { id: 'spend', name: 'Gastar Europa', targetAmount: 7000, transactions: [{ id: 'saved', amount: 1000, kind: 'opening_balance' as const, date: '2026-10-01T12:00:00Z' }] },
    { id: 'rome', name: 'Hotel Roma', targetAmount: 3300 },
    { id: 'florence', name: 'Hotel Florença', targetAmount: 2000 },
    { id: 'venice', name: 'Hotel Veneza', targetAmount: 2050 },
  ].map((goal) => normalizeGoal({ ...goal, kind: 'funding', groupName: 'Eurotrip 2027', targetMonth: '2027-07' }))
  return { schemaVersion: 7, updatedAt: '2026-10-07T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10' }, goals,
    forecastEvents: [normalizeExpectedEvent({ id: 'salary', name: '13º', kind: 'income', amount: 7500, month: '2026-12', recurrence: 'yearly' }),
      normalizeExpectedEvent({ id: 'raise', name: 'Dissídio', kind: 'income', amount: 1200, month: '2026-11' }),
      normalizeExpectedEvent({ id: 'late', name: 'Depois da viagem', kind: 'income', amount: 9000, month: '2027-08' })],
  } }
}
function group(document: RepositoryDocument) {
  const { actuals, cards, invoices, movements } = forecastContext(document)
  const items = buildForecastAgenda(document.collections.forecastEvents as ExpectedEvent[], actuals, '2026-10', '2026-10-07', cards, invoices, movements).flatMap((row) => row.items)
  return summarizeGoalFunding(summarizeGoals(document.collections.goals as FinancialGoal[]), items, '2026-10')[0]
}

describe('planejamento da viagem por metas e entradas', () => {
  it('divide cada ocorrência uma vez, respeita centavos, prazo e não cria dinheiro; conserva o plano no backup', () => {
    let document = base()
    const original = structuredClone(document)
    const before = group(document)
    expect(before).toMatchObject({ target: 14350, current: 1000, remaining: 13350, conditionalRemaining: 13350 })
    const salary = distributeGoalIncome(7500, before.rows.map((row) => ({ goalId: row.goal.id, amount: row.conditionalRemaining })))
    expect(salary.reduce((sum, row) => sum + Math.round(row.amount * 100), 0)).toBe(750000)
    document = allocateGoalIncomeInDocument(document, 'salary', '2026-12', salary)
    expect(group(document)).toMatchObject({ current: 1000, expected: 7500, conditionalRemaining: 5850, monthlyWithIncome: 585 })
    const afterSalary = group(document)
    document = allocateGoalIncomeInDocument(document, 'raise', '2026-11', distributeGoalIncome(1200, afterSalary.rows.map((row) => ({ goalId: row.goal.id, amount: row.conditionalRemaining }))))
    expect(group(document).conditionalRemaining).toBe(4650)
    document = allocateGoalIncomeInDocument(document, 'late', '2027-08', [{ goalId: 'rome', amount: 1000 }])
    expect(group(document).conditionalRemaining).toBe(4650)
    expect(group(document).rows.find((row) => row.goal.id === 'rome')?.lateIncome).toBe(1000)
    const event = (document.collections.forecastEvents as ExpectedEvent[])[0]
    expect(occurrenceFor(event, '2027-12')?.event.occurrenceOverrides?.['2027-12']?.goalAllocations).toBeUndefined()
    expect(document.collections.goals).toEqual(original.collections.goals)
    expect(document.collections.actuals).toBeUndefined()
    const backup = repositoryToBackupV9(document)
    expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(backup.goals.every((goal) => goal.groupName === 'Eurotrip 2027')).toBe(true)
    const restored = backupV9ToRepository(backup)
    expect(group(restored).conditionalRemaining).toBe(4650)
    expect((restored.collections.forecastEvents as ExpectedEvent[])[0].occurrenceOverrides?.['2026-12']?.goalAllocations).toEqual(salary)
    backup.forecast.events[0].occurrenceOverrides!['2026-12'].goalAllocations![0].amountCents = 750001
    expect(inspectBackupPayload(backup).issues.some((issue) => issue.code === 'goal_income_overallocated')).toBe(true)
    const duplicate = repositoryToBackupV9(document)
    const allocations = duplicate.forecast.events[0].occurrenceOverrides!['2026-12'].goalAllocations!
    allocations.push(allocations[0])
    expect(inspectBackupPayload(duplicate).issues.some((issue) => issue.code === 'goal_income_allocation_invalid')).toBe(true)
  })

  it('separa recebimento parcial e destinação efetiva; cancelamento e adiamento retiram a cobertura esperada', () => {
    let document = allocateGoalIncomeInDocument(base(), 'salary', '2026-12', [{ goalId: 'spend', amount: 4500 }, { goalId: 'rome', amount: 3000 }])
    document = realizeForecastInDocument(document, 'salary', '2026-12', 3000, '2026-12', '2026-12-01')
    expect(group(document)).toMatchObject({ current: 1000, expected: 4500, conditionalRemaining: 8850 })
    expect(group(document).rows.reduce((sum, row) => sum + row.received, 0)).toBe(3000)
    const goals = document.collections.goals as FinancialGoal[]
    goals[0].transactions.push({ id: 'saved-income', amount: 1800, kind: 'contribution', date: '2026-12-01T12:00:00Z' })
    goals[1].transactions.push({ id: 'saved-hotel', amount: 1200, kind: 'contribution', date: '2026-12-01T12:00:00Z' })
    expect(group(document)).toMatchObject({ current: 4000, expected: 4500, conditionalRemaining: 5850 })
    const postponed = editOccurrenceInDocument(document, 'salary', '2026-12', { month: '2027-08' })
    expect(group(postponed).expected).toBe(0)
    expect(group(postponed).remaining).toBe(10350)
    const cancelled = editOccurrenceInDocument(document, 'salary', '2026-12', { cancelled: true })
    expect(group(cancelled).conditionalRemaining).toBe(10350)
    expect(group(cancelled).rows.reduce((sum, row) => sum + row.received, 0)).toBe(3000)
    document = realizeForecastInDocument(document, 'salary', '2026-12', 4500, '2026-12', '2026-12-02')
    expect(group(document).expected).toBe(0)
    expect(group(document).current).toBe(4000)
  })

  it('recusa excesso, meta duplicada, redução incompatível, exclusão referenciada e revisão antiga sem gravar parcialmente', () => {
    localStorage.clear()
    writeRepositoryDocument(base())
    const revision = repositoryRevision()
    expect(setGoalGroups([{ goalId: 'rome', groupName: 'Outra viagem' }], revision).ok).toBe(true)
    expect(allocateGoalIncome('salary', '2026-12', [{ goalId: 'rome', amount: 100 }], revision).ok).toBe(false)
    const before = readRepositoryDocument()
    expect(allocateGoalIncome('salary', '2026-12', [{ goalId: 'rome', amount: 7500.01 }]).ok).toBe(false)
    expect(allocateGoalIncome('salary', '2026-12', [{ goalId: 'rome', amount: 10 }, { goalId: 'rome', amount: 20 }]).ok).toBe(false)
    expect(readRepositoryDocument()).toEqual(before)
    expect(allocateGoalIncome('salary', '2026-12', [{ goalId: 'rome', amount: 7500 }]).ok).toBe(true)
    expect(deleteUnusedCatalog('goal', 'rome')).toBe(false)
    const allocated = readRepositoryDocument()
    const salary = (allocated.collections.forecastEvents as ExpectedEvent[])[0]
    expect(() => editForecastInDocument(allocated, 'salary', '2026-12', { ...eventTerms(salary), amount: 7000 }, 'this')).toThrow(/excede/)
    expect(() => editForecastInDocument(allocated, 'salary', '2026-12', { ...eventTerms(salary), savedPct: 90 }, 'following')).toThrow(/excede/)
    expect(readRepositoryDocument()).toEqual(allocated)
  })
})
