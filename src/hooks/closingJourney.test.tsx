// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../lib/scenario'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { useFinancas } from './useFinancas'

describe('fechamento integrado do ciclo', () => {
  beforeEach(() => localStorage.clear())

  it('confirma o ciclo e a fatura em uma ação e sincroniza as leituras', () => {
    const scenario = createDefaultScenario('Atual')
    scenario.salaryNet = 5000
    scenario.wants = []
    scenario.costs = [{ id: 'cost-1', name: 'Internet', value: 100, category: 'contas', paidWith: 'account' }]
    writeRepositoryDocument({
      schemaVersion: 7,
      updatedAt: '2026-09-30T12:00:00.000Z',
      collections: {
        activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
        scenarios: [scenario], activeScenarioId: scenario.id,
        cardAccounts: [{ id: 'itau', name: 'Itaú', currentDueMonth: '2026-10', closingDay: 25, dueDay: 5, confirmedEmptyDueMonths: ['2026-09'] }],
        cardSettings: { paymentDate: '05/10', currentDueMonth: '2026-10', personalSpendingLimit: 1500 },
        cardEntries: [{
          id: 'charge-1', accountId: 'itau', dueMonth: '2026-10', cycle: 'current', description: 'Mercado', purchaseDate: '10/09',
          cardName: 'Itaú', amount: 300, personalAmount: 300, remainingAmount: 0,
        }],
        cardPaidInvoices: [{ id: 'previous', accountId: 'itau', dueMonth: '2026-09', total: 0, personalTotal: 0, paidAt: '2026-09-05T12:00:00.000Z' }], actuals: [{ month: '2026-09', paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 }, costs: { 'cost-1': 100 }, wants: {}, extraIncome: [], extraExpenses: [] }], history: [],
      },
    })

    const app = renderHook(() => useFinancas())
    const revision = repositoryRevision()
    act(() => {
      expect(app.result.current.closeCurrentMonth('2026-09', 'Conferido', {
        payInvoice: true, expectedRevision: revision,
      })).toMatchObject({ ok: true, alreadyApplied: false })
    })

    const saved = readRepositoryDocument().collections
    expect((saved.activeCycle as { month: string }).month).toBe('2026-10')
    expect((saved.actuals as Array<{ costs: Record<string, number> }>)[0].costs).toEqual({ 'cost-1': 100 })
    expect(saved.history).toHaveLength(1)
    expect((saved.cardPaidInvoices as unknown[])).toHaveLength(2)
    expect(app.result.current.activeCycle.month).toBe('2026-10')
    expect(app.result.current.cards.accounts[0].currentDueMonth).toBe('2026-11')
    app.unmount()
  })
})
