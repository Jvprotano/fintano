// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { listAutoBackups } from '../lib/backup'
import { createDefaultScenario } from '../lib/scenario'
import type { MonthlyPlan } from '../lib/monthlyPlans'
import { readRepositoryDocument, REPOSITORY_STORAGE_KEY, writeRepositoryDocument } from './repository'
import { bootstrapMonthlyPlans, PRE_MONTHLY_PLAN_MIGRATION_RAW_KEY } from './monthlyPlanMigration'
import { backupV9ToRepository, repositoryToBackupV9 } from './backupV7'

describe('migração para plano mensal', () => {
  beforeEach(() => localStorage.clear())

  it('captura o ciclo ativo com identidade dos itens e conserva os realizados', () => {
    const scenario = createDefaultScenario('Modelo')
    scenario.salaryNet = 5000
    scenario.costs = [{ id: 'cost-1', name: 'Aluguel', value: 1800, category: 'contas', paidWith: 'account' }]
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: scenario.id, scenarios: [scenario],
      actuals: [{ month: '2026-09', costs: { 'cost-1': 1800 }, wants: {}, extraIncome: [], extraExpenses: [] }],
    } })
    const original = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    expect(bootstrapMonthlyPlans().status).toBe('ready')
    const document = readRepositoryDocument()
    const plans = document.collections.monthlyPlans as MonthlyPlan[]
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ month: '2026-10', sourceTemplateId: scenario.id,
      salaryNet: 5000, costs: [expect.objectContaining({ id: 'cost-1', value: 1800 })] })
    const backup = repositoryToBackupV9(document)
    expect(backup.planning.monthlyPlans?.[0]).toMatchObject({ id: plans[0].id,
      month: '2026-10', sourceTemplateId: scenario.id,
      data: { salaryCents: 500000, costs: [expect.objectContaining({ id: 'cost-1', amountCents: 180000 })] } })
    expect((backupV9ToRepository(backup).collections.monthlyPlans as MonthlyPlan[])[0])
      .toMatchObject({ id: plans[0].id, month: '2026-10', salaryNet: 5000,
        costs: [expect.objectContaining({ id: 'cost-1', value: 1800 })] })
    expect(document.collections.actuals).toEqual([{ month: '2026-09', costs: { 'cost-1': 1800 },
      wants: {}, extraIncome: [], extraExpenses: [] }])
    expect(localStorage.getItem(PRE_MONTHLY_PLAN_MIGRATION_RAW_KEY)).toBe(original)
    expect(listAutoBackups()).toHaveLength(2)
    const restoredPlanning = listAutoBackups()[0].backup.planning
    expect('monthlyPlans' in restoredPlanning && restoredPlanning.monthlyPlans).toHaveLength(1)
    const revision = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    expect(bootstrapMonthlyPlans().status).toBe('ready')
    expect(localStorage.getItem(REPOSITORY_STORAGE_KEY)).toBe(revision)
  })
})
