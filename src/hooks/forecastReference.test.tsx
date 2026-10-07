// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { useForecast } from './useForecast'

describe('origem de evento efetivado', () => {
  it('cancela e reativa sem apagar evento ou entrada recebida', () => {
    localStorage.clear()
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        forecastEvents: [{ id: 'bonus', name: 'Bônus', kind: 'income', amount: 1000,
          month: '2026-09', recurrence: 'once', createdAt: '2026-08-01T12:00:00.000Z' }],
        actuals: [{ month: '2026-09', costs: {}, wants: {}, extraIncome: [{
          id: 'recebido', name: 'Bônus', amount: 1000, sourceEventId: 'bonus',
        }], extraExpenses: [] }],
      },
    })
    const app = renderHook(() => useForecast('2026-10'))
    act(() => expect(app.result.current.removeEvent('bonus')).toBe(true))
    expect(readRepositoryDocument().collections.forecastEvents).toHaveLength(1)
    expect(app.result.current.events[0].cancelled).toBe(true)
    act(() => expect(app.result.current.restoreEvent('bonus')).toBe(true))
    expect(app.result.current.events[0].cancelled).toBe(false)
    app.unmount()
  })
})
