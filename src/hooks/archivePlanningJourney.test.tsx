// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { createDefaultScenario } from '../lib/scenario'
import { useFinancas } from './useFinancas'

describe('retirar item do plano sem apagar realizado', () => {
  it('conserva valores e nomes já informados após arquivar custo e Desejo', () => {
    localStorage.clear()
    const scenario = createDefaultScenario('Atual')
    scenario.salaryNet = 5000
    scenario.costs = [{ id: 'internet', name: 'Internet', value: 100, category: 'contas', paidWith: 'account' }]
    scenario.wants = [{ id: 'viagem', name: 'Viagem', plannedAmount: 50, paidWith: 'account' }]
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
        scenarios: [scenario], activeScenarioId: scenario.id,
        actuals: [{ month: '2026-09', costs: { internet: 120 }, wants: { viagem: 40 },
          extraIncome: [], extraExpenses: [] }],
      },
    })
    const app = renderHook(() => useFinancas())
    expect(app.result.current.metrics.totalCosts).toBe(100)
    expect(app.result.current.actuals.summary.effectiveCosts).toBe(120)
    act(() => {
      expect(app.result.current.scenarios.removeCost('internet')).toBe(true)
      expect(app.result.current.scenarios.removeWant('viagem')).toBe(true)
    })
    expect(app.result.current.metrics.totalCosts).toBe(0)
    expect(app.result.current.metrics.totalWantsAmount).toBe(0)
    expect(app.result.current.actuals.summary).toMatchObject({
      effectiveCosts: 120, effectiveWants: 40, plannedCosts: 0, plannedWants: 0,
    })
    expect(app.result.current.actuals.summary.rows[0].cost.name).toBe('Internet')
    expect(app.result.current.actuals.summary.wantRows[0].want.name).toBe('Viagem')
    act(() => expect(app.result.current.actuals.fillFromPlan()).toBe(true))
    expect(app.result.current.actuals.summary.effectiveCosts).toBe(120)
    expect(app.result.current.actuals.summary.effectiveWants).toBe(40)
    expect((readRepositoryDocument().collections.actuals as Array<{ costs: Record<string, number>; wants: Record<string, number> }>)[0])
      .toMatchObject({ costs: { internet: 120 }, wants: { viagem: 40 } })
    app.unmount()
  })

  it('não arquiva a parcela ligada a uma dívida ainda ativa', () => {
    localStorage.clear()
    const scenario = createDefaultScenario('Atual')
    scenario.costs = [{ id: 'parcela', name: 'Parcela do carro', value: 500, category: 'dividas' }]
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
        scenarios: [scenario], activeScenarioId: scenario.id,
        debts: [{ id: 'debt-1', name: 'Carro', kind: 'financiamento', balance: 5000,
          monthlyRatePct: 1, installment: 500, remainingInstallments: 10,
          linkedCostId: 'parcela', transactions: [], createdAt: '2026-09-01T12:00:00.000Z' }],
      },
    })
    const app = renderHook(() => useFinancas())
    act(() => expect(app.result.current.scenarios.removeCost('parcela')).toBe(false))
    expect(app.result.current.scenarios.costs[0].archivedAt).toBeUndefined()
    app.unmount()
  })

  it('arquiva e restaura envelope de cartão com os filhos sem mudar a soma', () => {
    localStorage.clear()
    const scenario = createDefaultScenario('Atual')
    scenario.salaryNet = 5000
    scenario.wants = [
      { id: 'cartao', name: 'Cartão', plannedAmount: 600, paidWith: 'card' },
      { id: 'restaurante', name: 'Restaurante', plannedAmount: 200, paidWith: 'card' },
    ]
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: { scenarios: [scenario], activeScenarioId: scenario.id } })
    const app = renderHook(() => useFinancas())
    expect(app.result.current.metrics.totalWantsAmount).toBe(600)
    act(() => expect(app.result.current.scenarios.removeWant('cartao')).toBe(true))
    expect(app.result.current.scenarios.archivedWants).toHaveLength(2)
    expect(app.result.current.metrics.totalWantsAmount).toBe(0)
    act(() => expect(app.result.current.scenarios.restoreWant('cartao')).toBe(true))
    expect(app.result.current.scenarios.archivedWants).toHaveLength(0)
    expect(app.result.current.metrics.totalWantsAmount).toBe(600)
    app.unmount()
  })
})
