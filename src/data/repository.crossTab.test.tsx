// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getPersistenceError } from '../lib/persistence'
import {
  bootstrapRepository, readRepositoryDocument, REPOSITORY_STORAGE_KEY,
  useRepositoryState, writeRepositoryDocument,
} from './repository'

describe('edição em outra aba', () => {
  it('avisa e bloqueia uma gravação baseada em formulário antigo', () => {
    localStorage.clear()
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: new Date().toISOString(), collections: { assets: [] } })
    bootstrapRepository()
    const form = renderHook(() => useRepositoryState<string[]>('assets', []))
    const before = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    const updated = { ...readRepositoryDocument(), collections: { assets: ['outro registro'] } }
    localStorage.setItem(REPOSITORY_STORAGE_KEY, JSON.stringify(updated))
    const external = localStorage.getItem(REPOSITORY_STORAGE_KEY)

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: REPOSITORY_STORAGE_KEY, oldValue: before, newValue: external, storageArea: localStorage,
      }))
    })
    act(() => expect(form.result.current[1](['rascunho antigo'])).toBe(false))
    expect(localStorage.getItem(REPOSITORY_STORAGE_KEY)).toBe(external)
    expect(getPersistenceError()?.kind).toBe('conflict')
    form.unmount()
  })
})
