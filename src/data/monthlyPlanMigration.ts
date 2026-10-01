import type { FinanceScenario } from '../types'
import { createAutoBackupNow } from '../lib/backup'
import { normalizeActiveCycle } from '../lib/activeCycle'
import { planFromTemplate } from '../lib/monthlyPlans'
import { createDefaultScenario } from '../lib/scenario'
import { uid } from '../lib/shared'
import { bootstrapLedgerKinds } from './ledgerMigration'
import {
  readRepositoryDocument, REPOSITORY_STORAGE_KEY, type RepositoryInspection,
} from './repository'
import { repositoryRevision, runRepositoryCommand } from './repositoryCommand'

export const PRE_MONTHLY_PLAN_MIGRATION_RAW_KEY = 'ufbk_pre_ft06_raw_v1'

/** Captura o plano operacional atual sem alterar realizados nem modelos existentes. */
export function bootstrapMonthlyPlans(storage: Storage = window.localStorage): RepositoryInspection {
  const earlier = bootstrapLedgerKinds(storage)
  if (earlier.status === 'blocked') return earlier
  const document = readRepositoryDocument(storage)
  if (Array.isArray(document.collections.monthlyPlans) && document.collections.monthlyPlans.length > 0) {
    return { status: 'ready', source: 'document', document }
  }
  const original = repositoryRevision(storage)
  const blocked = (message: string): RepositoryInspection => ({
    status: 'blocked', reason: 'corrupt', message,
    rawEntries: original === null ? {} : { [REPOSITORY_STORAGE_KEY]: original },
  })
  if (original === null) return blocked('Não foi possível localizar o documento anterior ao plano mensal.')
  const scenarios = Array.isArray(document.collections.scenarios) && document.collections.scenarios.length > 0
    ? document.collections.scenarios as FinanceScenario[]
    : [createDefaultScenario('Atual')]
  const activeId = typeof document.collections.activeScenarioId === 'string' &&
    scenarios.some((scenario) => scenario.id === document.collections.activeScenarioId)
    ? document.collections.activeScenarioId : scenarios[0].id
  const source = scenarios.find((scenario) => scenario.id === activeId)!
  const month = normalizeActiveCycle(document.collections.activeCycle as Parameters<typeof normalizeActiveCycle>[0]).month
  const plan = planFromTemplate(month, source)
  const nextCollections = { ...document.collections, scenarios, activeScenarioId: activeId,
    recurringTemplateId: activeId,
    monthlyPlans: [plan] }
  try {
    if (storage.getItem(PRE_MONTHLY_PLAN_MIGRATION_RAW_KEY) === null) {
      storage.setItem(PRE_MONTHLY_PLAN_MIGRATION_RAW_KEY, original)
    }
  } catch {
    return blocked('Não foi possível guardar a versão anterior ao plano mensal.')
  }
  if (!createAutoBackupNow(storage, { ...document, collections: { ...document.collections, scenarios, activeScenarioId: activeId } })) {
    return blocked('Não foi possível criar a cópia prévia do plano mensal.')
  }
  const result = runRepositoryCommand({ id: `ft06-plan-${uid()}`, expectedRevision: original,
    apply: (current) => ({ ...current, collections: nextCollections }),
  }, storage)
  if (!result.ok) return blocked(`O plano mensal não foi criado: ${result.message}`)
  // A primeira cópia conserva o estado anterior; esta já permite restaurar o plano capturado.
  createAutoBackupNow(storage)
  return { status: 'ready', source: 'document', document: readRepositoryDocument(storage) }
}
