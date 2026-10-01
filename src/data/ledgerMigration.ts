import type { LedgerEntry } from '../types'
import { createAutoBackupNow } from '../lib/backup'
import { classifyLegacyLedgerEntry, isLedgerEntryKind, type LedgerOwner } from '../lib/shared'
import { createDefaultScenario } from '../lib/scenario'
import {
  bootstrapRepository, REPOSITORY_STORAGE_KEY, type RepositoryDocument,
  type RepositoryInspection,
} from './repository'
import { repositoryRevision, runRepositoryCommand } from './repositoryCommand'

export const PRE_LEDGER_MIGRATION_RAW_KEY = 'ufbk_pre_ft04_raw_v1'

/** Acrescenta a classificação sem normalizar, filtrar ou reordenar os registros antigos. */
export function classifyUntypedLedgerInDocument(document: RepositoryDocument) {
  let changed = 0
  let ambiguous = 0
  const migrate = (raw: unknown, owner: LedgerOwner) => {
    if (!Array.isArray(raw)) return raw
    return raw.map((entry: LedgerEntry) => {
      if (!entry || typeof entry !== 'object' || isLedgerEntryKind(entry.kind) ||
        typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) return entry
      const classification = classifyLegacyLedgerEntry(entry, owner)
      changed += 1
      if (classification.kindSource === 'legacy_ambiguous') ambiguous += 1
      return { ...entry, ...classification }
    })
  }
  const mapOwners = (raw: unknown, owner: LedgerOwner) => Array.isArray(raw)
    ? raw.map((item) => item && typeof item === 'object'
      ? { ...item, transactions: migrate(item.transactions, owner) } : item)
    : raw
  const collections = document.collections
  const fund = collections.emergencyFund
  const nextCollections = {
    ...collections,
    ...(collections.investmentHoldings !== undefined
      ? { investmentHoldings: mapOwners(collections.investmentHoldings, 'holding') } : {}),
    ...(collections.goals !== undefined ? { goals: mapOwners(collections.goals, 'goal') } : {}),
    ...(collections.debts !== undefined ? { debts: mapOwners(collections.debts, 'debt') } : {}),
    ...(fund && typeof fund === 'object' && !Array.isArray(fund)
      ? { emergencyFund: { ...fund, transactions: migrate((fund as { transactions?: unknown }).transactions, 'holding') } }
      : {}),
  }
  return { document: changed ? { ...document, collections: nextCollections } : document, changed, ambiguous }
}

/** Executado antes do primeiro render; falha mantém o documento original intacto. */
export function bootstrapLedgerKinds(storage: Storage = window.localStorage): RepositoryInspection {
  const inspection = bootstrapRepository(storage)
  if (inspection.status === 'blocked') return inspection
  const result = classifyUntypedLedgerInDocument(inspection.document)
  if (result.changed === 0) return inspection
  const original = repositoryRevision(storage)
  const blocked = (message: string): RepositoryInspection => ({
    status: 'blocked', reason: 'corrupt', message,
    rawEntries: original === null ? {} : { [REPOSITORY_STORAGE_KEY]: original },
  })
  if (original === null) return blocked('Não foi possível localizar o documento anterior à migração dos movimentos.')
  try {
    if (storage.getItem(PRE_LEDGER_MIGRATION_RAW_KEY) === null) {
      storage.setItem(PRE_LEDGER_MIGRATION_RAW_KEY, original)
    }
  } catch {
    return blocked('Não foi possível guardar a versão anterior à classificação dos movimentos.')
  }
  const scenarios = inspection.document.collections.scenarios
  const backupSource = Array.isArray(scenarios) && scenarios.length > 0
    ? inspection.document
    : (() => {
      const scenario = createDefaultScenario('Atual')
      return { ...inspection.document, collections: {
        ...inspection.document.collections, scenarios: [scenario], activeScenarioId: scenario.id,
      } }
    })()
  if (!createAutoBackupNow(storage, backupSource)) {
    return blocked('Não foi possível criar uma cópia restaurável antes de classificar movimentos antigos.')
  }
  const applied = runRepositoryCommand({
    id: `ft04-ledger-kind-${crypto.randomUUID()}`,
    expectedRevision: original,
    apply: (current) => classifyUntypedLedgerInDocument(current).document,
  }, storage)
  if (!applied.ok) return blocked(`A classificação dos movimentos não foi gravada: ${applied.message}`)
  return { status: 'ready', source: 'document', document: result.document }
}
