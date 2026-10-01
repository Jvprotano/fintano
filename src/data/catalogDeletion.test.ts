// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../lib/scenario'
import { readRepositoryDocument, writeRepositoryDocument } from './repository'
import { deleteUnusedCatalog } from './catalogDeletion'

describe('exclusão física de cadastros', () => {
  beforeEach(() => localStorage.clear())

  it('recusa posição com movimento ou referência de meta/folha e aceita cadastro realmente vazio', () => {
    const scenario = createDefaultScenario('Atual')
    scenario.deductions = [{ id: 'previdencia', name: 'Previdência', type: 'previdencia_privada',
      value: 100, employerContribution: 0, linkedHoldingId: 'h' }]
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      investmentHoldings: [{ id: 'h', name: 'Plano', assetClassId: 'renda-fixa',
        marketValue: 0, transactions: [] }], scenarios: [scenario], activeScenarioId: scenario.id,
    } })
    expect(deleteUnusedCatalog('holding', 'h')).toBe(false)
    expect(readRepositoryDocument().collections.investmentHoldings).toHaveLength(1)
    scenario.deductions = []
    writeRepositoryDocument({ ...readRepositoryDocument(), collections: {
      ...readRepositoryDocument().collections, scenarios: [scenario],
    } })
    expect(deleteUnusedCatalog('holding', 'h')).toBe(true)
    expect(readRepositoryDocument().collections.investmentHoldings).toEqual([])
  })

  it('recusa apagar custo e Desejo com realizado e permite um item sem fatos', () => {
    const scenario = createDefaultScenario('Atual')
    scenario.costs = [
      { id: 'pago', name: 'Internet', value: 100, category: 'contas' },
      { id: 'vazio', name: 'Teste', value: 0, category: 'outros' },
    ]
    scenario.wants = [{ id: 'usado', name: 'Viagem', plannedAmount: 50, paidWith: 'account' }]
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      scenarios: [scenario], activeScenarioId: scenario.id,
      actuals: [{ month: '2026-09', costs: { pago: 100 }, wants: { usado: 50 },
        extraIncome: [], extraExpenses: [] }],
    } })
    expect(deleteUnusedCatalog('cost', 'pago', scenario.id)).toBe(false)
    expect(deleteUnusedCatalog('want', 'usado', scenario.id)).toBe(false)
    expect(deleteUnusedCatalog('cost', 'vazio', scenario.id)).toBe(true)
    const saved = (readRepositoryDocument().collections.scenarios as Array<typeof scenario>)[0]
    expect(saved.costs.map((item) => item.id)).toEqual(['pago'])
    expect(saved.wants.map((item) => item.id)).toEqual(['usado'])
  })

  it('recusa meta ligada a evento e dívida com saldo', () => {
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      goals: [{ id: 'g', name: 'Hotel', targetAmount: 100, color: '#abc',
        createdAt: '2026-10-01T12:00:00.000Z', transactions: [], includes: [] }],
      forecastEvents: [{ id: 'e', name: 'Hotel', kind: 'expense', amount: 100,
        month: '2027-07', recurrence: 'once', goalId: 'g',
        createdAt: '2026-10-01T12:00:00.000Z' }],
      debts: [{ id: 'd', name: 'Empréstimo', kind: 'emprestimo', balance: 100,
        monthlyRatePct: 1, installment: 10, remainingInstallments: 10,
        createdAt: '2026-10-01T12:00:00.000Z', transactions: [] }],
    } })
    expect(deleteUnusedCatalog('goal', 'g')).toBe(false)
    expect(deleteUnusedCatalog('debt', 'd')).toBe(false)
    expect(readRepositoryDocument().collections.goals).toHaveLength(1)
    expect(readRepositoryDocument().collections.debts).toHaveLength(1)
  })
})
