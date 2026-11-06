import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepositoryState } from '../data/repository'
import { DEFAULT_EXCHANGE_SETTINGS, FOREIGN_CURRENCIES, fetchExchangeQuote, normalizeExchangeSettings } from '../lib/exchange'
import type { CurrencyExchangeSettings, ExchangeSettings, ForeignCurrency } from '../types/exchange'
import { runRepositoryCommand } from '../data/repositoryCommand'
import { uid } from '../lib/shared'

const REFRESH_INTERVAL = 6 * 60 * 60 * 1000

export function useExchangeRates() {
  const [stored, setStored] = useRepositoryState<ExchangeSettings>('exchangeSettings', DEFAULT_EXCHANGE_SETTINGS)
  const settings = useMemo(() => normalizeExchangeSettings(stored), [stored])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const attemptedAt = useRef(0)

  const refresh = useCallback(async (force = true) => {
    if (running.current || !force && Date.now() - attemptedAt.current < REFRESH_INTERVAL) return
    running.current = true
    attemptedAt.current = Date.now()
    setRefreshing(true)
    setError('')
    try {
      const results = await Promise.allSettled(FOREIGN_CURRENCIES.map((currency) => fetchExchangeQuote(currency)))
      const successful = results.flatMap((result, index) => result.status === 'fulfilled' ? [{ currency: FOREIGN_CURRENCIES[index], quote: result.value }] : [])
      if (successful.length && !setStored((previous) => {
        const next = normalizeExchangeSettings(previous)
        for (const { currency, quote } of successful) {
          const current = next.currencies[currency].reference
          if (!current || quote.date >= current.date) next.currencies[currency] = { ...next.currencies[currency], reference: quote }
        }
        return next
      })) throw new Error('Não foi possível salvar as cotações. Tente novamente.')
      const failed = results.flatMap((result, index) => result.status === 'rejected' ? [FOREIGN_CURRENCIES[index]] : [])
      if (failed.length) setError(`Não foi possível atualizar ${failed.join(' e ')}. A última cotação foi mantida; você pode informar o custo manual.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar as cotações.')
    } finally {
      running.current = false
      setRefreshing(false)
    }
  }, [setStored])

  useEffect(() => {
    if (!settings.autoUpdate) return
    const check = () => {
      const lastFetched = Math.min(...FOREIGN_CURRENCIES.map((currency) => Date.parse(settings.currencies[currency].reference?.fetchedAt ?? '') || 0))
      if (Date.now() - lastFetched >= REFRESH_INTERVAL) void refresh(false)
    }
    check()
    const timer = window.setInterval(check, REFRESH_INTERVAL)
    window.addEventListener('focus', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [settings, refresh])

  const saveCurrency = useCallback((currency: ForeignCurrency, patch: Pick<CurrencyExchangeSettings, 'manualRate' | 'costsPct'>, expected: CurrencyExchangeSettings) =>
    runRepositoryCommand({ id: uid(), apply: (document) => {
      const next = normalizeExchangeSettings(document.collections.exchangeSettings as ExchangeSettings | undefined)
      const current = next.currencies[currency]
      if (current.manualRate !== expected.manualRate || current.costsPct !== expected.costsPct) throw new Error('Os ajustes desta moeda mudaram. Reabra para conferir.')
      next.currencies[currency] = { ...next.currencies[currency], ...patch, manualUpdatedAt: patch.manualRate ? new Date().toISOString() : undefined }
      return { ...document, collections: { ...document.collections, exchangeSettings: normalizeExchangeSettings(next) } }
    } }).ok, [])
  const setAutoUpdate = useCallback((autoUpdate: boolean) => setStored((previous) => ({ ...normalizeExchangeSettings(previous), autoUpdate })), [setStored])

  return { settings, refreshing, error, refresh, saveCurrency, setAutoUpdate }
}
