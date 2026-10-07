// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useFinancas } from './useFinancas'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { recordMovement, moveInDocument, undoMovement } from '../data/financialMovement'
import { createDefaultScenario } from '../lib/scenario'
import { normalizeHolding } from '../lib/investments'
import { normalizeDebt } from '../lib/debts'
import { normalizeSnapshot } from '../lib/history'
import { DEFAULT_INVESTMENT_CLASSES } from '../types/constants'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import type { Debt } from '../types'

it('movimentos vinculados preservam patrimônio, caixa, competência e reversão após restaurar', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  scenario.salaryNet = 5000; scenario.deductions = []; scenario.costs = []; scenario.wants = []
  scenario.plannedInvestmentAmount = 500
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-06T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id,
    activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    investmentClasses: DEFAULT_INVESTMENT_CLASSES,
    investmentHoldings: [normalizeHolding({ id: 'a', name: 'A', assetClassId: DEFAULT_INVESTMENT_CLASSES[0].id, marketValue: 2000, transactions: [] }),
      normalizeHolding({ id: 'b', name: 'B', assetClassId: DEFAULT_INVESTMENT_CLASSES[0].id, purpose: 'emergency_fund', marketValue: 0, transactions: [] })],
    debts: [normalizeDebt({ id: 'debt', name: 'Dívida', balance: 3000, linkedCostId: 'installment', transactions: [] })],
    actuals: [{ month: '2026-10', costs: { installment: 1000 }, wants: {}, extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
  } })
  const app = renderHook(() => useFinancas())
  const date = '2026-10-06'
  act(() => expect(recordMovement({ source: { type: 'holding', id: 'a' }, destination: { type: 'holding', id: 'b' }, amount: 1000, month: '2026-10', occurredOn: date }).ok).toBe(true))
  expect(app.result.current.investmentActuals.directNet).toBe(0)
  expect(app.result.current.investments.summary.financialAssets).toBe(2000)
  expect(app.result.current.cashFlow.investmentWithdrawals).toBe(0)
  const transfer = app.result.current.investments.holdings.find((row) => row.id === 'a')!.transactions[0]
  const linkedBackup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(linkedBackup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  linkedBackup.investments.ledgerEntries = linkedBackup.investments.ledgerEntries.filter((entry) => entry.id !== transfer.id)
  expect(inspectBackupPayload(linkedBackup).issues.some((issue) => issue.code === 'movement_pair_invalid')).toBe(true)
  act(() => expect(app.result.current.investments.setHoldingTransactionCycle('a', transfer.id, '2026-11')).toBe(true))
  expect(app.result.current.investments.holdings.find((row) => row.id === 'b')!.transactions[0].cycleMonth).toBe('2026-11')
  act(() => expect(app.result.current.investments.removeHoldingTransaction('a', transfer.id)).toBe(true))
  expect(app.result.current.investments.holdings.find((row) => row.id === 'b')!.marketValue).toBe(0)
  act(() => expect(app.result.current.investments.addHoldingTransaction('a', 300, undefined, '2026-10', date)).toBe(true))
  act(() => expect(app.result.current.investments.addHoldingTransaction('a', -100, undefined, '2026-10', date)).toBe(true))
  act(() => expect(app.result.current.debts.addDebtTransaction('debt', -1000, undefined, '2026-10', date)).toBe(true))
  expect(app.result.current.investmentActuals.directNet).toBe(200)
  expect(app.result.current.cashFlow).toMatchObject({ extraIncome: 0, investmentWithdrawals: 100, directInvestment: 300, debtExtraPayments: 1000 })
  const before = app.result.current.cashFlow.leftover
  act(() => expect(recordMovement({ source: { type: 'holding', id: 'a' }, destination: { type: 'debt', id: 'debt' }, amount: 500, month: '2026-10', occurredOn: date }).ok).toBe(true))
  expect(app.result.current.cashFlow.leftover).toBe(before)
  expect(app.result.current.debts.debts[0].balance).toBe(1500)
  const backup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  const restored = backupV9ToRepository(backup)
  restored.collections.history = [normalizeSnapshot({ month: '2026-10', cashLeftover: 2000, balance: 2000, extraExpense: 1500, extraExpenseEntries: app.result.current.debts.debts[0].transactions.map((tx) => ({ id: tx.id, name: 'Amortização', amount: -tx.amount })), directInvestedAtClose: -300, invested: -300 })]
  const debt = (restored.collections.debts as Debt[])[0]
  expect(debt.transactions.at(-1)).toMatchObject({ cashTreatment: 'extra', operationId: expect.any(String), cycleMonth: '2026-10' })
  const undone = undoMovement(restored, debt.transactions.at(-1)!.operationId!)
  expect((undone.collections.debts as Debt[])[0].balance).toBe(2000)
  expect((undone.collections.history as ReturnType<typeof normalizeSnapshot>[])[0]).toMatchObject({ cashLeftover: 2000, extraExpense: 1000, directInvestedAtClose: 200 })
  expect(() => moveInDocument(restored, { source: { type: 'holding', id: 'a' }, destination: { type: 'debt', id: 'debt' }, amount: 10000, month: '2026-10', occurredOn: date })).toThrow()
  const installment = moveInDocument(restored, { source: { type: 'account' }, destination: { type: 'debt', id: 'debt' }, amount: 500, month: '2026-10', occurredOn: date, linkedCostId: 'installment' })
  expect((installment.collections.debts as Debt[])[0].transactions.at(-1)?.cashTreatment).toBe('planned_cost')
  app.unmount()
})
