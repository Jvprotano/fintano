import { describe, expect, it } from 'vitest'
import { backupV8ToRepository, createEmptyBackupV7, createEmptyBackupV8, inspectBackupPayload, repositoryToBackupV8 } from './backupV7'

describe('eventos futuros no backup v8', () => {
  it('preserva datas, exceções, grupo e pagamentos parciais na ida e volta', () => {
    const backup = createEmptyBackupV8('2026-09-29T00:00:00.000Z')
    backup.forecast.funds.push({ id: 'trip', name: 'Viagem', reservedAmountCents: 75000 })
    backup.forecast.events.push({ id: 'hotel', name: 'Hotel', kind: 'expense', amountCents: 180000,
      month: '2027-01', date: '2027-01-05', recurrence: 'once', groupId: 'trip',
      cashTreatment: 'extra', occurrenceOverrides: { '2027-01': { date: '2027-01-10', amountCents: 175000 } },
      createdAt: '2026-09-29T00:00:00.000Z' })
    backup.actuals.cycles.push({ month: '2027-01', costPayments: [], wantPayments: [], cashMovements: [
      { id: 'part', kind: 'expense', name: 'Hotel', amountCents: 50000,
        sourceForecastEventId: 'hotel', sourceOccurrenceId: 'hotel@2027-01', occurredAt: '2027-01-10' },
    ] })
    backup.cards.currentDueMonth = '2027-02'
    backup.cards.charges.push({ id: 'charge', accountId: 'card', description: 'Hotel', purchaseDate: '05/01/2027',
      spendingMonth: '2027-01', dueMonth: '2027-02', amountCents: 175000,
      personalAmountCents: 175000, remainingAmountCents: 0,
      sourceForecastOccurrenceId: 'hotel@2027-01' })
    backup.cards.accounts.push({ id: 'card', name: 'Principal', closingDay: 25, dueDay: 5, limitCents: 500000 })
    backup.cards.statements.push({ id: 'statement-2027-02', accountId: null, dueMonth: '2027-02',
      totalCents: 175000, personalTotalCents: 175000, paidAt: '2027-02-05T12:00:00.000Z',
      forecastOccurrences: [{ id: 'hotel@2027-01', amountCents: 175000 }], spending: [] })
    const exported = repositoryToBackupV8(backupV8ToRepository(backup), backup.exportedAt)
    expect(exported.forecast.funds).toEqual(backup.forecast.funds)
    expect(exported.forecast.events[0].occurrenceOverrides?.['2027-01'].amountCents).toBe(175000)
    expect(exported.actuals.cycles[0].cashMovements[0].sourceOccurrenceId).toBe('hotel@2027-01')
    expect(exported.actuals.cycles[0].cashMovements[0].occurredAt).toBe('2027-01-10')
    expect(exported.cards.charges[0].sourceForecastOccurrenceId).toBe('hotel@2027-01')
    expect(exported.cards.statements[0].forecastOccurrences).toEqual([{ id: 'hotel@2027-01', amountCents: 175000 }])
  })

  it('migra backup v7 sem inventar dia, pagamento ou grupo', () => {
    const old = createEmptyBackupV7('2026-09-29T00:00:00.000Z')
    old.forecast.events.push({ id: 'hotel', name: 'Hotel', kind: 'expense', amountCents: 200000,
      month: '2027-01', recurrence: 'once', createdAt: old.exportedAt })
    const inspection = inspectBackupPayload(old)
    expect(inspection.migratedFromVersion).toBe(7)
    expect(inspection.backup.forecast.funds).toEqual([])
    expect(inspection.backup.forecast.events[0]).toMatchObject({ id: 'hotel', month: '2027-01' })
    expect(inspection.backup.forecast.events[0].date).toBeUndefined()
    expect(inspection.backup.actuals.cycles).toEqual([])
  })
})
