// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { bootstrapMonthlyPlans } from '../data/monthlyPlanMigration'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { createDefaultScenario } from '../lib/scenario'
import type { MonthlyPlan } from '../lib/monthlyPlans'
import { useFinancas } from './useFinancas'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'

describe('plano separado por competência', () => {
  beforeEach(() => localStorage.clear())

  it('preserva o plano fixado após ajustes, simulação, restauração e fechamento', () => {
    const base = createDefaultScenario('Atual')
    base.salaryNet = 5000
    base.deductions = []
    base.plannedInvestmentAmount = 500
    base.costs = [{ id: 'rent', name: 'Aluguel', value: 1000, category: 'contas', paidWith: 'account' }]
    base.wants = [{ id: 'trip', name: 'Viagem', plannedAmount: 200, paidWith: 'account', includedInCardPlan: false }]
    const alternative = structuredClone(base)
    alternative.id = 'alternative'
    alternative.name = 'Outra possibilidade'
    alternative.costs[0].value = 1500
    alternative.wants = []
    alternative.plannedInvestmentAmount = 800
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-06T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: base.id, scenarios: [base, alternative],
      actuals: [{ month: '2026-10', costs: { rent: 1200 }, wants: { trip: 100 },
        extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0, origin: 'manual' } }],
      cardSettings: { currentDueMonth: '2026-10', paymentDate: '05/10', personalSpendingLimit: 3000 },
    } })
    expect(bootstrapMonthlyPlans().status).toBe('ready')
    const app = renderHook(() => useFinancas())
    act(() => expect(app.result.current.scenarios.fixCurrentPlan()).toBe(true))
    const reference = structuredClone(app.result.current.scenarios.currentPlan.fixedReference)
    act(() => expect(app.result.current.scenarios.setSalaryNet(5500)).toBe(true))
    act(() => expect(app.result.current.scenarios.applyScenarioToActiveCycle(alternative.id)).toBe(true))
    expect(app.result.current.planComparison).toMatchObject({ costs: 1000, wants: 200, invested: 500, paycheck: 5000 })
    expect(app.result.current.scenarios.currentPlan.fixedReference).toEqual(reference)
    act(() => expect(app.result.current.scenarios.fixCurrentPlan()).toBe(false))
    const backup = repositoryToBackupV9(readRepositoryDocument())
    expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const invalidBackup = structuredClone(backup)
    invalidBackup.planning.monthlyPlans![0].fixedReference!.template.costs[0].amountCents = 1.5
    expect(inspectBackupPayload(invalidBackup).issues.some((issue) => issue.severity === 'error')).toBe(true)
    const restored = backupV9ToRepository(backup)
    app.unmount()
    writeRepositoryDocument(restored)
    const reopened = renderHook(() => useFinancas())
    expect(reopened.result.current.scenarios.currentPlan.fixedReference).toEqual(reference)
    act(() => expect(reopened.result.current.closeCurrentMonth().ok).toBe(true))
    expect(reopened.result.current.history.snapshots[0]).toMatchObject({
      costs: 1200, costsPlanned: 1000, wants: 100, wantsPlanned: 200, investedPlanned: 500,
      wantAllocations: [{ id: 'trip', planned: 200, actual: 100 }],
    })
    const finalBackup = repositoryToBackupV9(readRepositoryDocument())
    expect(inspectBackupPayload(finalBackup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect((backupV9ToRepository(finalBackup).collections.history as Array<{ wantsPlanned: number }>)[0].wantsPlanned).toBe(200)
    reopened.unmount()
  })

  it('troca a simulação sem mover fatos e edita novembro sem alterar outubro', () => {
    const base = createDefaultScenario('Recorrente')
    base.salaryNet = 5000
    base.costs = [{ id: 'rent', name: 'Aluguel', value: 1000, category: 'contas', paidWith: 'account' }]
    const alternative = createDefaultScenario('Simulação')
    alternative.salaryNet = 9000
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: base.id, scenarios: [base, alternative],
      actuals: [{ month: '2026-10', costs: { rent: 1000 }, wants: {}, extraIncome: [], extraExpenses: [] }],
    } })
    expect(bootstrapMonthlyPlans().status).toBe('ready')
    const app = renderHook(() => useFinancas())
    expect(app.result.current.scenarios.salaryNet).toBe(5000)
    expect(app.result.current.actuals.summary.effectiveCosts).toBe(1000)
    act(() => expect(app.result.current.scenarios.setActiveScenarioId(alternative.id)).toBe(true))
    expect(app.result.current.scenarios.salaryNet).toBe(5000)
    expect(app.result.current.actuals.summary.effectiveCosts).toBe(1000)
    act(() => expect(app.result.current.scenarios.applyScenarioToActiveCycle(alternative.id)).toBe(true))
    expect(app.result.current.scenarios.salaryNet).toBe(9000)
    expect(app.result.current.actuals.summary.effectiveCosts).toBe(1000)
    act(() => expect(app.result.current.activeCycle.setCycleMonth('2026-11')).toBe(true))
    expect(app.result.current.scenarios.salaryNet).toBe(5000)
    act(() => expect(app.result.current.scenarios.setSalaryNet(6000)).toBe(true))
    const plans = readRepositoryDocument().collections.monthlyPlans as MonthlyPlan[]
    expect(plans.find((plan) => plan.month === '2026-10')?.salaryNet).toBe(9000)
    expect(plans.find((plan) => plan.month === '2026-11')?.salaryNet).toBe(6000)
    expect(plans.find((plan) => plan.month === '2026-11')?.customized).toBe(true)
    expect((readRepositoryDocument().collections.actuals as Array<{ month: string }>)[0].month).toBe('2026-10')
    act(() => expect(app.result.current.scenarios.saveCurrentPlanAsRecurring('model_only')).toBe(true))
    const template = (readRepositoryDocument().collections.scenarios as Array<typeof base>)
      .find((item) => item.id === base.id)
    expect(template?.salaryNet).toBe(6000)
    act(() => expect(app.result.current.activeCycle.setCycleMonth('2026-12')).toBe(true))
    expect(app.result.current.scenarios.salaryNet).toBe(6000)
    app.unmount()
  })

  it('atualiza só planos futuros intactos ao publicar o modelo', () => {
    const base = createDefaultScenario('Recorrente')
    base.salaryNet = 5000
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: base.id, scenarios: [base],
    } })
    expect(bootstrapMonthlyPlans().status).toBe('ready')
    const app = renderHook(() => useFinancas())
    act(() => expect(app.result.current.activeCycle.setCycleMonth('2026-11')).toBe(true))
    act(() => expect(app.result.current.scenarios.setSalaryNet(8000)).toBe(true))
    act(() => expect(app.result.current.activeCycle.setCycleMonth('2026-12')).toBe(true))
    act(() => expect(app.result.current.activeCycle.setCycleMonth('2026-10')).toBe(true))
    act(() => expect(app.result.current.scenarios.setSalaryNet(7000)).toBe(true))
    act(() => expect(app.result.current.scenarios.saveCurrentPlanAsRecurring('future_unmodified')).toBe(true))
    const plans = readRepositoryDocument().collections.monthlyPlans as MonthlyPlan[]
    expect(plans.find((item) => item.month === '2026-10')?.salaryNet).toBe(7000)
    expect(plans.find((item) => item.month === '2026-11')?.salaryNet).toBe(8000)
    expect(plans.find((item) => item.month === '2026-12')?.salaryNet).toBe(7000)
    app.unmount()
  })
})
