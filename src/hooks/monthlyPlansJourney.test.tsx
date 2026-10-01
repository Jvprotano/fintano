// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { bootstrapMonthlyPlans } from '../data/monthlyPlanMigration'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { createDefaultScenario } from '../lib/scenario'
import type { MonthlyPlan } from '../lib/monthlyPlans'
import { useFinancas } from './useFinancas'

describe('plano separado por competência', () => {
  beforeEach(() => localStorage.clear())

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
