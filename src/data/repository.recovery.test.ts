import { describe, expect, it } from 'vitest'
import { buildBackupPayload, restoreBackup } from '../lib/backup'
import { createDefaultScenario } from '../lib/scenario'
import {
  bootstrapRepository,
  inspectRepository,
  LEGACY_DOMAIN_KEYS,
  readRepositoryDocument,
  REPOSITORY_STORAGE_KEY,
  writeRepositoryDocument,
} from './repository'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  failKey: string | null = null
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('write refused')
    this.values.set(key, value)
  }
}

describe('abertura e recuperação do repositório', () => {
  it('inicializa instalação vazia e migra legado válido sem apagar antes de gravar', () => {
    const empty = new MemoryStorage()
    expect(bootstrapRepository(empty)).toMatchObject({ status: 'ready', source: 'empty' })
    expect(readRepositoryDocument(empty).collections).toEqual({})

    const legacy = new MemoryStorage()
    legacy.setItem(LEGACY_DOMAIN_KEYS.scenarios, JSON.stringify([createDefaultScenario('Atual')]))
    legacy.failKey = REPOSITORY_STORAGE_KEY
    expect(bootstrapRepository(legacy).status).toBe('blocked')
    expect(legacy.getItem(LEGACY_DOMAIN_KEYS.scenarios)).not.toBeNull()
    legacy.failKey = null
    expect(bootstrapRepository(legacy)).toMatchObject({ status: 'ready', source: 'legacy' })
    expect(readRepositoryDocument(legacy).collections.scenarios).toHaveLength(1)
    expect(legacy.getItem(LEGACY_DOMAIN_KEYS.scenarios)).toBeNull()
  })

  it('não substitui JSON truncado nem versão desconhecida, mesmo com legado presente', () => {
    for (const raw of [
      '{"schemaVersion":7,"collections":',
      '{"schemaVersion":99,"updatedAt":"x","collections":{}}',
      '{"schemaVersion":7,"updatedAt":"2026-09-30T12:00:00.000Z","collections":{"scenarios":"inválido"}}',
    ]) {
      const storage = new MemoryStorage()
      storage.setItem(REPOSITORY_STORAGE_KEY, raw)
      storage.setItem(LEGACY_DOMAIN_KEYS.scenarios, '[]')
      const inspection = bootstrapRepository(storage)
      expect(inspection.status).toBe('blocked')
      expect(storage.getItem(REPOSITORY_STORAGE_KEY)).toBe(raw)
      expect(storage.getItem(LEGACY_DOMAIN_KEYS.scenarios)).toBe('[]')
      expect(() => readRepositoryDocument(storage)).toThrow()
    }
  })

  it('interrompe migração de legado corrompido sem apagar os demais registros', () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_DOMAIN_KEYS.scenarios, '[{')
    storage.setItem(LEGACY_DOMAIN_KEYS.actuals, '[]')
    expect(bootstrapRepository(storage).status).toBe('blocked')
    expect(storage.getItem(REPOSITORY_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_DOMAIN_KEYS.scenarios)).toBe('[{')
    expect(storage.getItem(LEGACY_DOMAIN_KEYS.actuals)).toBe('[]')
  })

  it('restaura cópia validada somente pelo caminho de recuperação e preserva o original se a gravação falhar', () => {
    const source = new MemoryStorage()
    writeRepositoryDocument({
      schemaVersion: 7,
      updatedAt: '2026-09-30T12:00:00.000Z',
      collections: { scenarios: [createDefaultScenario('Recuperado')] },
    }, source)
    const backup = buildBackupPayload(source)
    const target = new MemoryStorage()
    const original = '{"schemaVersion":7,"collections":'
    target.setItem(REPOSITORY_STORAGE_KEY, original)

    expect(restoreBackup(backup, target).ok).toBe(false)
    expect(target.getItem(REPOSITORY_STORAGE_KEY)).toBe(original)
    target.failKey = REPOSITORY_STORAGE_KEY
    expect(restoreBackup(backup, target, { recoverInvalidSource: true }).ok).toBe(false)
    expect(target.getItem(REPOSITORY_STORAGE_KEY)).toBe(original)
    target.failKey = null
    expect(restoreBackup(backup, target, { recoverInvalidSource: true }).ok).toBe(true)
    expect(inspectRepository(target)).toMatchObject({ status: 'ready', source: 'document' })
  })
})
