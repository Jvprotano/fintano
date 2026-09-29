import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { ExpectedEvent, ExpectedOccurrenceOverride, ForecastAssumptions, ForecastFund } from '../types'
import {
  DEFAULT_ASSUMPTIONS,
  normalizeAssumptions,
  normalizeExpectedEvent,
  occurrencesInMonth,
} from '../lib/forecast'
import { monthKey, uid } from '../lib/shared'

/** Eventos esperados (13º, bônus, IPVA…) e as premissas da projeção. */
export function useForecast(cycleMonth = monthKey()) {
  const [storedEvents, setEvents] = useRepositoryState<ExpectedEvent[]>('forecastEvents', [])
  const [storedFunds, setFunds] = useRepositoryState<ForecastFund[]>('forecastFunds', [])
  const funds = useMemo(() => (Array.isArray(storedFunds) ? storedFunds : [])
    .filter((fund): fund is ForecastFund => !!fund && typeof fund.id === 'string' && typeof fund.name === 'string')
    .map((fund) => ({
      id: fund.id,
      name: fund.name.trim(),
      reservedAmount: Number.isFinite(fund.reservedAmount) ? Math.max(0, fund.reservedAmount) : 0,
      goalId: fund.goalId || undefined,
    })).filter((fund) => fund.id && fund.name), [storedFunds])
  const events = useMemo(
    () =>
      (Array.isArray(storedEvents) ? storedEvents.map(normalizeExpectedEvent) : []).sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    [storedEvents],
  )

  const [storedAssumptions, setStoredAssumptions] = useRepositoryState<ForecastAssumptions>(
    'forecastAssumptions',
    DEFAULT_ASSUMPTIONS,
  )
  const assumptions = useMemo(
    () => normalizeAssumptions(storedAssumptions),
    [storedAssumptions],
  )

  const addEvent = useCallback(
    (input: Omit<ExpectedEvent, 'id' | 'createdAt'>) => {
      if (!input.name.trim() || input.amount <= 0) return
      setEvents((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeExpectedEvent({ ...input, id: uid(), createdAt: new Date().toISOString() }),
      ])
    },
    [setEvents],
  )

  const updateEvent = useCallback(
    (id: string, patch: Partial<Omit<ExpectedEvent, 'id' | 'createdAt'>>) => {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === id ? normalizeExpectedEvent({ ...event, ...patch }) : event,
        ),
      )
    },
    [setEvents],
  )

  const removeEvent = useCallback(
    (id: string) => setEvents((prev) => prev.filter((event) => event.id !== id)),
    [setEvents],
  )

  const updateOccurrence = useCallback((eventId: string, originalMonth: string, patch: ExpectedOccurrenceOverride) => {
    setEvents((prev) => prev.map((event) => event.id === eventId
      ? normalizeExpectedEvent({ ...event, occurrenceOverrides: {
          ...event.occurrenceOverrides,
          [originalMonth]: { ...event.occurrenceOverrides?.[originalMonth], ...patch },
        } })
      : event))
  }, [setEvents])

  const clearOccurrenceOverride = useCallback((eventId: string, originalMonth: string) => {
    setEvents((prev) => prev.map((event) => {
      if (event.id !== eventId) return event
      const overrides = { ...event.occurrenceOverrides }
      delete overrides[originalMonth]
      return normalizeExpectedEvent({ ...event, occurrenceOverrides: overrides })
    }))
  }, [setEvents])

  const addFund = useCallback((name: string) => {
    const clean = name.trim()
    if (!clean) return
    const id = uid()
    setFunds((prev) => [...prev, { id, name: clean, reservedAmount: 0 }])
    return id
  }, [setFunds])
  const updateFund = useCallback((id: string, patch: Partial<Pick<ForecastFund, 'name' | 'reservedAmount' | 'goalId'>>) => {
    setFunds((prev) => prev.map((fund) => fund.id === id ? {
      ...fund,
      name: patch.name === undefined ? fund.name : patch.name.trim() || fund.name,
      reservedAmount: patch.reservedAmount === undefined ? fund.reservedAmount :
        Number.isFinite(patch.reservedAmount) ? Math.max(0, patch.reservedAmount) : fund.reservedAmount,
      goalId: patch.goalId === undefined ? fund.goalId : patch.goalId || undefined,
    } : fund))
  }, [setFunds])
  const removeFund = useCallback((id: string) => {
    setFunds((prev) => prev.filter((fund) => fund.id !== id))
    setEvents((prev) => prev.map((event) => event.groupId === id ? { ...event, groupId: undefined } : event))
  }, [setEvents, setFunds])

  const updateAssumptions = useCallback(
    (patch: Partial<ForecastAssumptions>) => {
      setStoredAssumptions((prev) => normalizeAssumptions({ ...normalizeAssumptions(prev), ...patch }))
    },
    [setStoredAssumptions],
  )

  const currentMonth = cycleMonth
  const monthOccurrences = useMemo(
    () => occurrencesInMonth(events, currentMonth),
    [events, currentMonth],
  )
  return {
    events,
    funds,
    assumptions,
    currentMonth,
    monthOccurrences,
    addEvent,
    updateEvent,
    removeEvent,
    updateOccurrence,
    clearOccurrenceOverride,
    addFund,
    updateFund,
    removeFund,
    updateAssumptions,
  }
}
