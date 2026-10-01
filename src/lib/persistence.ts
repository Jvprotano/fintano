export const PERSISTENCE_ERROR_EVENT = 'fintano:persistence-error'

export interface PersistenceErrorDetail {
  key: string
  message: string
  kind?: 'storage' | 'conflict'
}

let currentError: PersistenceErrorDetail | null = null

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'O armazenamento deste navegador está cheio.'
  }
  return 'O navegador recusou a gravação dos dados.'
}

export function reportPersistenceError(key: string, error: unknown): void {
  if (typeof window === 'undefined') return
  if (currentError?.kind === 'conflict') return
  currentError = { key, message: errorMessage(error), kind: 'storage' }
  window.dispatchEvent(
    new CustomEvent<PersistenceErrorDetail>(PERSISTENCE_ERROR_EVENT, {
      detail: currentError,
    }),
  )
}

export function reportPersistenceConflict(key: string): void {
  if (typeof window === 'undefined') return
  currentError = {
    key,
    kind: 'conflict',
    message: 'Os dados mudaram em outra aba. Recarregue esta aba para revisar a versão atual antes de editar.',
  }
  window.dispatchEvent(
    new CustomEvent<PersistenceErrorDetail>(PERSISTENCE_ERROR_EVENT, {
      detail: currentError,
    }),
  )
}

export function getPersistenceError(): PersistenceErrorDetail | null {
  return currentError
}

export function clearPersistenceError(): void {
  currentError = null
}

export function writeStorageValue(
  key: string,
  value: string,
  storage: Storage = window.localStorage,
): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    reportPersistenceError(key, error)
    return false
  }
}

/** Testa se o navegador voltou a aceitar escrita sem alterar dados do app. */
export function probeStorage(storage: Storage = window.localStorage): boolean {
  const key = 'fintano_storage_probe'
  try {
    storage.setItem(key, 'ok')
    storage.removeItem(key)
    return true
  } catch (error) {
    reportPersistenceError(key, error)
    return false
  }
}
