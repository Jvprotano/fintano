import { useCallback, useEffect, useMemo } from 'react'
import { useActiveCycle } from './useActiveCycle'
import { useScenarios } from './useScenarios'
import { useCreditCards } from './useCreditCards'
import { useAssets } from './useAssets'
import { useDebts } from './useDebts'
import { useInvestments } from './useInvestments'
import { useHistory } from './useHistory'
import { useForecast } from './useForecast'
import { useActuals } from './useActuals'
import { summarizeActuals } from '../lib/actuals'
import { advanceDebtMonth } from '../lib/debts'
import { calculateScenario } from '../lib/scenario'
import { planAsScenario, planFromTemplate } from '../lib/monthlyPlans'
import { buildCurrentCycleFacts } from '../lib/currentCycleFacts'
import { calculateAllocationPreview, calculateFinancialCycle } from '../lib/financialCycle'
import { calculateCardCycleAccounting, cardAdvancePaymentsForMonth } from '../lib/cardCycleAccounting'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { calculateAssetsSummary } from '../lib/assets'
import { occurrencesInMonth, projectNetWorth } from '../lib/forecast'
import { reconcileOccurrence, upcomingOccurrences, buildForecastAgenda, forecastCostsCommitted, forecastWantsCommitted, requiresExtraCash, cardDueMonthForOccurrence } from '../lib/forecastCoverage'
import { maybeCreateAutoBackup } from '../lib/backup'
import { REPOSITORY_CHANGED_EVENT } from '../data/repository'
import { addMonths, ledgerEntryCycleMonth, localDateKey, uid } from '../lib/shared'
import { runRepositoryCommand, type CommandResult } from '../data/repositoryCommand'
import { closeCycleInDocument } from '../data/closingCommand'
import type { BudgetArea, CostCategory, MonthlySnapshot, ScenarioSummary } from '../types'
import { contributionPlan } from '../lib/contributionPlan'
import { projectGoalSources, type SourceContribution } from '../lib/goalProjection'
import { usableHoldingValue } from '../lib/investments'
import { BUDGET_AREAS, INVESTMENT_DEDUCTION_TYPES } from '../types/constants'

export type { ScenarioMetrics } from '../lib/scenario'

/**
 * Compõe os domínios e calcula o que depende de mais de um deles: o orçamento
 * do cenário ativo já enxergando o realizado do cartão, o caixa do mês, a
 * projeção de patrimônio líquido e o fechamento de mês.
 */
export function useFinancas() {
  const activeCycle = useActiveCycle()
  const scenarios = useScenarios(activeCycle.month)
  const cards = useCreditCards(activeCycle.month, activeCycle.cycle.cardDueHintDay)
  const assetsState = useAssets()
  const debts = useDebts(scenarios.activeScenarioAll.costs, assetsState.assets, activeCycle.month)

  const assetsSummary = useMemo(
    () => calculateAssetsSummary(assetsState.assets, debts.summary.debts),
    [assetsState.assets, debts.summary.debts],
  )
  const assets = useMemo(
    () => ({ ...assetsState, summary: assetsSummary }),
    [assetsState, assetsSummary],
  )

  const pensionHoldingIds = useMemo(() => [...new Set([
    ...scenarios.scenarios.flatMap((row) => row.deductions),
    ...scenarios.monthlyPlans.flatMap((row) => row.deductions),
    ...scenarios.activeScenario.deductions,
  ].filter((row) => row.type === 'previdencia_privada' && row.linkedHoldingId).map((row) => row.linkedHoldingId!))],
  [scenarios.scenarios, scenarios.monthlyPlans, scenarios.activeScenario.deductions])
  const investments = useInvestments(debts.summary.totalBalance, {
    securedLiabilities: debts.summary.securedBalance,
    physicalAssets: assets.summary.totalValue,
  }, activeCycle.month, pensionHoldingIds)
  const historyInvestmentSource = useMemo(
    () => ({
      emergencyFund: investments.emergencyFund,
      holdings: investments.holdings,
      goals: investments.goals,
    }),
    [investments.emergencyFund, investments.goals, investments.holdings],
  )
  const history = useHistory(activeCycle.month, historyInvestmentSource)
  const forecast = useForecast(activeCycle.month)
  const knownCosts = useMemo(() => [
    ...scenarios.scenarios.flatMap((scenario) => scenario.costs),
    ...scenarios.monthlyPlans.flatMap((plan) => plan.costs),
    ...scenarios.activeScenarioAll.costs,
  ], [scenarios.scenarios, scenarios.monthlyPlans, scenarios.activeScenarioAll.costs])
  const knownWants = useMemo(() => [
    ...scenarios.scenarios.flatMap((scenario) => scenario.wants),
    ...scenarios.monthlyPlans.flatMap((plan) => plan.wants),
    ...scenarios.activeScenarioAll.wants,
  ], [scenarios.scenarios, scenarios.monthlyPlans, scenarios.activeScenarioAll.wants])
  const actuals = useActuals(
    scenarios.activeScenario.costs,
    scenarios.activeScenario.wants,
    activeCycle.month,
    knownCosts,
    knownWants,
    scenarios.activeScenario.deductions,
  )

  const movementSources = useMemo(() => [
    ...investments.holdings.map((row) => ({ ownerType: 'holding' as const, ownerId: row.id, entries: row.transactions })),
    ...investments.goals.map((row) => ({ ownerType: 'goal' as const, ownerId: row.id, entries: row.transactions })),
    ...debts.debts.map((row) => ({ ownerType: 'debt' as const, ownerId: row.id, entries: row.transactions })),
  ], [investments.holdings, investments.goals, debts.debts])
  const forecastAgenda = useMemo(() => buildForecastAgenda(forecast.events, actuals.months, activeCycle.month, localDateKey(), cards.entries, cards.paidInvoices, movementSources),
    [forecast.events, actuals.months, activeCycle.month, cards.entries, cards.paidInvoices, movementSources])

  useEffect(() => {
    const checkBackup = () => maybeCreateAutoBackup()
    checkBackup()
    window.addEventListener(REPOSITORY_CHANGED_EVENT, checkBackup)
    return () => window.removeEventListener(REPOSITORY_CHANGED_EVENT, checkBackup)
  }, [])

  const { emergencyFund } = investments
  const { activeScenario } = scenarios
  const planComparison = useMemo(() => {
    const reference = scenarios.currentPlan.fixedReference
    const scenario = reference?.scenario ?? activeScenario
    const comparison = calculateScenario(scenario, emergencyFund)
    return {
      fixedAt: reference?.fixedAt,
      costs: comparison.costsOnAccount,
      wants: comparison.wantsOnAccount,
      card: comparison.plannedOnCard,
      invested: comparison.totalPlannedInvestment,
      paycheck: comparison.paycheckInAccount,
      wantItems: scenario.wants.filter((want) => !want.archivedAt && want.paidWith === 'account'),
    }
  }, [scenarios.currentPlan.fixedReference, activeScenario, emergencyFund])

  /**
   * O cartão mantém o calendário de vencimento separado do ciclo financeiro.
   * A fatura que vence no mês seguinte é o bucket usado para encerrar o ciclo
   * atual; o snapshot do pagamento preserva total e parte pessoal após o giro.
   */
  const cardCycleAccounting = useMemo(
    () =>
      calculateCardCycleAccounting({
        entries: cards.entries,
        accounts: cards.accounts,
        currentDueMonth: cards.settings.currentDueMonth ?? activeCycle.month,
        activeCycleMonth: activeCycle.month,
        currentTotal: cards.summary.currentTotal,
        currentPersonalTotal: cards.summary.currentPersonalTotal,
        nextTotal: cards.summary.nextTotal,
        nextPersonalTotal: cards.summary.nextPersonalTotal,
        paidInvoices: cards.paidInvoices,
      }),
    [
      activeCycle.month,
      cards.entries,
      cards.accounts,
      cards.paidInvoices,
      cards.settings.currentDueMonth,
      cards.summary.currentPersonalTotal,
      cards.summary.currentTotal,
      cards.summary.nextPersonalTotal,
      cards.summary.nextTotal,
    ],
  )
  const realizedByArea = cardCycleAccounting.spendingThisCycle.personalByArea

  const metrics = useMemo(
    () => calculateScenario(activeScenario, emergencyFund, realizedByArea, history.averageCosts),
    [activeScenario, emergencyFund, realizedByArea, history.averageCosts],
  )

  /**
   * Fechamento de investimentos é realizado, não plano. A previdência descontada
   * em folha é investimento efetivo quando a folha roda; o restante vem dos
   * livros-razão de reserva, posições e metas. Marcação a mercado não entra.
   */
  const investmentActuals = useMemo(() => {
    const ledger = calculateMonthlyInvestmentActuals({
      month: activeCycle.month,
      emergencyFund,
      holdings: investments.holdings,
      goals: investments.goals,
    })
    const payroll = actuals.summary.paycheck?.payrollInvestment ?? 0
    const employer = actuals.summary.paycheck?.employerInvestment ?? 0
    const personalTotal = payroll + ledger.directNet
    const creditedTotal = personalTotal + employer
    const realizedIncomeBase = (actuals.summary.paycheck?.amount ?? 0) + payroll + actuals.summary.extraIncomeTotal
    const savingsRate = realizedIncomeBase > 0 ? (personalTotal / realizedIncomeBase) * 100 : 0

    return {
      ...ledger,
      payroll,
      employer,
      personalTotal,
      creditedTotal,
      // Alias compatível: `total` continua sendo o esforço pessoal, sem bônus.
      total: personalTotal,
      savingsRate,
    }
  }, [
    activeCycle.month,
    emergencyFund,
    investments.goals,
    investments.holdings,
    actuals.summary.paycheck,
    actuals.summary.extraIncomeTotal,
  ])

  const scenarioSummaries = useMemo<ScenarioSummary[]>(
    () =>
      scenarios.scenarios.map((scenario) => {
        const summary = calculateScenario(scenario, emergencyFund)
        return {
          id: scenario.id,
          name: scenario.name,
          availableForBudget: summary.availableForBudget,
          totalCosts: summary.totalCosts,
          totalWantsAmount: summary.totalWantsAmount,
          totalPlannedInvestment: summary.totalPlannedInvestment,
          balanceAfterPlan: summary.balanceAfterPlan,
          savingsRate: summary.savingsRate,
        }
      }),
    [scenarios.scenarios, emergencyFund],
  )

  /**
   * Consulta canônica do ciclo: plano e realizado continuam lado a lado, mas o
   * caixa usa somente fatos efetivos. Previdência em folha não sai da conta de
   * novo; só o aporte direto do livro-razão entra como saída bancária.
   */
  const debtPayments = useMemo(() => debts.debts.flatMap((debt) => debt.transactions
    .filter((tx) => tx.kind === 'amortization' && tx.cashTreatment === 'extra' && ledgerEntryCycleMonth(tx) === activeCycle.month)
    .map((tx) => ({ id: tx.id, name: `Amortização · ${debt.name}`, amount: -tx.amount }))), [debts.debts, activeCycle.month])
  const debtExtraPayments = debtPayments.reduce((sum, tx) => sum + tx.amount, 0)
  const currentCycleFacts = useMemo(() => {
    const invoiceToPay = cardCycleAccounting.invoiceThisCycle.personalTotal
    const cardAdvancePaid = cardAdvancePaymentsForMonth(cards.entries, cards.paidInvoices, activeCycle.month)
    const costsOnAccount = actuals.summary.rows
      .filter((row) => row.cost.paidWith !== 'card')
      .reduce((sum, row) => sum + (row.actual ?? 0), 0)
    const costsOnAccountPlanned = actuals.summary.rows
      .filter((row) => row.cost.paidWith !== 'card')
      .reduce((sum, row) => sum + row.planned, 0)

    return buildCurrentCycleFacts({
      month: activeCycle.month,
      paycheck: actuals.summary.paycheck?.amount ?? 0,
      extraIncome: actuals.summary.extraIncomeTotal,
      extraExpense: actuals.summary.extraExpenseTotal,
      cardAdvancePaid,
      debtExtraPayments,
      investmentWithdrawals: investmentActuals.cashWithdrawals,
      cashInvestmentContributions: investmentActuals.cashContributions,
      costsOnAccountActual: costsOnAccount,
      costsPlanned: costsOnAccountPlanned,
      wantsOnAccountActual: actuals.summary.confirmedWants,
      wantsPlanned: actuals.summary.plannedWants,
      costsOnCardPlanned: metrics.costsOnCard,
      wantsOnCardPlanned: metrics.wantsOnCard,
      directInvestmentActual: investmentActuals.directNet,
      directInvestmentPlanned: metrics.directInvestmentTarget,
      payrollInvestment: investmentActuals.payroll,
      employerInvestment: investmentActuals.employer,
      totalInvestmentPlanned: metrics.totalPlannedInvestment,
      invoiceToPay,
    })
  }, [
    activeCycle.month,
    metrics,
    actuals.summary,
    cardCycleAccounting.invoiceThisCycle.personalTotal,
    cards.entries,
    cards.paidInvoices,
    investmentActuals,
    debtExtraPayments,
  ])
  const cashFlow = currentCycleFacts.cash

  const financialCycle = useMemo(
    () => {
      const pendingExtraExpense = forecastAgenda.flatMap((row) => row.items)
        .filter((item) => item.event.kind === 'expense' && requiresExtraCash(item) && item.month <= activeCycle.month && item.status !== 'cancelled')
        .reduce((sum, item) => sum + item.remainingAmount, 0)
      return calculateFinancialCycle({
        cashMonth: activeCycle.month,
        income: cashFlow.totalIn,
        invoiceToPay: cashFlow.invoiceToPay,
        costsOnAccount: cashFlow.costsOnAccount,
        costsCommitted: forecastCostsCommitted(actuals.summary.rows, forecastAgenda.flatMap((row) => row.items), activeCycle.month),
        wantsOnAccount: cashFlow.wantsOnAccount,
        directInvestment: cashFlow.directInvestment,
        directInvestmentCommitted: Math.max(metrics.directInvestmentTarget, cashFlow.directInvestment),
        extraExpense: cashFlow.extraExpense + cashFlow.cardAdvancePaid + cashFlow.debtExtraPayments,
        extraExpenseCommitted: cashFlow.extraExpense + cashFlow.cardAdvancePaid + cashFlow.debtExtraPayments + pendingExtraExpense,
        // A reserva do próximo caixa usa a parte pessoal da fatura que encerra
        // o ciclo ativo.
        nextInvoicePersonal: cardCycleAccounting.invoiceFormedByCycle.personalTotal,
        plannedNextInvoice: cashFlow.plannedOnCard,
      })
    },
    [activeCycle.month, cardCycleAccounting.invoiceFormedByCycle.personalTotal, cashFlow,
      actuals.summary.rows, metrics.directInvestmentTarget,
      forecastAgenda],
  )

  /**
   * O "Liberado para alocar" pertence ao próximo ciclo. Ex.: ao fechar Agosto,
   * usa o salário que financiará Setembro e abate a fatura de Setembro formada
   * por Agosto. O snapshot mantém esse mesmo valor mesmo se a fatura já tiver
   * sido paga antes do fechamento.
   */
  const nextCycleAllocation = useMemo(() => {
    const month = addMonths(activeCycle.month, 1)
    const nextPlan = scenarios.monthlyPlans.find((plan) => plan.month === month) ??
      planFromTemplate(month, scenarios.scenarios.find((item) => item.id === scenarios.recurringTemplateId) ??
        scenarios.scenarios[0] ?? scenarios.activeScenarioAll)
    const nextMetrics = calculateScenario(planAsScenario(nextPlan), emergencyFund)
    const occurrences = occurrencesInMonth(forecast.events, month)
    const extraIncome = occurrences
      .filter((item) => item.event.kind === 'income' && item.event.confirmed)
      .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months, new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices, movementSources).remainingAmount, 0)
    const extraExpense = occurrences
      .filter((item) => item.event.kind === 'expense' && requiresExtraCash(item))
      .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months, new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices, movementSources).remainingAmount, 0)

    return calculateAllocationPreview({
      month,
      paycheck: nextMetrics.paycheckInAccount,
      invoice: cardCycleAccounting.invoiceFormedByCycle.personalTotal,
      costsOnAccount: nextMetrics.costsOnAccount,
      baseInvestment: nextMetrics.directInvestmentTarget,
      // Neste contexto, Desejos fora do cartão são os envelopes que sairão da
      // conta (Viagens, Qualidade de vida etc.). A parte pessoal do cartão já
      // foi abatida pela fatura acima; a outra parte é coberta pelo repasse.
      plannedWants: nextMetrics.wantsOnAccount,
      extraIncome,
      extraExpense,
    })
  }, [
    activeCycle.month,
    scenarios.monthlyPlans,
    scenarios.scenarios,
    scenarios.recurringTemplateId,
    scenarios.activeScenarioAll,
    emergencyFund,
    cardCycleAccounting.invoiceFormedByCycle.personalTotal,
    forecast.events,
    actuals.months,
    cards.entries,
    cards.paidInvoices,
    movementSources,
  ])

  const monthlyContribution = useMemo(() => {
    const plan = contributionPlan(activeScenario, investments.holdings, investments.goals, debts.debts)
    const desired = forecast.assumptions.monthlyContribution ?? (plan.capacity + plan.payroll + (forecast.assumptions.includeLeftover ? Math.max(0, plan.affordable - plan.capacity) : 0))
    return Math.max(plan.payroll, Math.min(desired, plan.affordable + plan.payroll))
  }, [activeScenario, investments.holdings, investments.goals, debts.debts, forecast.assumptions])

  const projectedDebts = useMemo(
    () =>
      debts.summary.debts
        .filter((debt) => !debt.isSettled)
        .map((debt) => ({
          id: debt.id,
          balance: debt.balance,
          monthlyRatePct: debt.monthlyRatePct,
          installment: debt.installment,
          secured: debt.isSecured,
        })),
    [debts.summary.debts],
  )

  const projectedProperties = useMemo(
    () =>
      assets.summary.assets
        .filter((asset) => asset.value > 0)
        .map((asset) => ({
          id: asset.id,
          value: asset.value,
          annualAppreciationPct: asset.annualAppreciationPct,
        })),
    [assets.summary.assets],
  )

  const projectionData = useMemo(() => {
    const items = upcomingOccurrences(forecast.events, actuals.months, activeCycle.month,
      forecast.assumptions.horizonMonths + 1, localDateKey(), cards.entries, cards.paidInvoices, movementSources)
    const initialItems = forecastAgenda.flatMap((row) => row.items).filter((item) => item.month <= activeCycle.month && item.status !== 'cancelled')
    const projectionItems = [...new Map([...initialItems, ...items].map((item) => [item.id, item])).values()]
    const remainingByOccurrence = Object.fromEntries(items.map((item) => [item.id, item.event.kind === 'expense' ? 0 : item.remainingAmount]))
    const monthlyContributions: Record<string, number> = {}
    const monthlyExpenses: Record<string, number> = {}
    const monthlyProtectedContributions: Record<string, number> = {}
    const freedContributionByMonth: Record<string, number> = {}
    const sources: Record<string, SourceContribution[]> = {}
    const template = scenarios.scenarios.find((row) => row.id === scenarios.recurringTemplateId) ?? activeScenario
    let initialContribution = 0
    let initialExpense = 0
    let initialProtectedContribution = 0
    const invalidPlanMonths: string[] = []
    let invoiceEstimated = false
    const loanBalances = projectedDebts.map((debt) => ({ ...debt }))
    for (let index = 0; index <= forecast.assumptions.horizonMonths; index++) {
      const month = addMonths(activeCycle.month, index)
      const scenario = index === 0 ? activeScenario : planAsScenario(scenarios.monthlyPlans.find((plan) => plan.month === month) ?? planFromTemplate(month, template))
      const calculation = calculateScenario(scenario, emergencyFund)
      const ledger = index === 0 ? investmentActuals : calculateMonthlyInvestmentActuals({ month, emergencyFund, holdings: investments.holdings, goals: investments.goals })
      const cycleActual = actuals.months.find((cycle) => cycle.month === month)
      const paycheckKnown = cycleActual?.paycheck !== undefined
      const monthSummary = index === 0 ? actuals.summary : summarizeActuals(scenario.costs.filter((cost) => !cost.archivedAt), cycleActual, month,
        scenario.wants.filter((want) => !want.archivedAt), [...scenario.costs, ...scenarios.scenarios.flatMap((plan) => plan.costs), ...scenarios.monthlyPlans.flatMap((plan) => plan.costs)],
        [...scenario.wants, ...scenarios.scenarios.flatMap((plan) => plan.wants), ...scenarios.monthlyPlans.flatMap((plan) => plan.wants)])
      const plan = contributionPlan(scenario, investments.holdings, investments.goals, debts.debts.map((debt) => ({ ...debt, balance: loanBalances.find((loan) => loan.id === debt.id)?.balance ?? debt.balance })))
      if (plan.excess > 0.005 || plan.unavailable.length) invalidPlanMonths.push(month)
      const relevant = index === 0 ? initialItems : items.filter((item) => item.month === month)
      const cardItems = projectionItems.filter((item) => item.event.kind === 'expense' && item.event.cashTreatment === 'card' && !item.event.planLink && (cardDueMonthForOccurrence(item) ?? addMonths(item.month, 1)) === month)
      const invoiceFacts = calculateCardCycleAccounting({ entries: cards.entries, accounts: cards.accounts,
        currentDueMonth: cards.settings.currentDueMonth ?? activeCycle.month, activeCycleMonth: month,
        currentTotal: cards.summary.currentTotal, currentPersonalTotal: cards.summary.currentPersonalTotal,
        nextTotal: cards.summary.nextTotal, nextPersonalTotal: cards.summary.nextPersonalTotal,
        paidInvoices: cards.paidInvoices }).invoiceThisCycle
      const expectedInvoice = invoiceFacts.personalTotal + cardItems.reduce((sum, item) => sum + item.unregisteredAmount, 0)
      const invoice = invoiceFacts.amountKnown ? expectedInvoice : Math.max(expectedInvoice, calculation.plannedOnCard)
      if (!invoiceFacts.amountKnown && index <= 1) invoiceEstimated = true
      let uncoveredLoanPayment = 0
      let freedBudget = 0
      if (index > 0) for (const loan of loanBalances) {
        const next = advanceDebtMonth(loan.balance, loan.monthlyRatePct, loan.installment)
        const linkedId = debts.debts.find((debt) => debt.id === loan.id)?.linkedCostId
        const cost = scenario.costs.find((cost) => cost.id === linkedId && !cost.archivedAt)
        const covered = cost?.value ?? 0
        if (loan.balance <= 0 && cost) freedBudget += Math.min(loan.installment, Math.max(0, cost.value - (cost.sharedAmount ?? 0)))
        uncoveredLoanPayment += Math.max(0, next.paid - covered)
        loan.balance = next.balance
      }
      // A parte ja lancada aparece na fatura conhecida: a previsao adiciona apenas o nao lancado.
      const extra = relevant.filter((item) => item.event.kind === 'expense' && requiresExtraCash(item)).reduce((sum, item) => sum + item.remainingAmount, 0)
      const costs = Math.max(calculation.costsOnAccount, forecastCostsCommitted(monthSummary.rows, relevant, month))
      const wants = Math.max(calculation.wantsOnAccount, forecastWantsCommitted(monthSummary.wantRows, relevant, month))
      let available: number
      if (index === 0) {
        const income = cashFlow.totalIn + (actuals.summary.paycheck ? 0 : calculation.paycheckInAccount)
        available = income - invoice - costs - wants
          - cashFlow.extraExpense - cashFlow.cardAdvancePaid - cashFlow.debtExtraPayments - investmentActuals.cashContributions - extra - plan.uncoveredInstallments
      } else {
        const debtExtraPaid = debts.debts.flatMap((debt) => debt.transactions).filter((tx) => tx.kind === 'amortization' && tx.cashTreatment === 'extra' && ledgerEntryCycleMonth(tx) === month).reduce((sum, tx) => sum - tx.amount, 0)
        available = (cycleActual?.paycheck?.amount ?? calculation.paycheckInAccount) + monthSummary.extraIncomeTotal
          - costs - wants - Math.max(calculation.plannedOnCard, expectedInvoice) - monthSummary.extraExpenseTotal - debtExtraPaid
          - extra - uncoveredLoanPayment + freedBudget - ledger.cashContributions + ledger.cashWithdrawals
      }
      const payroll = paycheckKnown ? 0 : calculation.investmentDeductions
      const company = paycheckKnown ? 0 : calculation.employerInvestmentContributions
      const unknownPayroll = payroll === 0 ? 0 : scenario.deductions.reduce((sum, deduction) => {
        if (!INVESTMENT_DEDUCTION_TYPES.includes(deduction.type)) return sum
        const holding = investments.holdings.find((row) => row.id === deduction.linkedHoldingId)
        const unknown = !holding || holding.pension && (holding.pension.employerBalance === undefined || holding.pension.employerRestrictedBalance === undefined)
        return sum + (unknown ? deduction.value : 0)
      }, 0)
      const target = Math.max(0, calculation.directInvestmentTarget - Math.max(0, ledger.directNet))
      const desired = forecast.assumptions.monthlyContribution !== null ? Math.max(0, forecast.assumptions.monthlyContribution - calculation.investmentDeductions - Math.max(0, ledger.directNet)) : target + (forecast.assumptions.includeLeftover ? Math.max(0, available - target) : 0)
      const direct = Math.min(Math.max(0, available), index === 0 ? Math.min(target, desired) : desired)
      const contributions = direct + payroll + company
      const monthSources: SourceContribution[] = []
      const pendingDestinations = plan.destinations.map((row) => {
        const owner = row.type === 'holding' ? investments.holdings.find((holding) => holding.id === row.id) : investments.goals.find((goal) => goal.id === row.id)
        const done = owner?.transactions.filter((tx) => ledgerEntryCycleMonth(tx) === month && tx.kind === 'contribution' && !tx.payrollMonth).reduce((sum, tx) => sum + tx.amount, 0) ?? 0
        return { ...row, amount: Math.max(0, row.amount - done) }
      })
      const requested = pendingDestinations.reduce((sum, row) => sum + row.amount, 0)
      const factor = requested > 0 ? Math.min(1, direct / requested) : 0
      for (const row of pendingDestinations) monthSources.push({ ...row, amount: row.amount * factor })
      for (const deduction of scenario.deductions.filter((row) => INVESTMENT_DEDUCTION_TYPES.includes(row.type))) {
        if (!deduction.linkedHoldingId || paycheckKnown) continue
        monthSources.push({ type: 'holding', id: deduction.linkedHoldingId, amount: deduction.value + (deduction.employerContribution ?? 0), protectedAmount: deduction.employerContribution ?? 0 })
      }
      sources[month] = monthSources
      if (index === 0) {
        initialContribution = contributions; initialExpense = Math.max(0, -available); initialProtectedContribution = company + unknownPayroll
      } else {
        monthlyContributions[month] = contributions
        monthlyExpenses[month] = Math.max(0, -available)
        monthlyProtectedContributions[month] = company + unknownPayroll
        freedContributionByMonth[month] = forecast.assumptions.reinvestFreedInstallments && !forecast.assumptions.includeLeftover && forecast.assumptions.monthlyContribution === null
          ? Math.min(freedBudget, Math.max(0, available - direct)) : 0
      }
    }
    const initialExpectedIncome = initialItems.filter((item) => item.event.kind === 'income' && requiresExtraCash(item)).reduce((sum, item) => sum + item.remainingAmount * (item.event.savedPct ?? 100) / 100, 0)
    const input = {
      startMonth: activeCycle.month, startAssets: investments.summary.financialAssets,
      monthlyContribution, monthlyContributions, monthlyExpenses, initialContribution, initialExpense, initialExpectedIncome,
      protectedAssets: investments.holdings.reduce((sum, holding) => sum + holding.marketValue - usableHoldingValue(holding), 0),
      monthlyProtectedContributions, initialProtectedContribution, freedContributionByMonth,
      annualReturnPct: forecast.assumptions.annualReturnPct, inflationPct: forecast.assumptions.inflationPct,
      horizonMonths: forecast.assumptions.horizonMonths, events: forecast.events, remainingByOccurrence,
      debts: projectedDebts, properties: projectedProperties, reinvestFreedInstallments: forecast.assumptions.reinvestFreedInstallments && !forecast.assumptions.includeLeftover && forecast.assumptions.monthlyContribution === null,
    }
    const base = projectNetWorth({ ...input, includeExpectedIncome: false })
    const conditional = projectNetWorth({ ...input, includeExpectedIncome: true })
    const goalInput = { holdings: investments.holdings, goals: investments.goals, contributions: sources, items: [...initialItems, ...items.filter((item) => item.month > activeCycle.month)], annualReturnPct: input.annualReturnPct, startAssets: input.startAssets, protectedContributions: { ...monthlyProtectedContributions, [activeCycle.month]: initialProtectedContribution } }
    return { base, conditional, baseGoals: projectGoalSources({ ...goalInput, points: base, conditional: false }),
      conditionalGoals: projectGoalSources({ ...goalInput, points: conditional, conditional: true }), invalidPlanMonths, invoiceEstimated,
      initialContribution, initialExpense }
  }, [activeScenario, activeCycle.month, scenarios.scenarios, scenarios.recurringTemplateId, scenarios.monthlyPlans,
    investments.holdings, investments.goals, investments.summary.financialAssets, emergencyFund, forecast.events, forecast.assumptions,
    debts.debts, cards.accounts, cards.settings.currentDueMonth, cards.summary,
    forecastAgenda, actuals.months, actuals.summary, cards.entries, cards.paidInvoices, movementSources,
    cashFlow, investmentActuals, monthlyContribution, projectedDebts, projectedProperties])
  const projection = projectionData.base
  const conditionalProjection = projectionData.conditional

  /**
   * Congela o ciclo ativo com os números de agora e avança para o próximo.
   * Custos, cartão e investimentos entram pelo realizado; o plano continua
   * existindo separadamente para comparação.
   */
  const closeCurrentMonth = useCallback(
    (month = activeCycle.month, note?: string, options?: { payInvoice?: boolean; expectedRevision?: string | null; operationId?: string }): CommandResult => {

      const costsByCategory: Partial<Record<CostCategory, number>> = {}
      actuals.summary.byCategory.forEach((value, category) => {
        costsByCategory[category] = value
      })

      const cardByArea: Partial<Record<BudgetArea, number>> = {}
      for (const area of BUDGET_AREAS) {
        cardByArea[area] = cardCycleAccounting.spendingThisCycle.personalByArea[area]
      }

      const costs = actuals.summary.effectiveCosts
      const balance =
        (actuals.summary.paycheck?.amount ?? 0) +
        actuals.summary.extraIncomeTotal -
        actuals.summary.extraExpenseTotal - debtExtraPayments -
        costs -
        actuals.summary.effectiveWants -
        investmentActuals.directNet

      const snapshot: Omit<MonthlySnapshot, 'id' | 'closedAt'> = {
        month,
        scenarioId: activeScenario.id,
        scenarioName: activeScenario.name,
        availableForBudget: (actuals.summary.paycheck?.amount ?? 0) + investmentActuals.payroll,
        paycheckInAccount: actuals.summary.paycheck?.amount ?? 0,
        extraIncome: actuals.summary.extraIncomeTotal,
        extraIncomeEntries: actuals.summary.extraIncome,
        extraExpense: actuals.summary.extraExpenseTotal + debtExtraPayments,
        extraExpenseEntries: [...actuals.summary.extraExpenses, ...debtPayments],
        costs,
        costsPlanned: planComparison.costs,
        wants: actuals.summary.effectiveWants,
        wantsPlanned: planComparison.wants,
        wantAllocations: [...actuals.summary.wantRows.map((row) => ({
          id: row.want.id,
          name: row.want.name,
          planned: planComparison.fixedAt
            ? planComparison.wantItems.find((want) => want.id === row.want.id)?.plannedAmount ?? 0
            : row.planned,
          actual: row.effective,
          paidWith: row.want.paidWith,
          includedInCardPlan: false,
        })), ...planComparison.wantItems.filter((want) =>
          !actuals.summary.wantRows.some((row) => row.want.id === want.id)).map((want) => ({
          id: want.id, name: want.name, planned: want.plannedAmount, actual: 0,
          paidWith: want.paidWith, includedInCardPlan: false,
        }))],
        payrollInvested: investmentActuals.payroll,
        employerInvested: investmentActuals.employer,
        employerInvestmentKnown: true,
        directInvestedAtClose: investmentActuals.directNet,
        openingBalance: investmentActuals.openingBalance,
        investmentProjectionVersion: 1,
        invested: investmentActuals.total,
        investmentPlanCaptured: true,
        investedPlanned: planComparison.invested,
        balance,
        savingsRate: investmentActuals.savingsRate,
        costsByCategory,
        grossAssets: investments.summary.financialAssets,
        physicalAssets: investments.summary.physicalAssets,
        liabilities: investments.summary.liabilities,
        securedLiabilities: investments.summary.securedLiabilities,
        netWorth: investments.summary.netWorth,
        emergencyFund: emergencyFund.current,
        // Para o ciclo operacional, Cartão = a minha parte da fatura usada para
        // encerrar o mês. Antecipados já removidos da fatura não são somados de novo.
        cardPersonalTotal: cardCycleAccounting.invoiceFormedByCycle.personalTotal,
        cardPlanned: planComparison.card,
        cardByArea,
        cashLeftover: currentCycleFacts.cash.leftover,
        note,
      }
      return runRepositoryCommand({
        id: options?.operationId ?? `close-cycle:${month}:${uid()}`,
        expectedRevision: options?.expectedRevision,
        apply: (document) => closeCycleInDocument(document, {
          month,
          snapshot,
          costRows: actuals.summary.rows.map((row) => ({ id: row.cost.id, planned: row.planned })),
          wantRows: actuals.summary.wantRows.map((row) => ({ id: row.want.id, planned: row.planned })),
          invoiceKnown: cardCycleAccounting.invoiceThisCycle.amountKnown &&
            cardCycleAccounting.invoiceFormedByCycle.amountKnown,
          payInvoiceDueMonth: options?.payInvoice
            ? cardCycleAccounting.invoiceFormedByCycle.dueMonth : undefined,
        }),
      })
    },
    [
      activeCycle,
      activeScenario.id,
      activeScenario.name,
      actuals.summary,
      cardCycleAccounting.invoiceFormedByCycle.dueMonth,
      cardCycleAccounting.invoiceFormedByCycle.amountKnown,
      cardCycleAccounting.invoiceThisCycle.amountKnown,
      cardCycleAccounting.invoiceFormedByCycle.personalTotal,
      cardCycleAccounting.spendingThisCycle.personalByArea,
      currentCycleFacts.cash.leftover,
      emergencyFund,
      investmentActuals,
      investments.summary,
      planComparison,
      debtPayments,
      debtExtraPayments,
    ],
  )

  return {
    activeCycle,
    planComparison,
    scenarios,
    cards,
    cardCycleAccounting,
    assets,
    debts,
    investments,
    investmentActuals,
    history,
    forecast,
    forecastAgenda,
    movementSources,
    actuals,
    metrics,
    cashFlow,
    currentCycleFacts,
    financialCycle,
    nextCycleAllocation,
    projection,
    conditionalProjection,
    projectionData,
    monthlyContribution,
    scenarioSummaries,
    closeCurrentMonth,
  }
}

export type FinancasStore = ReturnType<typeof useFinancas>
