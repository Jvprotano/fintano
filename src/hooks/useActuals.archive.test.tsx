// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { useActuals } from './useActuals'

describe('realizado com item arquivado', () => {
  it('editar outro Desejo não apaga o valor do item ausente do plano', () => {
    localStorage.clear()
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: { actuals: [{
        month: '2026-09', costs: {}, wants: { antigo: 100, atual: 50 },
        extraIncome: [], extraExpenses: [],
      }] },
    })
    const app = renderHook(() => useActuals(
      [], [{ id: 'atual', name: 'Viagem', plannedAmount: 50, paidWith: 'account' }],
      '2026-09', [], [{ id: 'antigo', name: 'Cinema antigo', plannedAmount: 80, paidWith: 'account' }],
    ))
    expect(app.result.current.summary.effectiveWants).toBe(150)
    act(() => expect(app.result.current.setWantActual('atual', 75)).toBe(true))
    expect((readRepositoryDocument().collections.actuals as Array<{ wants: Record<string, number> }>)[0].wants)
      .toEqual({ antigo: 100, atual: 75 })
    expect(app.result.current.summary.effectiveWants).toBe(175)
    app.unmount()
  })
})
