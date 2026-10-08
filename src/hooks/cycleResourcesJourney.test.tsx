// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useFinancas } from './useFinancas'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { calculateScenario, createDefaultScenario } from '../lib/scenario'
import { normalizeHolding } from '../lib/investments'
import { recordMovement } from '../data/financialMovement'
import { backupV9ToRepository, repositoryToBackupV9 } from '../data/backupV7'

it.each(['take_home', 'before_payroll_deductions'] as const)('contrapartida empresarial não financia Desejos no plano, na folha ou na prévia (%s)', (salaryInputMode) => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  Object.assign(scenario, { salaryNet: 8800, salaryInputMode, plannedInvestmentAmount: null, costs: [], wants: [],
    deductions: [{ id: 'pp', name: 'Previdência', type: 'previdencia_privada', value: 540, employerContribution: 540, linkedHoldingId: 'pp' }] })
  const fund = { current: 0, targetMonths: 3, transactions: [] }
  const plan = calculateScenario(scenario, fund)
  const higherCompanyPlan = calculateScenario({ ...scenario, deductions: [{ ...scenario.deductions[0], employerContribution: 5400 }] }, fund)
  expect(higherCompanyPlan.paycheckInAccount).toBe(plan.paycheckInAccount)
  expect(higherCompanyPlan.availableForBudget).toBe(plan.availableForBudget)
  expect(higherCompanyPlan.budgetAllocation).toEqual(plan.budgetAllocation)
  expect(higherCompanyPlan.directInvestmentTarget).toBe(plan.directInvestmentTarget)
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-08T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id,
    activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    investmentHoldings: [normalizeHolding({ id: 'pp', name: 'Previdência', marketValue: 0, transactions: [] })],
    actuals: [],
  } })
  const app = renderHook(() => useFinancas())
  const paycheck = { amount: plan.paycheckInAccount, payrollInvestment: 540, employerInvestment: 0 }
  act(() => expect(app.result.current.actuals.setPaycheck(paycheck)).toBe(true))
  const { cashFlow, financialCycle, nextCycleAllocation } = app.result.current
  act(() => expect(app.result.current.actuals.setPaycheck({ ...paycheck, employerInvestment: 5400 })).toBe(true))
  expect(app.result.current.cashFlow).toEqual(cashFlow)
  expect(app.result.current.financialCycle).toEqual(financialCycle)
  expect(app.result.current.nextCycleAllocation).toEqual(nextCycleAllocation)
  expect(app.result.current.investmentActuals).toMatchObject({ payroll: 540, employer: 5400, directNet: 0, cashContributions: 0, personalTotal: 540, creditedTotal: 5940 })
  expect(app.result.current.investments.holdings[0]).toMatchObject({ marketValue: 5940, pension: { employerBalance: 5400, employerRestrictedBalance: 5400 } })
  app.unmount()
})

it('reaplicação registrada como resgate e aporte equivale à transferência, sem liberar Desejos nem cumprir o aporte líquido', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  Object.assign(scenario, { salaryNet: 5000, deductions: [], costs: [], wants: [], plannedInvestmentAmount: 1234.6 })
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-08T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id,
    activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    investmentHoldings: [normalizeHolding({ id: 'reserve', name: 'Reserva', purpose: 'emergency_fund', marketValue: 2000, transactions: [
      { id: 'contribution', kind: 'contribution', amount: 1000, cycleMonth: '2026-10', date: '2026-09-16T12:00:00Z' },
      { id: 'withdrawal', kind: 'withdrawal', amount: -75.5, cycleMonth: '2026-10', date: '2026-09-25T12:00:00Z' },
    ] }), normalizeHolding({ id: 'revolut', name: 'Revolut', marketValue: 0, transactions: [] })],
    actuals: [{ month: '2026-10', paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 }, costs: {}, wants: {}, extraIncome: [], extraExpenses: [] }],
  } })
  const app = renderHook(() => useFinancas())
  const available = app.result.current.financialCycle.discretionaryAvailable
  const leftover = app.result.current.cashFlow.leftover
  expect(available).toBeCloseTo(3765.4)
  act(() => expect(app.result.current.investments.addHoldingTransaction('reserve', -1000, undefined, '2026-10', '2026-10-05')).toBe(true))
  act(() => expect(app.result.current.investments.addHoldingTransaction('revolut', 1000, undefined, '2026-10', '2026-10-05')).toBe(true))
  expect(app.result.current.cashFlow).toMatchObject({ totalIn: 6075.5, investmentWithdrawals: 1075.5, directInvestment: 2000 })
  expect(app.result.current.investmentActuals.directNet).toBe(924.5)
  expect(app.result.current.financialCycle).toMatchObject({ income: 5000, directInvestment: 924.5, directInvestmentCommitted: 1234.6, withdrawalsForCycle: 0 })
  expect(app.result.current.financialCycle.discretionaryAvailable).toBeCloseTo(available)
  expect(app.result.current.cashFlow.leftover).toBeCloseTo(leftover)
  const backup = repositoryToBackupV9(readRepositoryDocument())
  act(() => { writeRepositoryDocument(backupV9ToRepository(backup)) })
  expect(app.result.current.financialCycle.discretionaryAvailable).toBeCloseTo(available)
  // A transferência explícita usa outro par de posições, sem novos fluxos de caixa.
  act(() => expect(recordMovement({ source: { type: 'holding', id: 'reserve' }, destination: { type: 'holding', id: 'revolut' }, amount: 100, month: '2026-10', occurredOn: '2026-10-08' }).ok).toBe(true))
  expect(app.result.current.financialCycle.discretionaryAvailable).toBeCloseTo(available)
  expect(app.result.current.cashFlow.leftover).toBeCloseTo(leftover)
  app.unmount()
})
