// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { setPaycheckInDocument } from './payrollPension'
import type { RepositoryDocument } from './repository'
import { readRepositoryDocument, writeRepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'
import { repositoryToBackupV9, inspectBackupPayload, backupV9ToRepository } from './backupV7'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { normalizeHolding, usableHoldingValue, type FinancialHolding } from '../lib/investments'
import { createDefaultScenario } from '../lib/scenario'
import type { DeductionItem, MonthlyActuals } from '../types'
import { moveInDocument, undoMovement } from './financialMovement'
import { correctHistoryInDocument, historyCorrectionRows, historyCorrectionMovements } from './historyCorrections'
import { normalizeSnapshot } from '../lib/history'

const month = '2026-10'
const deductions: DeductionItem[] = [{ id: 'p', name: 'Previdência', type: 'previdencia_privada', value: 200, employerContribution: 100, linkedHoldingId: 'pension' }]
const paycheck = { amount: 5000, payrollInvestment: 200, employerInvestment: 100, origin: 'confirmed_from_plan' as const }
function base(balance = 0): RepositoryDocument {
  const scenario = createDefaultScenario('Atual')
  scenario.deductions = deductions
  return { schemaVersion: 7, updatedAt: '2026-10-07T12:00:00.000Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month, salaryHintDay: 30, cardDueHintDay: 5 },
    investmentHoldings: [normalizeHolding({ id: 'pension', name: 'Previdência', assetClassId: 'renda-fixa', marketValue: balance })],
    actuals: [], goals: [], emergencyFund: { current: 0, targetMonths: 6, transactions: [] },
  } }
}
const holding = (doc: RepositoryDocument) => (doc.collections.investmentHoldings as FinancialHolding[])[0]
const actual = (doc: RepositoryDocument) => (doc.collections.actuals as MonthlyActuals[])[0]

describe('folha e previdência: jornada financeira', () => {
  it('registra pessoal e empresa uma vez, corrige e reverte sem consumir caixa novamente', () => {
    const doc = setPaycheckInDocument(base(), month, paycheck, deductions)
    expect(holding(doc).marketValue).toBe(300)
    expect(holding(doc).pension).toEqual({ employerBalance: 100, employerRestrictedBalance: 100 })
    const ids = holding(doc).transactions.map((tx) => tx.id)
    const repeated = setPaycheckInDocument(doc, month, paycheck, [])
    expect(holding(repeated).marketValue).toBe(300)
    expect(holding(repeated).transactions.map((tx) => tx.id)).toEqual(ids)
    expect(calculateMonthlyInvestmentActuals({ month, holdings: [holding(repeated)], goals: [], emergencyFund: { current: 0, targetMonths: 6, transactions: [] } })).toMatchObject({ directNet: 0, cashContributions: 0 })
    const corrected = setPaycheckInDocument(repeated, month, { ...paycheck, payrollInvestment: 250, employerInvestment: 120 }, [])
    expect(holding(corrected).marketValue).toBe(370)
    expect(holding(corrected).pension?.employerBalance).toBe(120)
    expect(actual(corrected).paycheck?.amount).toBe(5000)
    const cleared = setPaycheckInDocument(corrected, month, null, [])
    expect(holding(cleared).marketValue).toBe(0)
    expect(holding(cleared).transactions).toHaveLength(0)
  })

  it('preserva saldo antigo desconhecido e folhas antigas, inclusive após limpar e importar backup', () => {
    const doc = base(10000)
    doc.collections.actuals = [{ month, paycheck, costs: {}, wants: {}, extraIncome: [], extraExpenses: [] }]
    const old = setPaycheckInDocument(doc, month, paycheck, deductions)
    expect(holding(old).marketValue).toBe(10000)
    const cleared = setPaycheckInDocument(old, month, null, deductions)
    const roundtrip = backupV9ToRepository(repositoryToBackupV9(cleared))
    expect(actual(roundtrip).payrollPensionLegacy).toBe(true)
    expect(holding(setPaycheckInDocument(roundtrip, month, paycheck, deductions)).marketValue).toBe(10000)
    const fresh = setPaycheckInDocument(base(10000), month, paycheck, deductions)
    expect(holding(fresh).marketValue).toBe(10300)
    expect(holding(fresh).pension?.employerBalance).toBeUndefined()
    expect(usableHoldingValue(holding(fresh))).toBe(0)
  })

  it('conserva divisão, destinos e origem em centavos no backup; rejeita carência maior que empresa', () => {
    const doc = setPaycheckInDocument(base(), month, { ...paycheck, payrollInvestment: 200.01, employerInvestment: 100.02 }, deductions)
    const backup = repositoryToBackupV9(doc)
    expect(inspectBackupPayload(backup).issues.filter((row) => row.severity === 'error')).toEqual([])
    const roundtrip = backupV9ToRepository(backup)
    expect(holding(roundtrip).pension).toEqual(holding(doc).pension)
    expect(holding(roundtrip).transactions).toEqual(holding(doc).transactions)
    expect(actual(roundtrip).paycheck?.pensionAllocations).toEqual(actual(doc).paycheck?.pensionAllocations)
    expect(holding(setPaycheckInDocument(roundtrip, month, { ...paycheck, payrollInvestment: 200.01, employerInvestment: 100.02 }, [])).marketValue).toBe(300.03)
    backup.investments.holdings[0].pension!.employerRestrictedBalanceCents = 999999
    expect(inspectBackupPayload(backup).issues.some((row) => row.severity === 'error')).toBe(true)
  })

  it('divide várias previdências, mantém os destinos capturados e não perde centavos', () => {
    const doc = base()
    const positions = doc.collections.investmentHoldings as FinancialHolding[]
    positions.push(normalizeHolding({ id: 'p2' }))
    const plan = [...deductions, { ...deductions[0], id: 'p2', linkedHoldingId: 'p2', value: 200, employerContribution: 100 }]
    const result = setPaycheckInDocument(doc, month, { ...paycheck, payrollInvestment: 0.01, employerInvestment: 0.01 }, plan)
    expect((result.collections.investmentHoldings as FinancialHolding[]).reduce((sum, row) => sum + row.marketValue, 0)).toBe(0.02)
    const corrected = setPaycheckInDocument(result, month, paycheck, [])
    expect((corrected.collections.investmentHoldings as FinancialHolding[]).map((row) => row.marketValue)).toEqual([150, 150])
    positions.push(normalizeHolding({ id: 'personal-only' }))
    const personalOnly = setPaycheckInDocument(doc, month, { ...paycheck, employerInvestment: 0.01 }, [...plan,
      { ...deductions[0], id: 'p3', linkedHoldingId: 'personal-only', employerContribution: 0 }])
    expect((personalOnly.collections.investmentHoldings as FinancialHolding[])[2].transactions.some((tx) => tx.contributor === 'employer')).toBe(false)
  })

  it('protege carência, libera por extrato e reverte resgate da parcela adquirida', () => {
    const doc = setPaycheckInDocument(base(), month, paycheck, deductions)
    const input = { source: { type: 'holding' as const, id: 'pension' }, destination: { type: 'account' as const }, amount: 250, month, occurredOn: '2026-10-07' }
    expect(() => moveInDocument(doc, input)).toThrow('carência')
    holding(doc).pension!.employerRestrictedBalance = 40
    expect(usableHoldingValue(holding(doc))).toBe(260)
    const withdrawn = moveInDocument(doc, input, 'withdraw')
    expect(holding(withdrawn).marketValue).toBe(50)
    expect(holding(withdrawn).pension).toEqual({ employerBalance: 50, employerRestrictedBalance: 40 })
    const restored = backupV9ToRepository(repositoryToBackupV9(withdrawn))
    expect(inspectBackupPayload(repositoryToBackupV9(withdrawn)).issues.filter((row) => row.severity === 'error')).toEqual([])
    expect(holding(undoMovement(restored, 'withdraw')).pension).toEqual(holding(doc).pension)
  })

  it('corrige folha histórica junto com a posição e protege o ciclo dos movimentos automáticos', () => {
    const doc = setPaycheckInDocument(base(), month, paycheck, deductions)
    doc.collections.history = [normalizeSnapshot({ id: 'h', month, paycheckInAccount: 5000, payrollInvested: 200, employerInvested: 100, employerInvestmentKnown: true })]
    const rows = historyCorrectionRows(doc, 'h')
    const amounts = Object.fromEntries(rows.map((row) => [row.key, row.amount]))
    amounts.payrollInvested = 250
    amounts.employerInvested = 130
    const result = correctHistoryInDocument(doc, 'h', { amounts, months: {}, note: '', reason: 'Corrigir extrato da folha' })
    expect(holding(result).marketValue).toBe(380)
    expect(historyCorrectionMovements(result, month).every((row) => row.locked)).toBe(true)
  })

  it('sem destino ou com gravação recusada não salva uma folha parcial', () => {
    const doc = base()
    expect(() => setPaycheckInDocument(doc, month, paycheck, [{ ...deductions[0], linkedHoldingId: undefined }])).toThrow('Vincule')
    expect(holding(doc).marketValue).toBe(0)
    localStorage.clear()
    writeRepositoryDocument(doc)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('recusada') })
    const result = runRepositoryCommand({ id: 'payroll', apply: (document) => setPaycheckInDocument(document, month, paycheck, deductions) })
    expect(result.ok).toBe(false)
    spy.mockRestore()
    expect(holding(readRepositoryDocument()).marketValue).toBe(0)
    expect(readRepositoryDocument().collections.actuals).toEqual([])
  })
})
