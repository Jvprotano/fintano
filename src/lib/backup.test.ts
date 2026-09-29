import { describe, expect, it } from 'vitest'
import { createDefaultScenario } from './scenario'
import {
  AUTO_BACKUP_KEY,
  buildBackupPayload,
  clearAllFinTanoStorage,
  clearAppStorage,
  inspectBackup,
  restoreBackup,
} from './backup'
import {
  REPOSITORY_STORAGE_KEY,
  type RepositoryDocument,
  writeRepositoryDocument,
} from '../data/repository'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  failOnceFor: string | null = null

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    if (this.failOnceFor === key) {
      this.failOnceFor = null
      throw new DOMException('quota', 'QuotaExceededError')
    }
    this.values.set(key, String(value))
  }
}

function repository(): RepositoryDocument {
  const scenario = createDefaultScenario('Atual')
  return {
    schemaVersion: 7,
    updatedAt: '2026-09-01T12:00:00.000Z',
    collections: {
      activeCycle: { month: '2026-09', salaryHintDay: 1, cardDueHintDay: 5 },
      activeScenarioId: scenario.id,
      scenarios: [scenario],
      actuals: [],
      cardEntries: [],
      cardAccounts: [],
      cardPaidInvoices: [],
      investmentHoldings: [],
      history: [],
    },
  }
}

describe('backup v8 seguro', () => {
  it('exporta domínio em centavos sem preferências ou chaves de localStorage', () => {
    const storage = new MemoryStorage()
    const document = repository()
    const scenario = (document.collections.scenarios as ReturnType<typeof createDefaultScenario>[])[0]
    scenario.salaryNet = 9_024
    writeRepositoryDocument(document, storage)
    storage.setItem('uf_collapsed_income', 'true')

    const backup = buildBackupPayload(storage, '2026-09-01T12:00:00.000Z')

    expect(backup.schemaVersion).toBe(8)
    expect(backup.planning.templates[0].salaryCents).toBe(902_400)
    expect(JSON.stringify(backup)).not.toContain('uf_collapsed_income')
    expect(JSON.stringify(backup)).not.toContain('localStorage')
  })

  it('migra e inspeciona um backup v6 antes da gravação', () => {
    const scenario = createDefaultScenario('Atual')
    const inspection = inspectBackup({
      app: 'fintano',
      version: 6,
      exportedAt: '2026-09-01T12:00:00.000Z',
      localStorage: {
        uf_active_cycle_v1: JSON.stringify({ month: '2026-09' }),
        uf_active_scenario_v3: JSON.stringify(scenario.id),
        uf_scenarios_v3: JSON.stringify([scenario]),
      },
    })

    expect(inspection.migratedFromVersion).toBe(6)
    expect(inspection.counts.planningTemplates).toBe(1)
    expect(inspection.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('restaura um documento único e cria cópia do estado anterior', () => {
    const source = new MemoryStorage()
    writeRepositoryDocument(repository(), source)
    const backup = buildBackupPayload(source)
    const target = new MemoryStorage()
    const previous = repository()
    ;(previous.collections.scenarios as ReturnType<typeof createDefaultScenario>[])[0].name = 'Anterior'
    writeRepositoryDocument(previous, target)

    const result = restoreBackup(backup, target)

    expect(result.ok).toBe(true)
    expect(target.getItem(REPOSITORY_STORAGE_KEY)).toContain('collections')
    expect(target.getItem(AUTO_BACKUP_KEY)).toContain('Anterior')
    expect(target.getItem('uf_scenarios_v3')).toBeNull()
  })

  it('faz rollback se a gravação do documento falhar', () => {
    const source = new MemoryStorage()
    writeRepositoryDocument(repository(), source)
    const backup = buildBackupPayload(source)
    const target = new MemoryStorage()
    const previous = repository()
    ;(previous.collections.scenarios as ReturnType<typeof createDefaultScenario>[])[0].name = 'Anterior'
    writeRepositoryDocument(previous, target)
    target.failOnceFor = REPOSITORY_STORAGE_KEY

    const result = restoreBackup(backup, target)

    expect(result.ok).toBe(false)
    expect(target.getItem(REPOSITORY_STORAGE_KEY)).toContain('Anterior')
  })

  it('distingue limpar dados atuais de apagar também preferências e cópias', () => {
    const storage = new MemoryStorage()
    writeRepositoryDocument(repository(), storage)
    storage.setItem('uf_collapsed_income', 'true')
    storage.setItem(AUTO_BACKUP_KEY, '[]')

    clearAppStorage(storage)
    expect(storage.getItem(REPOSITORY_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('uf_collapsed_income')).toBe('true')
    expect(storage.getItem(AUTO_BACKUP_KEY)).toBe('[]')

    clearAllFinTanoStorage(storage)
    expect(storage.getItem('uf_collapsed_income')).toBeNull()
    expect(storage.getItem(AUTO_BACKUP_KEY)).toBeNull()
  })
})
