// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinancas } from './useFinancas'
import { BalanceEvaluation } from '../components/BalanceEvaluation'
import { ContributionDestinations } from '../components/ContributionDestinations'
import { FinancasProvider } from '../context/FinancasContext'
import { createDefaultScenario, calculateScenario } from '../lib/scenario'
import { normalizeHolding, calculateInvestmentsSummary } from '../lib/investments'
import { normalizeGoal } from '../lib/goals'
import { normalizeExpectedEvent, DEFAULT_ASSUMPTIONS, projectNetWorth } from '../lib/forecast'
import { planFromTemplate } from '../lib/monthlyPlans'
import { contributionPlan } from '../lib/contributionPlan'
import { setContributionDestinations } from '../data/contributionCommands'
import { readRepositoryDocument, writeRepositoryDocument, type RepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { backupV9ToRepository, repositoryToBackupV9, inspectBackupPayload } from '../data/backupV7'
import { deleteUnusedCatalog } from '../data/catalogDeletion'
import { averageMonthlyCosts, buildHistoryPoints, normalizeSnapshot } from '../lib/history'
import type { FinanceScenario } from '../types'

function fixture(): RepositoryDocument {
  const scenario = { ...createDefaultScenario(), id: 'plan', salaryNet: 4000, plannedInvestmentAmount: 1000,
    costs: [{ id: 'cost', name: 'Contas', value: 2000, category: 'contas' as const, paidWith: 'account' as const }],
    wants: [{ id: 'want', name: 'Lazer', plannedAmount: 1000, paidWith: 'account' as const }] }
  return { schemaVersion: 7, updatedAt: '2026-10-08T12:00:00Z', collections: {
    activeCycle: { month: '2026-10' }, scenarios: [scenario], activeScenarioId: scenario.id, recurringTemplateId: scenario.id,
    monthlyPlans: [planFromTemplate('2026-10', scenario)],
    investmentHoldings: [normalizeHolding({ id: 'holding', name: 'Carteira', assetClassId: 'renda-fixa', marketValue: 1000, valuationDate: '2026-10-01',
      transactions: [{ id: 'opening', amount: 1000, kind: 'opening_balance', date: '2026-10-01T12:00:00Z' }] })],
    goals: [normalizeGoal({ id: 'one', name: 'Viagem', targetAmount: 1600, targetMonth: '2026-11', kind: 'funding' }),
      normalizeGoal({ id: 'two', name: 'Carro', targetAmount: 1600, targetMonth: '2026-11', kind: 'funding' }),
      normalizeGoal({ id: 'track', name: 'Carteira alvo', targetAmount: 2000, targetMonth: '2026-11', kind: 'tracking', includes: [{ type: 'investments' }] })],
    cardAccounts: [{ id: 'card', name: 'Cartão', currentDueMonth: '2026-11', closingDay: 0, dueDay: 0, confirmedEmptyDueMonths: ['2026-10'] }],
    cardSettings: { currentDueMonth: '2026-11', paymentDate: '05/11', personalSpendingLimit: 0 }, cardEntries: [],
    cardPaidInvoices: [{ id: 'empty', accountId: 'card', dueMonth: '2026-10', total: 0, personalTotal: 0, paidAt: '2026-10-01T12:00:00Z' }],
    forecastAssumptions: { ...DEFAULT_ASSUMPTIONS, annualReturnPct: 0, inflationPct: 12, horizonMonths: 3 },
    actuals: [{ month: '2026-10', paycheck: { amount: 4000, payrollInvestment: 0, employerInvestment: 0 }, costs: { cost: 2000 }, wants: { want: 1000 }, extraIncome: [], extraExpenses: [] }],
  } }
}
function save(document = fixture()) { expect(writeRepositoryDocument(document)).toBe(true); return document }

describe('Ordem 5: saldos, destinos e projeção integrados', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-08T12:00:00Z')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('salva avaliação datada sem criar aporte; cancelar, vazio, conflito e data anterior conservam a origem', () => {
    save()
    const view = render(<BalanceEvaluation id="holding" collection="investmentHoldings" value={1000} date="2026-10-01" />)
    fireEvent.click(screen.getByText('Conferir saldo por avaliação'))
    fireEvent.change(screen.getByLabelText('Saldo avaliado'), { target: { value: '1.200,00' } })
    fireEvent.click(screen.getByText('Cancelar'))
    expect((readRepositoryDocument().collections.investmentHoldings as { marketValue: number }[])[0].marketValue).toBe(1000)
    fireEvent.click(screen.getByText('Conferir saldo por avaliação'))
    fireEvent.change(screen.getByLabelText('Saldo avaliado'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Salvar avaliação'))
    expect(screen.getByRole('alert').textContent).toContain('inclusive zero')
    fireEvent.change(screen.getByLabelText('Saldo avaliado'), { target: { value: '1.200,00' } })
    fireEvent.change(screen.getByLabelText('Data da avaliação'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByText('Salvar avaliação'))
    expect(screen.getByRole('alert').textContent).toContain('movimentos')
    fireEvent.change(screen.getByLabelText('Data da avaliação'), { target: { value: '2026-10-08' } })
    fireEvent.click(screen.getByText('Salvar avaliação'))
    const holding = normalizeHolding((readRepositoryDocument().collections.investmentHoldings as Parameters<typeof normalizeHolding>[0][])[0])
    expect(holding).toMatchObject({ marketValue: 1200, valuationDate: '2026-10-08' })
    expect(holding.transactions).toHaveLength(1)
    expect(calculateInvestmentsSummary([holding], []).allHoldings[0].gain).toBe(200)
    view.unmount()
    render(<BalanceEvaluation id="holding" collection="investmentHoldings" value={1200} date="2026-10-08" />)
    fireEvent.click(screen.getByText('Conferir saldo por avaliação'))
    const revision = repositoryRevision()
    const document = readRepositoryDocument(); document.collections.emergencyFund = { current: 0, targetMonths: 3, transactions: [] }; writeRepositoryDocument(document)
    expect(repositoryRevision()).not.toBe(revision)
    fireEvent.click(screen.getByText('Salvar avaliação'))
    expect(screen.getByRole('alert').textContent).toContain('mudaram')
    expect(screen.getByText('Cancelar')).toBeTruthy()
  })

  it('recusa duas promessas de 800 para capacidade de 1000; preserva referências, centavos e avaliações no backup', () => {
    save()
    const app = renderHook(() => useFinancas())
    const revision = repositoryRevision()
    const bad = [{ type: 'goal' as const, id: 'one', amount: 800 }, { type: 'goal' as const, id: 'two', amount: 800 }]
    act(() => expect(setContributionDestinations(app.result.current.scenarios.currentPlan, bad, revision).ok).toBe(false))
    expect(repositoryRevision()).toBe(revision)
    const rows = [{ type: 'goal' as const, id: 'one', amount: 499.99 }, { type: 'goal' as const, id: 'two', amount: 500.01 }]
    const before = app.result.current.investments.summary.financialAssets
    act(() => expect(setContributionDestinations(app.result.current.scenarios.currentPlan, rows, revision).ok).toBe(true))
    expect(app.result.current.investments.summary.financialAssets).toBe(before)
    expect(app.result.current.projectionData.baseGoals.find((point) => point.month === '2026-11')?.goals.find((goal) => goal.id === 'one')?.current).toBeCloseTo(499.99)
    const document = readRepositoryDocument()
    document.collections.assets = [{ id: 'asset', name: 'Bem', kind: 'veiculo', value: 2500, valuationDate: '2026-10-02', annualAppreciationPct: 0, createdAt: '2026-10-01' }]
    document.collections.debts = [{ id: 'debt', name: 'Quitada', kind: 'emprestimo', balance: 0, valuationDate: '2026-10-03', installment: 0, monthlyRatePct: 0, transactions: [], createdAt: '2026-10-01' }]
    const backup = repositoryToBackupV9(document, '2026-10-09T12:00:00Z')
    expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(backup)
    expect((restored.collections.investmentHoldings as { valuationDate: string }[])[0].valuationDate).toBe('2026-10-01')
    expect((restored.collections.assets as { valuationDate: string }[])[0].valuationDate).toBe('2026-10-02')
    expect((restored.collections.debts as { valuationDate: string }[])[0].valuationDate).toBe('2026-10-03')
    expect(repositoryToBackupV9(restored).planning.monthlyPlans?.[0].data.contributionDestinations).toEqual(backup.planning.monthlyPlans?.[0].data.contributionDestinations)
    expect(deleteUnusedCatalog('goal', 'one')).toBe(false)
    backup.planning.monthlyPlans![0].data.contributionDestinations![0].id = 'missing'
    expect(inspectBackupPayload(backup).issues.some((issue) => issue.code === 'contribution_destination_invalid')).toBe(true)
    app.unmount()
  })

  it('permite revisar destinos pelo formulário, preserva recusa e cancela por Escape sem gravar', () => {
    save()
    render(<FinancasProvider><ContributionDestinations /></FinancasProvider>)
    const revision = repositoryRevision()
    fireEvent.click(screen.getByText('Editar destinos'))
    fireEvent.change(screen.getByLabelText('Novo destino'), { target: { value: 'goal:one' } })
    fireEvent.click(screen.getByText('Adicionar'))
    fireEvent.change(screen.getByLabelText('Aporte para Meta · Viagem'), { target: { value: '800,00' } })
    fireEvent.change(screen.getByLabelText('Novo destino'), { target: { value: 'goal:two' } })
    fireEvent.click(screen.getByText('Adicionar'))
    fireEvent.change(screen.getByLabelText('Aporte para Meta · Carro'), { target: { value: '800,00' } })
    fireEvent.click(screen.getByText('Salvar destinos'))
    expect(screen.getByRole('alert').textContent).toContain('excedem')
    expect(repositoryRevision()).toBe(revision)
    fireEvent.keyDown(screen.getByText('Cancelar'), { key: 'Escape' })
    expect(screen.getByText('Editar destinos')).toBeTruthy()
    expect(repositoryRevision()).toBe(revision)
  })

  it('separa bônus incerto, restante parcial e destinos: dívida reduzida não aumenta indicador de carteira', () => {
    const document = fixture()
    document.collections.forecastEvents = [normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income', month: '2026-11', amount: 1000, savedPct: 50,
      occurrenceOverrides: { '2026-11': { goalAllocations: [{ goalId: 'one', amount: 500 }] } } })]
    document.collections.debts = [{ id: 'loan', name: 'Dívida', kind: 'emprestimo', balance: 1000, installment: 500, monthlyRatePct: 0, transactions: [], createdAt: '2026-10-01' }]
    save(document)
    const app = renderHook(() => useFinancas())
    const base = app.result.current.projection.find((point) => point.month === '2026-11')!
    const conditional = app.result.current.conditionalProjection.find((point) => point.month === '2026-11')!
    expect(conditional.assets - base.assets).toBe(500)
    const goals = app.result.current.projectionData.baseGoals.find((point) => point.month === '2026-11')!.goals
    expect(goals.find((goal) => goal.id === 'track')?.current).toBe(1000)
    expect(app.result.current.projectionData.conditionalGoals.find((point) => point.month === '2026-11')!.goals.find((goal) => goal.id === 'one')?.current).toBe(500)
    act(() => expect(app.result.current.forecast.realizeOccurrence('bonus', '2026-11', 400, '2026-10', '2026-10-08').ok).toBe(true))
    const delta = app.result.current.conditionalProjection[1].assets - app.result.current.projection[1].assets
    expect(delta).toBe(300)
    app.unmount()
  })

  it('consome uma saída ligada ao plano uma vez, inclui pendências iniciais e deduz aportes já feitos', () => {
    const document = fixture()
    document.collections.forecastEvents = [normalizeExpectedEvent({ id: 'bill', name: 'Contas', kind: 'expense', amount: 2000, month: '2026-11', cashTreatment: 'planned', planLink: { type: 'cost', id: 'cost' } }),
      normalizeExpectedEvent({ id: 'extra', name: 'Extra corrente', kind: 'expense', amount: 500, month: '2026-10' })]
    const holding = (document.collections.investmentHoldings as ReturnType<typeof normalizeHolding>[])[0]
    holding.marketValue += 400; holding.transactions.push({ id: 'paid', kind: 'contribution', amount: 400, date: '2026-10-08T12:00:00Z', cycleMonth: '2026-10' })
    save(document)
    const app = renderHook(() => useFinancas())
    expect(app.result.current.projection[0]).toMatchObject({ assets: 1500, contribution: 100, unfunded: 0 })
    expect(app.result.current.projection[1]).toMatchObject({ assets: 2500, contribution: 1000, eventsSaved: 0 })
    expect(app.result.current.investmentActuals.directNet).toBe(400)
    act(() => expect(app.result.current.investments.addHoldingTransaction('holding', 250, 'Competência futura explícita', '2026-11', '2026-10-08')).toBe(true))
    expect(app.result.current.projection[0].assets).toBe(1750)
    expect(app.result.current.projection[1]).toMatchObject({ assets: 2500, contribution: 750 })
    act(() => expect(app.result.current.forecast.addEvent({ name: 'Desejo já no plano', kind: 'expense', amount: 1000, month: '2026-11', recurrence: 'once', cashTreatment: 'planned', planLink: { type: 'want', id: 'want' } })).toBe(true))
    expect(app.result.current.projection[1]).toMatchObject({ assets: 2500, contribution: 750 })
    const scenario = { ...app.result.current.scenarios.activeScenario, contributionDestinations: [{ type: 'goal' as const, id: 'one', amount: 1500 }] }
    expect(contributionPlan(scenario, app.result.current.investments.holdings, app.result.current.investments.goals)).toMatchObject({ excess: 500, destinations: [] })
    app.unmount()
  })

  it('mantém carência fora das saídas e informa insuficiência no primeiro ciclo afetado', () => {
    const points = projectNetWorth({ startMonth: '2026-10', startAssets: 1000, protectedAssets: 800, monthlyContribution: 0,
      annualReturnPct: 0, inflationPct: 0, horizonMonths: 3, events: [], initialExpense: 500, monthlyExpenses: { '2026-11': 100 } })
    expect(points[0]).toMatchObject({ assets: 800, unfunded: 300 })
    expect(points[1]).toMatchObject({ assets: 800, unfunded: 400 })
    const document = fixture(); const pension = (document.collections.investmentHoldings as ReturnType<typeof normalizeHolding>[])[0]
    pension.pension = { employerBalance: 800, employerRestrictedBalance: 800 }
    document.collections.goals = [normalizeGoal({ id: 'one', kind: 'funding', targetAmount: 1000, includes: [{ type: 'holding', id: 'holding', amount: 1000 }] })]
    save(document); const app = renderHook(() => useFinancas())
    expect(app.result.current.investments.goals[0].current).toBe(200)
    app.unmount()
  })

  it('previsão no cartão ocupa o envelope; lançar a compra não repete o excesso da fatura', () => {
    const document = fixture()
    const scenario = (document.collections.scenarios as FinanceScenario[])[0]
    scenario.wants = [{ id: 'card-plan', name: 'Cartão', kind: 'card_envelope', plannedAmount: 1000, paidWith: 'card' }]
    document.collections.monthlyPlans = [planFromTemplate('2026-10', scenario)]
    document.collections.forecastEvents = [normalizeExpectedEvent({ id: 'card-event', name: 'Viagem no cartão', kind: 'expense', month: '2026-11', amount: 400, cashTreatment: 'card', cardDueMonth: '2026-12' })]
    save(document)
    let app = renderHook(() => useFinancas())
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(1000)
    app.unmount()
    ;(document.collections.forecastEvents as ReturnType<typeof normalizeExpectedEvent>[])[0].amount = 1400
    save(document)
    app = renderHook(() => useFinancas())
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(600)
    const before = app.result.current.projection.find((point) => point.month === '2026-12')?.assets
    app.unmount()
    document.collections.cardEntries = [{ id: 'purchase', accountId: 'card', cardName: 'Cartão', cycle: 'next', dueMonth: '2026-12', purchaseDate: '01/11', description: 'Viagem no cartão',
      amount: 1400, personalAmount: 1400, remainingAmount: 0, budgetArea: 'desejos', sourceForecastOccurrenceId: 'card-event@2026-11' }]
    save(document)
    app = renderHook(() => useFinancas())
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(600)
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.assets).toBe(before)
    app.unmount()
  })

  it('a reserva usa custos pessoais classificados e aceita zero conhecido; sem classificação usa o plano', () => {
    const points = buildHistoryPoints(['2026-08', '2026-09'].map((month) => normalizeSnapshot({ month, costs: 2000, cardPersonalTotal: 600, cardByArea: { necessidades: 100, desejos: 500 } })))
    expect(averageMonthlyCosts(points)).toBe(2100)
    points[0].cardByArea = {}
    expect(averageMonthlyCosts(points)).toBeNull()
    const scenario = (fixture().collections.scenarios as FinanceScenario[])[0]
    expect(calculateScenario(scenario, { current: 0, targetMonths: 6, transactions: [] }, undefined, 0)).toMatchObject({ emergencyFundUsesHistory: true, emergencyFundTarget: 0 })
  })

  it('reinveste apenas a parcela antes reservada e não repete a liberação nas sobras', () => {
    const document = fixture()
    document.collections.debts = [{ id: 'loan', name: 'Parcela sem vínculo', kind: 'emprestimo', balance: 500, installment: 500, monthlyRatePct: 0, transactions: [], createdAt: '2026-10-01' }]
    document.collections.forecastAssumptions = { ...DEFAULT_ASSUMPTIONS, annualReturnPct: 0, inflationPct: 0, horizonMonths: 3, reinvestFreedInstallments: true }
    save(document)
    let app = renderHook(() => useFinancas())
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(1000)
    app.unmount()
    ;(document.collections.debts as { linkedCostId?: string }[])[0].linkedCostId = 'cost'
    save(document)
    app = renderHook(() => useFinancas())
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(1500)
    act(() => app.result.current.forecast.updateAssumptions({ includeLeftover: true }))
    expect(app.result.current.projection.find((point) => point.month === '2026-12')?.contribution).toBe(1500)
    app.unmount()
  })
})
