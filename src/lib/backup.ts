import {
  backupV8ToRepository,
  inspectBackupPayload,
  repositoryToBackupV8,
  type LegacyBackupPayloadLike,
} from '../data/backupV7'
import type { BackupInspection, FinTanoBackupV7, FinTanoBackupV8 } from '../data/backupSchemaV7'
import {
  LEGACY_DOMAIN_KEYS,
  REPOSITORY_STORAGE_KEY,
  inspectRepository,
  readRepositoryDocument,
  removeLegacyDomainKeys,
  writeRepositoryDocument,
} from '../data/repository'

export const APP_STORAGE_PREFIX = 'uf_'
export const BACKUP_STORAGE_PREFIX = 'ufbk_'
export const AUTO_BACKUP_KEY = 'ufbk_auto_v2'
const AUTO_BACKUP_INTERVAL_DAYS = 7
const AUTO_BACKUP_KEEP = 3
const RESTORE_PROBE_KEY = 'fintano_restore_probe'
const MAX_BACKUP_BYTES = 4 * 1024 * 1024

export type BackupPayload = FinTanoBackupV8 | FinTanoBackupV7 | LegacyBackupPayloadLike

export interface AutoBackup {
  createdAt: string
  backup: FinTanoBackupV8 | FinTanoBackupV7
}

export interface RestoreResult {
  ok: boolean
  restoredRecords: number
  error?: string
}

function backupRecordCount(inspection: BackupInspection): number {
  const counts = inspection.counts
  return (
    counts.planningTemplates +
    counts.cyclePlans +
    counts.cyclesWithActuals +
    counts.cardCharges +
    counts.holdings +
    counts.valuations +
    counts.ledgerEntries +
    counts.closures
  )
}

function byteSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size
}

export function buildBackupPayload(
  storage: Storage = localStorage,
  exportedAt = new Date().toISOString(),
): FinTanoBackupV8 {
  return repositoryToBackupV8(readRepositoryDocument(storage), exportedAt)
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(buildBackupPayload(), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fintano-backup-v8-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function removeByPrefixes(prefixes: string[], storage: Storage): void {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
}

/** Limpa os dados financeiros, preservando preferências visuais e cópias automáticas. */
export function clearAppStorage(storage: Storage = localStorage): void {
  storage.removeItem(REPOSITORY_STORAGE_KEY)
  removeLegacyDomainKeys(storage)
}

/** Remove dados, preferências locais e cópias automáticas. */
export function clearAllFinTanoStorage(storage: Storage = localStorage): void {
  clearAppStorage(storage)
  removeByPrefixes([APP_STORAGE_PREFIX, BACKUP_STORAGE_PREFIX], storage)
}

export function inspectBackup(payload: unknown): BackupInspection {
  const inspection = inspectBackupPayload(payload)
  if (byteSize(inspection.backup) > MAX_BACKUP_BYTES) {
    throw new Error('Backup excede o limite de 4 MB.')
  }
  return inspection
}

function createAutoBackupNow(storage: Storage): boolean {
  try {
    const current = buildBackupPayload(storage)
    const inspection = inspectBackup(current)
    if (inspection.issues.some((issue) => issue.severity === 'error')) return false
    const backups = listAutoBackups(storage)
    const next = [{ createdAt: new Date().toISOString(), backup: current }, ...backups].slice(
      0,
      AUTO_BACKUP_KEEP,
    )
    storage.setItem(AUTO_BACKUP_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

export function restoreBackup(
  payload: unknown,
  storage: Storage = localStorage,
  options: { recoverInvalidSource?: boolean } = {},
): RestoreResult {
  let inspection: BackupInspection
  try {
    inspection = inspectBackup(payload)
    const errors = inspection.issues.filter((issue) => issue.severity === 'error')
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '))
    const repository = backupV8ToRepository(inspection.backup)
    storage.setItem(RESTORE_PROBE_KEY, JSON.stringify(repository))
    storage.removeItem(RESTORE_PROBE_KEY)
  } catch (error) {
    storage.removeItem(RESTORE_PROBE_KEY)
    return {
      ok: false,
      restoredRecords: 0,
      error: error instanceof Error ? error.message : 'Não foi possível validar o backup.',
    }
  }

  const previousRepository = storage.getItem(REPOSITORY_STORAGE_KEY)
  const previousLegacy: Record<string, string> = {}
  for (const key of Object.values(LEGACY_DOMAIN_KEYS)) {
    const value = storage.getItem(key)
    if (value !== null) previousLegacy[key] = value
  }
  const invalidSource = inspectRepository(storage).status === 'blocked'
  if (invalidSource && !options.recoverInvalidSource) {
    return {
      ok: false,
      restoredRecords: 0,
      error: 'O documento atual está inválido. Guarde a cópia bruta na tela de recuperação antes de restaurar.',
    }
  }
  if (!invalidSource && (previousRepository || Object.keys(previousLegacy).length) && !createAutoBackupNow(storage)) {
    return {
      ok: false,
      restoredRecords: 0,
      error: 'Não foi possível criar a cópia de segurança.',
    }
  }

  try {
    const repository = backupV8ToRepository(inspection.backup)
    if (!writeRepositoryDocument(repository, storage)) {
      throw new Error('O navegador recusou a gravação do documento v7.')
    }
    removeLegacyDomainKeys(storage)
    const restored = readRepositoryDocument(storage)
    if (restored.schemaVersion !== 7) throw new Error('A restauração ficou incompleta.')
    return { ok: true, restoredRecords: backupRecordCount(inspection) }
  } catch (error) {
    try {
      if (storage.getItem(REPOSITORY_STORAGE_KEY) !== previousRepository) {
        if (previousRepository === null) storage.removeItem(REPOSITORY_STORAGE_KEY)
        else storage.setItem(REPOSITORY_STORAGE_KEY, previousRepository)
      }
      for (const [key, value] of Object.entries(previousLegacy)) {
        if (storage.getItem(key) !== value) storage.setItem(key, value)
      }
    } catch {
      return {
        ok: false,
        restoredRecords: 0,
        error: 'A gravação falhou e o navegador recusou a reversão. Guarde os dados brutos antes de tentar novamente.',
      }
    }
    return {
      ok: false,
      restoredRecords: 0,
      error:
        error instanceof Error
          ? `Restauração cancelada: ${error.message}`
          : 'Restauração cancelada sem alterar os dados atuais.',
    }
  }
}

export function listAutoBackups(storage: Storage = localStorage): AutoBackup[] {
  try {
    const raw = storage.getItem(AUTO_BACKUP_KEY)
    const parsed = raw ? (JSON.parse(raw) as AutoBackup[]) : []
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.createdAt === 'string' && item.backup)
      : []
  } catch {
    return []
  }
}

export function maybeCreateAutoBackup(storage: Storage = localStorage): void {
  try {
    if (storage.getItem(REPOSITORY_STORAGE_KEY) === null) return
    const backups = listAutoBackups(storage)
    const latest = backups[0]
    if (latest) {
      const ageDays =
        (Date.now() - new Date(latest.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      let latestValid = false
      try {
        latestValid = !inspectBackup(latest.backup).issues.some((issue) => issue.severity === 'error')
      } catch { /* cópia inválida não impede uma nova cópia */ }
      if (latestValid && ageDays < AUTO_BACKUP_INTERVAL_DAYS) return
    }
    createAutoBackupNow(storage)
  } catch {
    // Backup automático é best-effort; nunca bloqueia o uso do aplicativo.
  }
}

export function restoreAutoBackup(
  createdAt: string,
  storage: Storage = localStorage,
  options: { recoverInvalidSource?: boolean } = {},
): RestoreResult {
  const item = listAutoBackups(storage).find((backup) => backup.createdAt === createdAt)
  if (!item) return { ok: false, restoredRecords: 0, error: 'Cópia não encontrada.' }
  return restoreBackup(item.backup, storage, options)
}
