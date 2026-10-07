// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useForecast } from '../hooks/useForecast'
import { useActuals } from '../hooks/useActuals'
import { eventTerms, normalizeExpectedEvent, occurrencesInMonth } from '../lib/forecast'
import { buildForecastAgenda, forecastCostsCommitted, requiresExtraCash } from '../lib/forecastCoverage'
import { normalizeActuals, summarizeActuals } from '../lib/actuals'
import { createDefaultScenario } from '../lib/scenario'
import { normalizeCreditCardEntry } from '../lib/creditCards'
import { createPaidInvoiceSnapshot } from '../lib/cardCycleAccounting'
import type { ExpectedEvent, MonthlyActuals } from '../types'
import { readRepositoryDocument, writeRepositoryDocument, type RepositoryDocument } from './repository'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from './backupV7'
import { documentOccurrence, forecastContext, forecastCommand, linkForecastFact, realizeForecastInDocument } from './forecastCommands'

const base = (events: ExpectedEvent[]): RepositoryDocument => {
  const scenario = createDefaultScenario('Atual')
  return { schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
    activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    scenarios: [scenario], activeScenarioId: scenario.id, forecastEvents: events,
  } }
}
const eventIn = (doc: RepositoryDocument, id = 'bonus') => (doc.collections.forecastEvents as ExpectedEvent[]).find((row) => row.id === id)!
const agenda = (doc: RepositoryDocument) => {
  const { actuals, cards, invoices, movements } = forecastContext(doc)
  return buildForecastAgenda(doc.collections.forecastEvents as ExpectedEvent[], actuals, '2026-10', '2026-10-07', cards, invoices, movements)
}

describe('ocorrências e agenda integradas', () => {
  it('preserva recebidos, adia parcial com identidade estável e avança pela mesma realização do Ciclo', () => {
    localStorage.clear()
    const bonus = normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income', amount: 1000,
      month: '2026-09', date: '2026-09-05', recurrence: 'monthly' })
    let doc = base([bonus])
    doc = realizeForecastInDocument(doc, 'bonus', '2026-09', 1000, '2026-09', '2026-09-05')
    doc = realizeForecastInDocument(doc, 'bonus', '2026-10', 400, '2026-10', '2026-10-02')
    doc = realizeForecastInDocument(doc, 'bonus', '2026-12', 1000, '2026-12', '2026-12-03')
    const originalCash = structuredClone(doc.collections.actuals)
    writeRepositoryDocument(doc)
    const hooks = renderHook(() => ({ forecast: useForecast('2026-10'), actuals: useActuals([], [], '2026-10') }))
    expect(agenda(doc)[0].next).toMatchObject({ originalMonth: '2026-10', remainingAmount: 600, overdue: true })
    const terms = { ...eventTerms(bonus), name: 'Bônus revisto', amount: 1200, month: '2026-10', date: '2026-10-05' }
    act(() => expect(hooks.result.current.forecast.updateEvent('bonus', terms, '2026-10', 'following').ok).toBe(true))
    doc = readRepositoryDocument()
    expect(doc.collections.actuals).toEqual(originalCash)
    expect(documentOccurrence(doc, eventIn(doc), '2026-09')).toMatchObject({ amount: 1000, status: 'settled', event: { name: 'Bônus' } })
    expect(documentOccurrence(doc, eventIn(doc), '2026-12')).toMatchObject({ amount: 1000, status: 'settled', event: { name: 'Bônus' } })
    expect(documentOccurrence(doc, eventIn(doc), '2026-11').amount).toBe(1200)
    act(() => expect(hooks.result.current.forecast.updateOccurrence('bonus', '2026-10', { month: '2026-11' }).ok).toBe(true))
    doc = readRepositoryDocument()
    expect(documentOccurrence(doc, eventIn(doc), '2026-10')).toMatchObject({ id: 'bonus@2026-10', month: '2026-11', date: undefined, paidAmount: 400, remainingAmount: 800 })
    act(() => expect(hooks.result.current.forecast.updateOccurrence('bonus', '2026-10', { cancelled: true }).ok).toBe(true))
    expect(readRepositoryDocument().collections.actuals).toEqual(originalCash)
    act(() => expect(hooks.result.current.forecast.updateOccurrence('bonus', '2026-10', { cancelled: false }).ok).toBe(true))
    const before = readRepositoryDocument()
    act(() => expect(hooks.result.current.forecast.realizeOccurrence('bonus', '2026-10', 801, '2026-10', '2026-10-07').ok).toBe(false))
    expect(readRepositoryDocument()).toEqual(before)
    act(() => expect(hooks.result.current.actuals.addExtraIncome('Bônus', 800, 'bonus', '2026-10', 'bonus@2026-10', '2026-10-07')).toBe(true))
    doc = readRepositoryDocument()
    expect(agenda(doc)[0].next?.originalMonth).toBe('2026-11')
    expect((doc.collections.actuals as MonthlyActuals[]).find((row) => row.month === '2026-10')?.extraIncome).toHaveLength(2)
    const exported = repositoryToBackupV9(doc)
    expect(inspectBackupPayload(exported).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(exported)
    expect(eventIn(restored).futureChanges).toEqual(eventIn(doc).futureChanges)
    expect(documentOccurrence(restored, eventIn(restored), '2026-10')).toMatchObject({ status: 'settled', amount: 1200, paidAmount: 1200, month: '2026-11' })
    act(() => expect(hooks.result.current.forecast.updateEvent('bonus', { ...terms, month: '2026-12', date: '2026-12-08' }, '2026-11', 'following').ok).toBe(true))
    doc = readRepositoryDocument()
    expect(occurrencesInMonth([eventIn(doc)], '2027-02').find((item) => item.originalMonth === '2027-01')).toMatchObject({ month: '2027-02', date: '2027-02-08' })
    expect(documentOccurrence(doc, eventIn(doc), '2026-12').status).toBe('settled')
    exported.forecast.events[0].futureChanges!['2026-10'].amountCents = 1.5
    expect(inspectBackupPayload(exported).issues.some((issue) => issue.severity === 'error')).toBe(true)
    hooks.unmount()
  })

  it('concilia plano, movimento e compra existentes sem criar outro dinheiro, e conserva vínculos no backup', () => {
    localStorage.clear()
    const planned = normalizeExpectedEvent({ id: 'cost', name: 'IPVA', kind: 'expense', amount: 100,
      month: '2026-10', cashTreatment: 'planned', planLink: { type: 'cost', id: 'tax' } })
    const move = normalizeExpectedEvent({ id: 'move', name: 'Aporte', kind: 'expense', amount: 200, month: '2026-10' })
    const card = normalizeExpectedEvent({ id: 'card', name: 'Hotel', kind: 'expense', amount: 300,
      month: '2026-10', cashTreatment: 'card', cardDueMonth: '2026-11' })
    const cash = normalizeExpectedEvent({ id: 'cash', name: 'Extra', kind: 'income', amount: 50, month: '2026-10' })
    let doc = base([planned, move, card, cash])
    doc.collections.actuals = [normalizeActuals({ month: '2026-10', costs: { tax: 100 }, extraIncome: [
      { id: 'extra', name: 'Extra recebido', amount: 50, sourceOccurrenceId: 'cash@2026-10', sourceEventId: 'cash' },
    ] })]
    doc.collections.investmentHoldings = [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', marketValue: 200,
      transactions: [{ id: 'tx', amount: 200, kind: 'contribution', kindSource: 'user', cycleMonth: '2026-10', date: '2026-10-07T12:00:00.000Z' }] }]
    doc.collections.cardAccounts = [{ id: 'a', name: 'Principal', currentDueMonth: '2026-11', closingDay: 25, dueDay: 5, limit: 5000 }]
    const charge = normalizeCreditCardEntry({ id: 'charge', accountId: 'a', cardName: 'Principal', dueMonth: '2026-11', cycle: 'current', description: 'Hotel', purchaseDate: '07/10/2026', amount: 300, personalAmount: 300, remainingAmount: 0 })
    doc.collections.cardEntries = [charge]
    doc = linkForecastFact(doc, 'move', '2026-10', { type: 'movement', ownerType: 'holding', ownerId: 'h', id: 'tx' })
    doc = linkForecastFact(doc, 'card', '2026-10', { type: 'card', id: 'charge' })
    doc = linkForecastFact(doc, 'cash', '2026-10', { type: 'cash', month: '2026-10', id: 'extra' })
    expect(documentOccurrence(doc, eventIn(doc, 'cost'), '2026-10')).toMatchObject({ status: 'settled', paidAmount: 100 })
    const costs = [{ id: 'tax', name: 'IPVA', category: 'outros' as const, value: 100, paidWith: 'account' as const }]
    const partial = normalizeActuals({ month: '2026-10', costs: { tax: 60 } })
    const partialAgenda = buildForecastAgenda([planned], [partial], '2026-10', '2026-10-07')
    expect(partialAgenda[0].next?.remainingAmount).toBe(40)
    expect(forecastCostsCommitted(summarizeActuals(costs, partial, '2026-10').rows, partialAgenda[0].items, '2026-10')).toBe(100)
    expect(documentOccurrence(doc, eventIn(doc, 'move'), '2026-10')).toMatchObject({ status: 'settled', paidAmount: 200 })
    expect(documentOccurrence(doc, eventIn(doc, 'cash'), '2026-10').paidAmount).toBe(50)
    expect(documentOccurrence(doc, eventIn(doc, 'card'), '2026-10')).toMatchObject({ status: 'scheduled', remainingAmount: 300, committedAmount: 300, unregisteredAmount: 0 })
    expect(agenda(doc).flatMap((row) => row.items).filter(requiresExtraCash).reduce((sum, item) => sum + item.remainingAmount, 0)).toBe(0)
    writeRepositoryDocument(doc)
    const before = readRepositoryDocument()
    expect(forecastCommand((document) => realizeForecastInDocument(document, 'card', '2026-10', 300, '2026-10', '2026-10-07')).ok).toBe(false)
    expect(readRepositoryDocument()).toEqual(before)
    doc.collections.cardPaidInvoices = [createPaidInvoiceSnapshot({ entries: [charge], currentDueMonth: '2026-11', total: 300, personalTotal: 300, paidAt: '2026-11-05T12:00:00.000Z', accountId: 'a' })]
    doc.collections.cardEntries = []
    expect(documentOccurrence(doc, eventIn(doc, 'card'), '2026-10')).toMatchObject({ status: 'settled', paidAmount: 300 })
    const backup = repositoryToBackupV9(doc)
    expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(backup)
    for (const id of ['cost', 'move', 'card', 'cash']) expect(documentOccurrence(restored, eventIn(restored, id), '2026-10').status).toBe('settled')
    expect(eventIn(restored, 'move').occurrenceOverrides?.['2026-10'].links).toEqual([{ type: 'movement', ownerType: 'holding', ownerId: 'h', id: 'tx' }])
  })
})
