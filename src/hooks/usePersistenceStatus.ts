import { useCallback, useEffect, useState } from 'react'
import {
  clearPersistenceError,
  getPersistenceError,
  PERSISTENCE_ERROR_EVENT,
  probeStorage,
  type PersistenceErrorDetail,
} from '../lib/persistence'

export interface PersistenceStatus {
  hasError: boolean
  isConflict: boolean
  message: string
  failedKey?: string
  retry: () => boolean
}

export function usePersistenceStatus(): PersistenceStatus {
  const [error, setError] = useState<PersistenceErrorDetail | null>(() => getPersistenceError())

  useEffect(() => {
    const handleError = (event: Event) => {
      setError((event as CustomEvent<PersistenceErrorDetail>).detail)
    }
    window.addEventListener(PERSISTENCE_ERROR_EVENT, handleError)
    return () => window.removeEventListener(PERSISTENCE_ERROR_EVENT, handleError)
  }, [])

  const retry = useCallback(() => {
    if (getPersistenceError()?.kind === 'conflict') {
      window.location.reload()
      return false
    }
    const writable = probeStorage()
    if (writable) {
      clearPersistenceError()
      setError(null)
    }
    return writable
  }, [])

  return {
    hasError: error !== null,
    isConflict: error?.kind === 'conflict',
    message: error?.message ?? '',
    failedKey: error?.key,
    retry,
  }
}
