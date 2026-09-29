import { useCallback, useEffect, useRef, useState } from 'react'
import { writeStorageValue } from '../lib/persistence'

export const REPOSITORY_STORAGE_KEY = 'fintano_data_v7'
export const REPOSITORY_SCHEMA_VERSION = 7 as const
const REPOSITORY_CHANGED_EVENT = 'fintano:repository-changed'

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
}

function emptyDocument(): RepositoryDocument {
  return {
    schemaVersion: REPOSITORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    collections: {},
  }
}

function parseDocument(raw: string | null): RepositoryDocument | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<RepositoryDocument>
    if (
      parsed.schemaVersion !== REPOSITORY_SCHEMA_VERSION ||
      !parsed.collections ||
      typeof parsed.collections !== 'object'
    ) {
      return null
    }
    return {
      schemaVersion: REPOSITORY_SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      collections: parsed.collections,
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
    try {
      document.collections[collection] = JSON.parse(raw) as unknown
    } catch {
      // A coleção inválida fica ausente e o hook responsável aplica seu padrão seguro.
    }
  }
  return document
}

export function readRepositoryDocument(
  storage: Storage = window.localStorage,
): RepositoryDocument {
  return parseDocument(storage.getItem(REPOSITORY_STORAGE_KEY)) ?? readLegacyCollections(storage)
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
  }
  try {
    storage.setItem(REPOSITORY_STORAGE_KEY, JSON.stringify(normalized))
    return true
  } catch {
    // `writeStorageValue` mantém o mecanismo existente de erro visível na UI.
    if (storage === window.localStorage) {
      return writeStorageValue(REPOSITORY_STORAGE_KEY, JSON.stringify(normalized), storage)
    }
    return false
  }
}

/** Consolida uma instalação antiga numa gravação única antes do primeiro render. */
export function bootstrapRepository(storage: Storage = window.localStorage): boolean {
  if (parseDocument(storage.getItem(REPOSITORY_STORAGE_KEY))) return true
  const document = readLegacyCollections(storage)
  if (!writeRepositoryDocument(document, storage)) return false
  removeLegacyDomainKeys(storage)
  return true
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
