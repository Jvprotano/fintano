// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentHolding } from '../types'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { AUTO_BACKUP_KEY, listAutoBackups } from '../lib/backup'
import { readRepositoryDocument, REPOSITORY_STORAGE_KEY, writeRepositoryDocument } from './repository'
import { repositoryToBackupV8, backupV8ToRepository, backupV7ToRepository, createEmptyBackupV7 } from './backupV7'
import { resolveLegacyLedgerKind } from './ledgerClassification'
import { bootstrapLedgerKinds, PRE_LEDGER_MIGRATION_RAW_KEY } from './ledgerMigration'

describe('migração de tipo do livro-razão', () => {
  beforeEach(() => localStorage.clear())

  it('classifica uma vez, conserva a origem e permite resolver aporte ambíguo sem mudar datas', () => {
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
      investmentHoldings: [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', marketValue: 300,
        transactions: [
          { id: 'ambiguous', amount: 200, date: '2026-08-20T12:00:00.000Z', cycleMonth: '2026-09', note: 'Aporte inicial' },
          { id: 'ordinary', amount: 100, date: '2026-08-21T12:00:00.000Z', cycleMonth: '2026-09', note: 'Extra' },
        ] }],
    } })
    const rawBefore = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    const migration = bootstrapLedgerKinds()
    expect(migration.status === 'ready' ? 'ready' : migration.message).toBe('ready')
    expect(localStorage.getItem(PRE_LEDGER_MIGRATION_RAW_KEY)).toBe(rawBefore)
    expect(listAutoBackups()).toHaveLength(1)
    const current = readRepositoryDocument()
    const holding = (current.collections.investmentHoldings as Array<{ transactions: Array<{
      id: string; kind: string; kindSource: string; date: string; cycleMonth: string; amount: number
    }> }>)[0]
    expect(holding.transactions[0]).toMatchObject({ id: 'ambiguous', amount: 200,
      kind: 'opening_balance', kindSource: 'legacy_ambiguous', cycleMonth: '2026-09',
      date: '2026-08-20T12:00:00.000Z' })
    expect(holding.transactions[1]).toMatchObject({ kind: 'contribution', kindSource: 'legacy_inferred' })
    const revision = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    expect(bootstrapLedgerKinds().status).toBe('ready')
    expect(localStorage.getItem(REPOSITORY_STORAGE_KEY)).toBe(revision)

    expect(resolveLegacyLedgerKind('holding', 'h', 'ambiguous', 'contribution')).toBe(true)
    expect(resolveLegacyLedgerKind('holding', 'h', 'ambiguous', 'opening_balance')).toBe(false)
    const updated = (readRepositoryDocument().collections.investmentHoldings as Array<{ transactions: Array<{
      kind: string; kindSource: string; date: string; cycleMonth: string; amount: number
    }> }>)[0].transactions[0]
    expect(updated).toMatchObject({ amount: 200, kind: 'contribution', kindSource: 'user',
      date: '2026-08-20T12:00:00.000Z', cycleMonth: '2026-09' })
    const backup = repositoryToBackupV8(readRepositoryDocument())
    const entry = backup.investments.ledgerEntries.find((item) => item.id === 'ambiguous')!
    expect(entry).toMatchObject({ kind: 'contribution', kindSource: 'user',
      competenceMonth: '2026-09', occurredAt: '2026-08-20T12:00:00.000Z' })
    const roundTripHolding = (backupV8ToRepository(backup).collections.investmentHoldings as Array<{
      transactions: Array<{ kind: string; date: string; cycleMonth: string }>
    }>)[0]
    expect(roundTripHolding.transactions[0]).toMatchObject({ kind: 'contribution',
      date: '2026-08-20T12:00:00.000Z', cycleMonth: '2026-09' })
    const actual = calculateMonthlyInvestmentActuals({ month: '2026-09',
      emergencyFund: { current: 0, targetMonths: 3, transactions: [] },
      holdings: backupV8ToRepository(backup).collections.investmentHoldings as InvestmentHolding[],
      goals: [] })
    expect(actual.directNet).toBe(300)
  })

  it('lê abertura de backup v7 antigo como ambígua para revisão', () => {
    const backup = createEmptyBackupV7('2026-09-01T12:00:00.000Z')
    backup.investments.holdings.push({ id: 'h', name: 'Tesouro', assetClassId: 'renda-fixa', purpose: 'portfolio' })
    backup.investments.ledgerEntries.push({ id: 'tx', ownerType: 'holding', ownerId: 'h',
      kind: 'opening_balance', amountCents: 10000, competenceMonth: '2026-09',
      occurredAt: '2026-09-01T12:00:00.000Z', note: 'Aporte inicial' })
    const restored = backupV7ToRepository(backup)
    expect((restored.collections.investmentHoldings as InvestmentHolding[])[0].transactions[0])
      .toMatchObject({ kind: 'opening_balance', kindSource: 'legacy_ambiguous', amount: 100 })
  })

  it('não altera o documento quando a cópia prévia não pode ser gravada', () => {
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      investmentHoldings: [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', marketValue: 10,
        transactions: [{ id: 'tx', amount: 10, date: '2026-09-01T12:00:00.000Z' }] }],
    } })
    const original = localStorage.getItem(REPOSITORY_STORAGE_KEY)
    const setItem = Storage.prototype.setItem
    const writing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === AUTO_BACKUP_KEY) throw new Error('quota')
      return setItem.call(this, key, value)
    })
    try {
      const result = bootstrapLedgerKinds()
      expect(result.status).toBe('blocked')
      expect(localStorage.getItem(REPOSITORY_STORAGE_KEY)).toBe(original)
      expect(localStorage.getItem(PRE_LEDGER_MIGRATION_RAW_KEY)).toBe(original)
    } finally {
      writing.mockRestore()
    }
  })

  it('exporta a reserva legada antes de ela virar posição no primeiro render', () => {
    const document = { schemaVersion: 7 as const, updatedAt: '2026-09-01T12:00:00.000Z', collections: {
      emergencyFund: { current: 500, targetMonths: 6, transactions: [
        { id: 'open', amount: 500, date: '2026-09-01T12:00:00.000Z', note: 'Saldo inicial' },
      ] },
    } }
    const backup = repositoryToBackupV8(document)
    expect(backup.investments.holdings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy-reserve', purpose: 'emergency_fund' }),
    ]))
    expect(backup.investments.ledgerEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'open', kind: 'opening_balance', amountCents: 50000 }),
    ]))
    const restored = backupV8ToRepository(backup)
    expect((restored.collections.investmentHoldings as InvestmentHolding[])[0].marketValue).toBe(500)
  })
})
