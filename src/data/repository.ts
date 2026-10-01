import { useCallback, useEffect, useRef, useState } from 'react'
import { writeStorageValue } from '../lib/persistence'

export const REPOSITORY_STORAGE_KEY = 'fintano_data_v7'
export const REPOSITORY_SCHEMA_VERSION = 7 as const
export const REPOSITORY_CHANGED_EVENT = 'fintano:repository-changed'

export const LEGACY_DOMAIN_KEYS = {
  activeCycle: 'uf_active_cycle_v1',
  activeScenarioId: 'uf_active_scenario_v3',
  scenarios: 'uf_scenarios_v3',
  actuals: 'uf_actuals_v1',
  assets: 'uf_assets_v1',
  debts: 'uf_debts_v1',
  cardAccounts: 'uf_credit_card_accounts_v1',
  cardEntries: 'uf_credit_card_entries_v1',
  cardPaidInvoices: 'uf_credit_card_paid_invoices_v2',
  cardSettings: 'uf_credit_card_settings_v1',
  emergencyFund: 'uf_emergency_fund_v1',
  forecastAssumptions: 'uf_forecast_assumptions_v1',
  forecastEvents: 'uf_expected_events_v1',
  forecastFunds: 'uf_forecast_funds_v1',
  goals: 'uf_goals_v1',
  history: 'uf_history_v1',
  investmentClasses: 'uf_investment_classes_v1',
  investmentHoldings: 'uf_investment_holdings_v1',
} as const

export type RepositoryCollection = keyof typeof LEGACY_DOMAIN_KEYS

export interface RepositoryDocument {
  schemaVersion: typeof REPOSITORY_SCHEMA_VERSION
  updatedAt: string
  collections: Partial<Record<RepositoryCollection, unknown>>
  appliedOperations?: string[]
}

export type RepositoryInspection =
  | { status: 'ready'; source: 'document' | 'legacy' | 'empty'; document: RepositoryDocument }
  | { status: 'blocked'; reason: 'corrupt' | 'unsupported'; message: string; rawEntries: Record<string, string> }

const ARRAY_COLLECTIONS = new Set<RepositoryCollection>([
  'scenarios', 'actuals', 'assets', 'debts', 'cardAccounts', 'cardEntries',
  'cardPaidInvoices', 'forecastEvents', 'forecastFunds', 'goals', 'history',
  'investmentClasses', 'investmentHoldings',
])
const OBJECT_COLLECTIONS = new Set<RepositoryCollection>([
  'cardSettings', 'emergencyFund', 'forecastAssumptions',
])

function hasValidCollectionShapes(collections: Record<string, unknown>): boolean {
  return Object.entries(collections).every(([key, value]) => {
    if (ARRAY_COLLECTIONS.has(key as RepositoryCollection)) return Array.isArray(value)
    if (OBJECT_COLLECTIONS.has(key as RepositoryCollection)) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }
    if (key === 'activeCycle') return value === null || (typeof value === 'object' && !Array.isArray(value))
    if (key === 'activeScenarioId') return typeof value === 'string'
    return false
  })
}

function emptyDocument(): RepositoryDocument {
  return {
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    collections: {},
  }
}

function parseDocument(raw: string): RepositoryDocument | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RepositoryDocument>
    if (
      !parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      parsed.schemaVersion !== REPOSITORY_SCHEMA_VERSION ||
      !parsed.collections ||
      typeof parsed.collections !== 'object' || Array.isArray(parsed.collections) ||
      typeof parsed.updatedAt !== 'string' || !Number.isFinite(Date.parse(parsed.updatedAt)) ||
      !hasValidCollectionShapes(parsed.collections as Record<string, unknown>) ||
      (parsed.appliedOperations !== undefined &&
        (!Array.isArray(parsed.appliedOperations) ||
          parsed.appliedOperations.some((id) => typeof id !== 'string')))
    ) {
      return null
    }
    return {
      schemaVersion: REPOSITORY_SCHEMA_VERSION,
      updatedAt: parsed.updatedAt,
      collections: parsed.collections,
      appliedOperations: parsed.appliedOperations,
    }
  } catch {
    return null
  }
}

function readLegacyCollections(storage: Storage): RepositoryDocument {
  const document = emptyDocument()
  for (const [collection, storageKey] of Object.entries(LEGACY_DOMAIN_KEYS) as [
    RepositoryCollection,
    string,
  ][]) {
    const raw = storage.getItem(storageKey)
    if (raw === null) continue
    document.collections[collection] = JSON.parse(raw) as unknown
  }
  return document
}

export function inspectRepository(storage: Storage = window.localStorage): RepositoryInspection {
  const raw = storage.getItem(REPOSITORY_STORAGE_KEY)
  if (raw !== null) {
    const document = parseDocument(raw)
    if (document) return { status: 'ready', source: 'document', document }
    let version: unknown
    try { version = (JSON.parse(raw) as { schemaVersion?: unknown })?.schemaVersion } catch { /* JSON incompleto */ }
    const unsupported = typeof version === 'number' && version !== REPOSITORY_SCHEMA_VERSION
    return {
      status: 'blocked',
      reason: unsupported ? 'unsupported' : 'corrupt',
      message: unsupported
        ? `A versão ${version} deste documento não é compatível com esta instalação.`
        : 'O documento financeiro salvo neste navegador está incompleto ou inválido.',
      rawEntries: { [REPOSITORY_STORAGE_KEY]: raw },
    }
  }

  const rawEntries: Record<string, string> = {}
  for (const key of Object.values(LEGACY_DOMAIN_KEYS)) {
    const value = storage.getItem(key)
    if (value !== null) rawEntries[key] = value
  }
  if (Object.keys(rawEntries).length === 0) {
    return { status: 'ready', source: 'empty', document: emptyDocument() }
  }
  try {
    return { status: 'ready', source: 'legacy', document: readLegacyCollections(storage) }
  } catch {
    return {
      status: 'blocked', reason: 'corrupt',
      message: 'Um ou mais registros antigos estão inválidos. A migração foi interrompida.',
      rawEntries,
    }
  }
}

export function readRepositoryDocument(
  storage: Storage = window.localStorage,
): RepositoryDocument {
  const inspection = inspectRepository(storage)
  if (inspection.status === 'blocked') throw new Error(inspection.message)
  return inspection.document
}

export function removeLegacyDomainKeys(storage: Storage = window.localStorage): void {
  for (const key of Object.values(LEGACY_DOMAIN_KEYS)) storage.removeItem(key)
  // Formatos anteriores aos domínios atuais nunca voltam para o documento v7.
  for (const key of [
    'uf_active_scenario_v2',
    'uf_scenarios_v2',
    'uf_costs',
    'uf_custom_model',
    'uf_deductions',
    'uf_diversification',
    'uf_model',
    'uf_salary_input_mode',
    'uf_salary_net',
    'uf_surplus_desejos',
    'uf_wants',
    'uf_credit_card_last_paid_invoice_v1',
  ]) {
    storage.removeItem(key)
  }
}

export function writeRepositoryDocument(
  document: RepositoryDocument,
  storage: Storage = window.localStorage,
): boolean {
  const normalized: RepositoryDocument = {
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    collections: document.collections,
    appliedOperations: document.appliedOperations,
  }
  try {
    storage.setItem(REPOSITORY_STORAGE_KEY, JSON.stringify(normalized))
    return true
  } catch {
    // `writeStorageValue` mantém o mecanismo existente de erro visível na UI.
    if (typeof window !== 'undefined' && storage === window.localStorage) {
      return writeStorageValue(REPOSITORY_STORAGE_KEY, JSON.stringify(normalized), storage)
    }
    return false
  }
}

/** Consolida uma instalação antiga numa gravação única antes do primeiro render. */
export function bootstrapRepository(storage: Storage = window.localStorage): RepositoryInspection {
  const inspection = inspectRepository(storage)
  if (inspection.status === 'blocked' || inspection.source === 'document') return inspection
  if (!writeRepositoryDocument(inspection.document, storage)) {
    return {
      status: 'blocked', reason: 'corrupt',
      message: 'Não foi possível inicializar os dados neste navegador. Verifique o armazenamento e tente novamente.',
      rawEntries: inspection.source === 'legacy'
        ? Object.fromEntries(Object.values(LEGACY_DOMAIN_KEYS).flatMap((key) => {
          const raw = storage.getItem(key)
          return raw === null ? [] : [[key, raw]]
        }))
        : {},
    }
  }
  if (inspection.source === 'legacy') removeLegacyDomainKeys(storage)
  return inspection
}

export type RepositorySetter<T> = (value: T | ((previous: T) => T)) => boolean

export function useRepositoryState<T>(
  collection: RepositoryCollection,
  initialValue: T | (() => T),
): [T, RepositorySetter<T>] {
  const [fallbackValue] = useState<T>(() =>
    initialValue instanceof Function ? (initialValue as () => T)() : initialValue,
  )
  const readValue = useCallback(() => {
    const stored = readRepositoryDocument().collections[collection]
    return stored === undefined ? fallbackValue : (stored as T)
  }, [collection, fallbackValue])
  const [value, setValueState] = useState<T>(readValue)
  const valueRef = useRef(value)

  const setValue = useCallback<RepositorySetter<T>>(
    (valueOrUpdater) => {
      const document = readRepositoryDocument()
      const persisted = document.collections[collection]
      const previous = persisted === undefined ? valueRef.current : (persisted as T)
      const next = valueOrUpdater instanceof Function ? valueOrUpdater(previous) : valueOrUpdater
      const nextDocument: RepositoryDocument = {
        ...document,
        collections: { ...document.collections, [collection]: next },
      }
      if (!writeRepositoryDocument(nextDocument)) return false
      removeLegacyDomainKeys()
      valueRef.current = next
      setValueState(next)
      window.dispatchEvent(new CustomEvent(REPOSITORY_CHANGED_EVENT, { detail: nextDocument }))
      return true
    },
    [collection],
  )

  useEffect(() => {
    const sync = () => {
      const next = readValue()
      valueRef.current = next
      setValueState(next)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === REPOSITORY_STORAGE_KEY) sync()
    }
    window.addEventListener(REPOSITORY_CHANGED_EVENT, sync)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(REPOSITORY_CHANGED_EVENT, sync)
      window.removeEventListener('storage', handleStorage)
    }
  }, [readValue])

  return [value, setValue]
}
