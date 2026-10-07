// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { normalizeSnapshot, projectHistoryInvestments, buildHistoryPoints } from '../lib/history'
import { normalizeActuals } from '../lib/actuals'
import { createDefaultScenario } from '../lib/scenario'
import { normalizeExpectedEvent } from '../lib/forecast'
import type { MonthlyActuals, MonthlySnapshot } from '../types'
import { correctHistoryInDocument, historyCorrectionMovements, historyCorrectionRows, investmentSourceOf, saveHistoryCorrection, type HistoryDraft } from './historyCorrections'
import { moveInDocument } from './financialMovement'
import { documentOccurrence } from './forecastCommands'
import { readRepositoryDocument, writeRepositoryDocument, type RepositoryDocument } from './repository'
import { repositoryRevision } from './repositoryCommand'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from './backupV7'
import { buildHistoryTrendPoints, historyMissingMonths, selectHistoryPeriod } from '../lib/historyTrends'

function base(): RepositoryDocument {
  const scenario = createDefaultScenario('Atual')
  return { schemaVersion: 7, updatedAt: '2026-10-07T12:00:00.000Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    history: ['2026-08', '2026-09'].map((month) => normalizeSnapshot({ id: month, month, scenarioId: scenario.id,
      availableForBudget: 5200, paycheckInAccount: 5000, payrollInvested: 200, employerInvested: 50,
      invested: 200, investmentProjectionVersion: 1, investmentPlanCaptured: true, investedPlanned: 1000,
      costs: 100, costsPlanned: 100, wants: 0, wantsPlanned: 0, cardPlanned: 0,
      costsByCategory: { outros: 100 }, grossAssets: 3000, physicalAssets: 10000, liabilities: 2000, netWorth: 11000,
      balance: 4900, cashLeftover: 4900,
    })),
    investmentHoldings: [{ id: 'h', name: 'CDB', purpose: 'portfolio', assetClassId: 'renda-fixa', marketValue: 1000, transactions: [] }],
    emergencyFund: { current: 0, targetMonths: 6, transactions: [] }, goals: [],
  } }
}
const snapshots = (doc: RepositoryDocument) => doc.collections.history as MonthlySnapshot[]
function draft(doc: RepositoryDocument, id = '2026-09'): HistoryDraft {
  return { amounts: Object.fromEntries(historyCorrectionRows(doc, id).map((row) => [row.key, row.amount])), months: {}, note: '', reason: 'Conferência no extrato' }
}

describe('correção histórica com origem e gravação única', () => {
  it('corrige extra e custo na origem, reconcilia agenda/caixa e conserva detalhes, marca e backup', () => {
    let doc = base()
    const event = normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income', amount: 1000, month: '2026-09' })
    doc.collections.forecastEvents = [event]
    doc.collections.actuals = [normalizeActuals({ month: '2026-09', paycheck: { amount: 5000, payrollInvestment: 200, employerInvestment: 50 }, costs: { fee: 100 }, extraIncome: [
      { id: 'extra', name: 'Bônus', amount: 1000, sourceEventId: 'bonus', sourceOccurrenceId: 'bonus@2026-09', occurredAt: '2026-09-20' },
    ] })]
    const point = snapshots(doc)[1]
    Object.assign(point, { extraIncome: 1000, extraIncomeEntries: (doc.collections.actuals as MonthlyActuals[])[0].extraIncome, balance: 5900, cashLeftover: 5900 })
    const form = draft(doc)
    form.amounts['extraIncome:extra'] = 600.25
    form.amounts['costs:fee'] = 125.50
    form.amounts.paycheckInAccount = 5100
    doc = correctHistoryInDocument(doc, point.id, form)
    expect((doc.collections.actuals as MonthlyActuals[])[0]).toMatchObject({ paycheck: { amount: 5100 }, costs: { fee: 125.50 }, extraIncome: [{ id: 'extra', amount: 600.25, occurredAt: '2026-09-20', sourceOccurrenceId: 'bonus@2026-09' }] })
    expect(snapshots(doc)[1]).toMatchObject({ extraIncome: 600.25, costs: 125.50, availableForBudget: 5300, balance: 5574.75, cashLeftover: 5574.75, grossAssets: 3000, netWorth: 11000 })
    expect(documentOccurrence(doc, event, '2026-09')).toMatchObject({ paidAmount: 600.25, remainingAmount: 399.75, status: 'partial' })
    const backup = repositoryToBackupV9(doc)
    expect(inspectBackupPayload(backup).issues.filter((row) => row.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(backup)
    expect(snapshots(restored)[1].corrections).toEqual(snapshots(doc)[1].corrections)
    expect(documentOccurrence(restored, event, '2026-09').paidAmount).toBe(600.25)
    expect(snapshots(restored)[1].extraIncomeEntries).toEqual(snapshots(doc)[1].extraIncomeEntries)
    backup.history.closures[1].corrections![0].reason = ''
    expect(inspectBackupPayload(backup).issues.some((row) => row.code === 'history_corrections_invalid')).toBe(true)
  })

  it('move aporte e amortização vinculados juntos sem mudar data ou patrimônio e audita ambos os ciclos', () => {
    let doc = moveInDocument(base(), { source: { type: 'account' }, destination: { type: 'holding', id: 'h' }, amount: 1000, month: '2026-09', occurredOn: '2026-08-31' }, 'op')
    const oldMark = snapshots(doc).map((row) => row.netWorth)
    const beforeHolding = structuredClone(doc.collections.investmentHoldings)
    const movement = historyCorrectionMovements(doc, '2026-09')[0]
    const form = draft(doc)
    form.months[movement.key] = '2026-08'
    doc = correctHistoryInDocument(doc, '2026-09', form)
    const points = projectHistoryInvestments(snapshots(doc), investmentSourceOf(doc))
    expect(points.map((row) => row.directInvestedAtClose)).toEqual([1000, 0])
    expect(points.map((row) => row.invested)).toEqual([1200, 200])
    expect(points.map((row) => row.cashLeftover)).toEqual([3900, 4900])
    expect(points.map((row) => row.balance)).toEqual([3900, 4900])
    expect(snapshots(doc).map((row) => row.netWorth)).toEqual(oldMark)
    const holding = doc.collections.investmentHoldings as { marketValue: number; transactions: { date: string; cycleMonth: string }[] }[]
    expect(holding[0].transactions[0].date).toBe((beforeHolding as typeof holding)[0].transactions[0].date)
    expect(holding[0].marketValue).toBe(2000)
    expect(snapshots(doc).every((row) => row.corrections?.[0].revisedMonths.join(',') === '2026-08,2026-09')).toBe(true)
    const restored = backupV9ToRepository(repositoryToBackupV9(doc))
    expect(projectHistoryInvestments(snapshots(restored), investmentSourceOf(restored)).map((row) => row.directInvestedAtClose)).toEqual([1000, 0])

    let debtDoc = base()
    debtDoc.collections.debts = [{ id: 'd', name: 'Dívida', balance: 2000, transactions: [] }]
    debtDoc = moveInDocument(debtDoc, { source: { type: 'holding', id: 'h' }, destination: { type: 'debt', id: 'd' }, amount: 500, month: '2026-09', occurredOn: '2026-09-01' }, 'debt-op')
    const debtForm = draft(debtDoc), debtMove = historyCorrectionMovements(debtDoc, '2026-09')[0]
    debtForm.months[debtMove.key] = '2026-08'
    debtDoc = correctHistoryInDocument(debtDoc, '2026-09', debtForm)
    expect(snapshots(debtDoc).map((row) => row.cashLeftover)).toEqual([4900, 4900])
    expect(snapshots(debtDoc).map((row) => row.extraExpense)).toEqual([500, 0])
    expect(snapshots(debtDoc).map((row) => row.directInvestedAtClose)).toEqual([-500, 0])
  })

  it('corrige agregado de Desejos sem apagar o total na normalização ou inventar movimento', () => {
    const doc = base(), form = draft(doc)
    form.amounts.wants = 123.45
    const next = correctHistoryInDocument(doc, '2026-09', form)
    expect(normalizeSnapshot(snapshots(next)[1]).wants).toBe(123.45)
    expect(next.collections.actuals).toBeUndefined()
    expect(normalizeSnapshot(snapshots(backupV9ToRepository(repositoryToBackupV9(next)))[1]).wants).toBe(123.45)
    expect(snapshots(next)[1].corrections?.[0].changes[0].source).toContain('agregado')
  })

  it('preserva contrapartida desconhecida no backup e permite confirmar zero explicitamente', () => {
    const doc = base()
    snapshots(doc)[1].employerInvestmentKnown = false
    const backup = repositoryToBackupV9(doc)
    expect(backup.history.closures[1].investments.employerCents).toBeNull()
    expect(snapshots(backupV9ToRepository(backup))[1].employerInvestmentKnown).toBe(false)
    const form = draft(doc)
    form.amounts.employerInvested = 0
    const next = correctHistoryInDocument(doc, '2026-09', form)
    expect(snapshots(next)[1]).toMatchObject({ employerInvestmentKnown: true, employerInvested: 0 })
    expect(snapshots(next)[1].corrections?.[0].changes[0].before).toBe('Não informada')
  })

  it('recusa vazio, conflito e falha de gravação sem salvar partes', () => {
    localStorage.clear()
    const doc = base()
    writeRepositoryDocument(doc)
    const revision = repositoryRevision(), form = draft(doc)
    form.amounts.wants = null
    expect(saveHistoryCorrection('2026-09', form, revision).ok).toBe(false)
    expect(repositoryRevision()).toBe(revision)
    form.amounts.wants = 100
    writeRepositoryDocument({ ...doc, updatedAt: '2026-10-07T13:00:00.000Z' })
    expect(saveHistoryCorrection('2026-09', form, revision)).toMatchObject({ ok: false, reason: 'conflict' })
    expect(readRepositoryDocument().collections.history).toEqual(doc.collections.history)
    const freshRevision = repositoryRevision()
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    try {
      expect(saveHistoryCorrection('2026-09', form, freshRevision)).toMatchObject({ ok: false, reason: 'write_failed' })
      expect(repositoryRevision()).toBe(freshRevision)
    } finally { failure.mockRestore() }
  })

  it('usa calendário comum e interrompe gráfico/acumulado em meses ausentes', () => {
    const points = buildHistoryPoints(['2026-01', '2026-07'].map((month) => normalizeSnapshot({ month, invested: 100, employerInvested: 50 })))
    expect(selectHistoryPeriod(points, 6).map((row) => row.month)).toEqual(['2026-07'])
    expect(historyMissingMonths(points, 6)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    const graph = buildHistoryTrendPoints(points, 6)
    expect(graph.map((row) => row.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])
    expect(graph[0].invested).toBeNull()
    expect(graph.at(-1)?.cumulativeCredited).toBeNull()
  })
})
