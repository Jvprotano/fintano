// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { useInvestments } from './useInvestments'

describe('arquivamento de posição e meta', () => {
  beforeEach(() => localStorage.clear())

  it('mantém movimentos, patrimônio e identidade após arquivar e restaurar', () => {
    writeRepositoryDocument({
      schemaVersion: 7,
      updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        investmentHoldings: [{
          id: 'holding-1', name: 'CDB antigo', assetClassId: 'renda-fixa', marketValue: 100,
          purpose: 'portfolio', transactions: [{
            id: 'tx-h', amount: 100, date: '2026-09-10T12:00:00.000Z', cycleMonth: '2026-09',
          }],
        }],
        goals: [{
          id: 'goal-1', name: 'Viagem', targetAmount: 500, color: '#58a',
          createdAt: '2026-09-01T12:00:00.000Z', kind: 'funding', transactions: [{
            id: 'tx-g', amount: 50, date: '2026-09-11T12:00:00.000Z', cycleMonth: '2026-09',
          }], includes: [{ type: 'holding', id: 'holding-1', amount: 50 }],
        }],
      },
    })
    const app = renderHook(() => useInvestments(0, {}, '2026-10'))
    const actual = () => calculateMonthlyInvestmentActuals({
      month: '2026-09', emergencyFund: app.result.current.emergencyFund,
      holdings: app.result.current.holdings,
      goals: app.result.current.goals,
    }).directNet
    expect(actual()).toBe(150)
    expect(app.result.current.summary.financialAssets).toBe(150)

    act(() => {
      expect(app.result.current.removeHolding('holding-1')).toBe(true)
      expect(app.result.current.removeGoal('goal-1')).toBe(true)
    })
    const archived = readRepositoryDocument().collections
    expect(archived.investmentHoldings).toHaveLength(1)
    expect(archived.goals).toHaveLength(1)
    expect(app.result.current.holdings[0].archivedAt).toBeTruthy()
    expect(app.result.current.goals[0].archivedAt).toBeTruthy()
    expect(actual()).toBe(150)
    expect(app.result.current.summary.financialAssets).toBe(150)

    act(() => {
      expect(app.result.current.restoreHolding('holding-1')).toBe(true)
      expect(app.result.current.restoreGoal('goal-1')).toBe(true)
    })
    expect(app.result.current.holdings[0].archivedAt).toBeUndefined()
    expect(app.result.current.goals[0].archivedAt).toBeUndefined()
    act(() => expect(app.result.current.updateHolding('holding-1', { purpose: 'emergency_fund' })).toBe(true))
    expect((readRepositoryDocument().collections.goals as Array<{ includes: unknown[] }>)[0].includes)
      .toEqual([{ type: 'holding', id: 'holding-1', amount: 50 }])
    app.unmount()
  })
})
