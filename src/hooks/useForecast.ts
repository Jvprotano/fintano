import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import { addForecast, cancelForecast, editForecastInDocument, editOccurrenceInDocument, forecastCommand, forecastCardInDocument, linkForecastFact, realizeForecastInDocument } from '../data/forecastCommands'
import type { ExpectedEvent, ExpectedOccurrenceOverride, ExpectedEventTerms, ForecastFactLink, ForecastAssumptions } from '../types'
import {
  DEFAULT_ASSUMPTIONS,
  normalizeAssumptions,
  normalizeExpectedEvent,
  occurrencesInMonth,
} from '../lib/forecast'
import { monthKey } from '../lib/shared'

/** Eventos esperados (13º, bônus, IPVA…) e as premissas da projeção. */
export function useForecast(cycleMonth = monthKey()) {
  const [storedEvents] = useRepositoryState<ExpectedEvent[]>('forecastEvents', [])
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

  const addEvent = useCallback((input: Omit<ExpectedEvent, 'id' | 'createdAt'>) => addForecast(input).ok, [])
  const updateEvent = useCallback((id: string, terms: ExpectedEventTerms, originalMonth = cycleMonth, scope: 'this' | 'following' = 'following', revision?: string | null) =>
    forecastCommand((document) => editForecastInDocument(document, id, originalMonth, terms, scope), revision), [cycleMonth])
  const removeEvent = useCallback((id: string) => cancelForecast(id, true).ok, [])
  const restoreEvent = useCallback((id: string) => cancelForecast(id, false).ok, [])
  const updateOccurrence = useCallback((id: string, originalMonth: string, patch: ExpectedOccurrenceOverride) =>
    forecastCommand((document) => editOccurrenceInDocument(document, id, originalMonth, patch)), [])
  const clearOccurrenceOverride = useCallback((id: string, originalMonth: string) =>
    forecastCommand((document) => editOccurrenceInDocument(document, id, originalMonth, { cancelled: false })), [])
  const linkFact = useCallback((id: string, originalMonth: string, link: ForecastFactLink) =>
    forecastCommand((document) => linkForecastFact(document, id, originalMonth, link)), [])
  const unlinkFact = useCallback((id: string, originalMonth: string, index: number) => forecastCommand((document) => {
    const event = (document.collections.forecastEvents as ExpectedEvent[] ?? []).find((row) => row.id === id)
    if (!event) throw new Error('Previsão não encontrada.')
    const links = event.occurrenceOverrides?.[originalMonth]?.links ?? []
    return editOccurrenceInDocument(document, id, originalMonth, { links: links.filter((_, i) => i !== index) })
  }), [])
  const realizeOccurrence = useCallback((id: string, originalMonth: string, amount: number, cycle: string, date: string) =>
    forecastCommand((document) => realizeForecastInDocument(document, id, originalMonth, amount, cycle, date)), [])
  const registerCard = useCallback((id: string, originalMonth: string, input: Parameters<typeof forecastCardInDocument>[3]) =>
    forecastCommand((document) => forecastCardInDocument(document, id, originalMonth, input)), [])

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
    restoreEvent,
    linkFact,
    unlinkFact,
    realizeOccurrence,
    registerCard,
    updateOccurrence,
    clearOccurrenceOverride,
    updateAssumptions,
  }
}
