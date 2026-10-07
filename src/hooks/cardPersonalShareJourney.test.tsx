// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useFinancas } from './useFinancas'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { applyCardImport, reviewCardImport } from '../data/cardImportCommand'
import { parseSpreadsheetReport } from '../lib/cardImport'
import { createDefaultScenario } from '../lib/scenario'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import type { CardThirdParty, CreditCardEntry, MonthlySnapshot } from '../types'

function prepare(legacy: CardThirdParty[] = []) {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  Object.assign(scenario, { salaryNet: 5000, deductions: [], costs: [], wants: [], plannedInvestmentAmount: 0 })
  const account = { id: 'a', name: 'A', currentDueMonth: '2026-10', closingDay: 30, dueDay: 5, limit: 0 }
  const entry: CreditCardEntry = { id: 'purchase', accountId: 'a', cardName: 'A', dueMonth: '2026-10', cycle: 'current', description: 'Compra dividida', purchaseDate: '06/10', amount: 300, personalAmount: 100, remainingAmount: 0 }
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-07T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    cardAccounts: [account], cardEntries: [entry, { ...entry, id: 'mother', dueMonth: '2026-11', cycle: 'next', description: 'Compra mãe', amount: 800, personalAmount: 0 }],
    cardThirdParties: legacy,
    actuals: [{ month: '2026-10', costs: {}, wants: {}, extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
  } })
  return { account, app: renderHook(() => useFinancas()) }
}

it('paga o total ao banco e fecha usando apenas a parte pessoal, sem registrar repasses', () => {
  const { app } = prepare()
  expect(app.result.current.cashFlow).toMatchObject({ extraIncome: 0, extraExpense: 0, invoiceToPay: 100, totalIn: 5000, totalOut: 100, leftover: 4900 })
  expect(app.result.current.financialCycle.discretionaryAvailable).toBe(4900)
  expect(app.result.current.nextCycleAllocation).toMatchObject({ invoice: 0, extraIncome: 0, extraExpense: 0, availableToAllocate: 5000 })
  act(() => expect(app.result.current.cards.payInvoice('a').ok).toBe(true))
  expect(app.result.current.cards.paidInvoices[0]).toMatchObject({ total: 300, personalTotal: 100 })
  expect(app.result.current.cashFlow.leftover).toBe(4900)
  act(() => expect(app.result.current.closeCurrentMonth('2026-10', undefined, { payInvoice: true }).ok).toBe(true))
  const snapshot = (readRepositoryDocument().collections.history as MonthlySnapshot[])[0]
  expect(snapshot).toMatchObject({ extraIncome: 0, extraExpense: 0, cardPersonalTotal: 0, cashLeftover: 4900 })
  expect(snapshot.thirdPartyAdvanced ?? 0).toBe(0)
  expect(snapshot.reimbursementsReceived ?? 0).toBe(0)
  expect(app.result.current.cards.paidInvoices.find((row) => row.dueMonth === '2026-11')).toMatchObject({ total: 800, personalTotal: 0 })
  expect(readRepositoryDocument().collections.cardThirdParties).toEqual([])
  const backup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  const restored = backupV9ToRepository(backup)
  expect((restored.collections.history as MonthlySnapshot[])[0].cashLeftover).toBe(4900)
  expect(backup.cards.thirdParties).toEqual([])
  app.unmount()
})

it('importa e revisa minha parte sem cobranças; registros antigos não afetam os recursos e sobrevivem ao backup', () => {
  const legacy: CardThirdParty[] = [{ id: 'old', entryId: 'purchase', accountId: 'a', dueMonth: '2026-10', cashMonth: '2026-10', description: 'Compra dividida', ownerName: 'Mãe', fundedBy: 'user', amount: 200, payments: [{ id: 'payment', amount: 50, cycleMonth: '2026-10', occurredOn: '2026-10-06' }] }]
  const { account, app } = prepare(legacy)
  expect(app.result.current.cashFlow).toMatchObject({ totalIn: 5000, totalOut: 100, leftover: 4900 })
  expect(app.result.current.nextCycleAllocation.availableToAllocate).toBe(5000)
  const report = parseSpreadsheetReport('Descrição\tData\tCartão\tFatura\tÉ meu\nCompra dividida\t06/10\tA\t110,00\t100,00\nTotal\t\t\t110,00')
  const review = reviewCardImport(report, app.result.current.cards.entries, account, '2026-10', false)
  expect(review).toMatchObject({ added: 0, updated: 1 })
  act(() => expect(applyCardImport(review, repositoryRevision()).ok).toBe(true))
  expect(app.result.current.cashFlow.leftover).toBe(4900)
  act(() => expect(app.result.current.cards.updateEntry('purchase', { personalAmount: 110 })).toBe(true))
  expect(app.result.current.cashFlow.leftover).toBe(4890)
  act(() => expect(app.result.current.cards.payInvoice('a').ok).toBe(true))
  expect(app.result.current.cards.paidInvoices[0]).toMatchObject({ total: 110, personalTotal: 110 })
  const backup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  expect(backupV9ToRepository(backup).collections.cardThirdParties).toEqual(legacy)
  app.unmount()
})
