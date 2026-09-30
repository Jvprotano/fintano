import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { ExpectedEvent, ExpectedOccurrenceOverride, ForecastAssumptions } from '../types'
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
    assumptions,
    currentMonth,
    monthOccurrences,
    addEvent,
    updateEvent,
    removeEvent,
    updateOccurrence,
    clearOccurrenceOverride,
    updateAssumptions,
  }
}
