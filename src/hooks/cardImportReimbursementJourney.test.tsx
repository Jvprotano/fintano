// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useFinancas } from './useFinancas'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { applyCardImport, reviewCardImport } from '../data/cardImportCommand'
import { recordReimbursement, removeReimbursement } from '../data/cardThirdParties'
import { parseSpreadsheetReport } from '../lib/cardImport'
import { createDefaultScenario } from '../lib/scenario'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import type { CardThirdParty, CreditCardEntry, MonthlySnapshot } from '../types'

it('deriva terceiros da compra e confere importação, recebimento e fatura sem cadastro', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  scenario.salaryNet = 5000; scenario.deductions = []; scenario.costs = []; scenario.wants = []; scenario.plannedInvestmentAmount = 0
  const account = { id: 'a', name: 'A', currentDueMonth: '2026-10', closingDay: 30, dueDay: 5, limit: 0, confirmedEmptyDueMonths: ['2026-11'] }
  const credit: CreditCardEntry = { id: 'credit', accountId: 'a', cardName: 'A', dueMonth: '2026-10', cycle: 'current', description: 'Pontos', purchaseDate: '06/10', amount: 10, personalAmount: 10, remainingAmount: 0, entryType: 'invoiceCredit', creditSource: 'reward' }
  const other: CreditCardEntry = { ...credit, id: 'other', accountId: 'b', cardName: 'B', description: 'Compra B', amount: 20, personalAmount: 20, entryType: undefined }
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-06T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    cardAccounts: [account, { ...account, id: 'b', name: 'B' }], cardEntries: [credit, other],
    actuals: [{ month: '2026-10', costs: {}, wants: {}, extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
  } })
  const app = renderHook(() => useFinancas())
  const report = parseSpreadsheetReport('Descrição\tData\tCartão\tFatura\tÉ meu\nTotal Fitness\t06/10\tA\t300,00\t100,00\nTotal\t\t\t300,00\nErro\t06/10\tA\t10,00\tabc')
  expect(report).toHaveLength(3)
  expect(report.filter((row) => row.entry)).toHaveLength(1)
  expect(report.filter((row) => row.reason)).toHaveLength(2)
  const review = reviewCardImport(report, app.result.current.cards.entries, account, '2026-10', false)
  expect(review.added).toBe(1)
  const oldRevision = repositoryRevision()
  act(() => expect(app.result.current.cards.addEntry({ ...other, description: 'Nova B', id: undefined } as Omit<CreditCardEntry, 'id'>)).toBe(true))
  expect(applyCardImport(review, oldRevision).ok).toBe(false)
  act(() => expect(applyCardImport(reviewCardImport(report, app.result.current.cards.entries, account, '2026-10', false), repositoryRevision()).ok).toBe(true))
  const purchase = app.result.current.cards.entries.find((entry) => entry.description === 'Total Fitness')!
  expect(reviewCardImport(report, app.result.current.cards.entries, account, '2026-10', false)).toMatchObject({ added: 0, unchanged: 1 })
  expect(reviewCardImport([...report, { ...report[0], line: 8 }], app.result.current.cards.entries, account, '2026-10', false).rows.at(-1)).toMatchObject({ duplicate: true })
  const replacement = reviewCardImport(report, app.result.current.cards.entries, account, '2026-10', true)
  expect(replacement.removed.map((row) => row.id)).toEqual(['credit'])
  act(() => expect(applyCardImport(replacement, repositoryRevision()).ok).toBe(true))
  expect(app.result.current.cards.entries.find((row) => row.id === purchase.id)).toBeDefined()
  expect(app.result.current.cards.entries.filter((row) => row.accountId === 'b')).toHaveLength(2)
  const beforeAdvance = app.result.current.cashFlow.leftover
  expect(app.result.current.thirdParties.outstanding).toBe(200)
  expect(app.result.current.cashFlow.thirdPartyAdvanced).toBe(200)
  expect(readRepositoryDocument().collections.cardThirdParties ?? []).toHaveLength(0)
  const recordId = app.result.current.thirdParties.records[0].id
  act(() => expect(recordReimbursement(recordId, 50, '2026-10', '2026-10-06').ok).toBe(true))
  expect(app.result.current.cashFlow.leftover).toBe(beforeAdvance + 50)
  expect(app.result.current.cashFlow).toMatchObject({ thirdPartyAdvanced: 200, reimbursementsReceived: 50, extraIncome: 0 })
  expect(app.result.current.thirdParties.outstanding).toBe(150)
  act(() => expect(app.result.current.cards.removeEntry(purchase.id)).toBe(true))
  expect(app.result.current.thirdParties.outstanding).toBe(150)
  act(() => expect(app.result.current.cards.restoreEntry(purchase)).toBe(true))
  expect(app.result.current.cards.entries.find((row) => row.id === purchase.id)).toBeDefined()
  expect(recordReimbursement(recordId, 151, '2026-10', '2026-10-06').ok).toBe(false)
  const smaller = reviewCardImport(parseSpreadsheetReport('Descrição\tData\tCartão\tFatura\tÉ meu\nTotal Fitness\t06/10\tA\t110,00\t100,00'), app.result.current.cards.entries, account, '2026-10', false)
  expect(applyCardImport(smaller, repositoryRevision()).ok).toBe(false)
  act(() => expect(app.result.current.cards.payInvoice('a').ok).toBe(true))
  expect(app.result.current.thirdParties.outstanding).toBe(150)
  expect(app.result.current.cards.paidInvoices[0].total).toBe(300)
  act(() => expect(app.result.current.closeCurrentMonth('2026-10').ok).toBe(true))
  const snapshot = (readRepositoryDocument().collections.history as MonthlySnapshot[])[0]
  expect(snapshot).toMatchObject({ thirdPartyAdvanced: 200, reimbursementsReceived: 50, extraIncome: 0 })
  const backup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  const restored = backupV9ToRepository(backup)
  expect((restored.collections.cardThirdParties as CardThirdParty[])[0]).toMatchObject({ entryId: purchase.id, amount: 200, payments: [{ amount: 50 }] })
  expect((restored.collections.history as MonthlySnapshot[])[0].balance).toBe(snapshot.balance)
  const invalid = structuredClone(backup)
  invalid.cards.thirdParties![0].payments[0].amountCents = 20100
  expect(inspectBackupPayload(invalid).issues.some((row) => row.code === 'reimbursement_excess')).toBe(true)
  act(() => expect(removeReimbursement(recordId, app.result.current.thirdParties.records[0].payments[0].id).ok).toBe(true))
  expect(app.result.current.thirdParties.outstanding).toBe(200)
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cashLeftover).toBe(snapshot.cashLeftover - 50)
  app.unmount()
})


it('preserva terceiros ao fechar antes de pagar, sem exigir definição nem repetir desembolso', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  scenario.salaryNet = 5000; scenario.deductions = []; scenario.costs = []; scenario.wants = []; scenario.plannedInvestmentAmount = 0
  const entry: CreditCardEntry = { id: 'purchase', accountId: 'a', cardName: 'A', dueMonth: '2026-10', cycle: 'current', description: 'Compra dividida', purchaseDate: '06/10', amount: 300, personalAmount: 100, remainingAmount: 0 }
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-07T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    cardAccounts: [{ id: 'a', name: 'A', currentDueMonth: '2026-10', closingDay: 30, dueDay: 5, limit: 0, confirmedEmptyDueMonths: ['2026-11'] }], cardEntries: [entry],
    actuals: [{ month: '2026-10', costs: {}, wants: {}, extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
  } })
  const app = renderHook(() => useFinancas())
  expect(app.result.current.thirdParties.outstanding).toBe(200)
  act(() => expect(app.result.current.closeCurrentMonth('2026-10').ok).toBe(true))
  const closed = (readRepositoryDocument().collections.history as MonthlySnapshot[])[0]
  expect(closed.thirdPartyAdvanced).toBe(200)
  act(() => expect(app.result.current.cards.payInvoice('a').ok).toBe(true))
  expect(app.result.current.thirdParties.outstanding).toBe(200)
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cashLeftover).toBe(closed.cashLeftover)
  const record = app.result.current.thirdParties.records[0]
  act(() => expect(recordReimbursement(record.id, 200, '2026-11', '2026-11-01').ok).toBe(true))
  expect(app.result.current.thirdParties.outstanding).toBe(0)
  expect(app.result.current.cashFlow).toMatchObject({ reimbursementsReceived: 200, extraIncome: 0 })
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cashLeftover).toBe(closed.cashLeftover)
  app.unmount()
})
