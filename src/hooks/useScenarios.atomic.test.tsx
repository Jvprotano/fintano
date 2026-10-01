// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRepositoryDocument, REPOSITORY_STORAGE_KEY, writeRepositoryDocument } from '../data/repository'
import { createDefaultScenario } from '../lib/scenario'
import { useScenarios } from './useScenarios'

describe('cenários e seleção ativa', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('cria, duplica e remove cenários junto com a seleção ativa', () => {
    const app = renderHook(() => useScenarios())
    expect(readRepositoryDocument().collections.scenarios).toHaveLength(1)
    const originalId = app.result.current.activeScenarioId

    act(() => expect(app.result.current.createScenario('Viagem')).toBe(true))
    const createdId = app.result.current.activeScenarioId
    expect(createdId).not.toBe(originalId)
    expect(readRepositoryDocument().collections).toMatchObject({ activeScenarioId: createdId })
    expect(readRepositoryDocument().collections.scenarios).toHaveLength(2)

    act(() => expect(app.result.current.duplicateScenario(createdId)).toBe(true))
    const duplicateId = app.result.current.activeScenarioId
    expect(duplicateId).not.toBe(createdId)
    expect(readRepositoryDocument().collections.scenarios).toHaveLength(3)

    act(() => expect(app.result.current.removeScenario(duplicateId)).toBe(true))
    expect(readRepositoryDocument().collections.scenarios).toHaveLength(2)
    expect(readRepositoryDocument().collections.activeScenarioId).toBe(originalId)
    app.unmount()
  })

  it('mantém lista e seleção intactas quando a gravação falha', () => {
    const app = renderHook(() => useScenarios())
    const before = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === REPOSITORY_STORAGE_KEY) throw new Error('write refused')
      return write.call(this, key, value)
    })

    act(() => expect(app.result.current.createScenario('Viagem')).toBe(false))
    expect(localStorage.getItem(REPOSITORY_STORAGE_KEY)).toBe(before)
    expect(app.result.current.scenarios).toHaveLength(1)
    app.unmount()
  })

  it('impede exclusão do último cadastro que explica um valor realizado', () => {
    const first = createDefaultScenario('Atual')
    const second = createDefaultScenario('Alternativa')
    second.costs = [{ id: 'internet', name: 'Internet', value: 100, category: 'contas' }]
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        scenarios: [first, second], activeScenarioId: second.id,
        actuals: [{ month: '2026-09', costs: { internet: 120 }, wants: {}, extraIncome: [], extraExpenses: [] }],
      },
    })
    const app = renderHook(() => useScenarios())
    act(() => expect(app.result.current.removeScenario(second.id)).toBe(false))
    expect(readRepositoryDocument().collections.scenarios).toHaveLength(2)
    expect(readRepositoryDocument().collections.activeScenarioId).toBe(second.id)
    app.unmount()
  })
})
