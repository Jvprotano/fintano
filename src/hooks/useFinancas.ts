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
import { calculateScenario } from '../lib/scenario'
import { buildCurrentCycleFacts } from '../lib/currentCycleFacts'
import { calculateAllocationPreview, calculateFinancialCycle } from '../lib/financialCycle'
import { calculateCardCycleAccounting, cardAdvancePaymentsForMonth } from '../lib/cardCycleAccounting'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { calculateAssetsSummary } from '../lib/assets'
import { occurrencesInMonth, projectNetWorth } from '../lib/forecast'
import { reconcileOccurrence, upcomingOccurrences } from '../lib/forecastCoverage'
import { maybeCreateAutoBackup } from '../lib/backup'
import { REPOSITORY_CHANGED_EVENT } from '../data/repository'
import { addMonths, uid } from '../lib/shared'
import { runRepositoryCommand, type CommandResult } from '../data/repositoryCommand'
import { closeCycleInDocument } from '../data/closingCommand'
import type { BudgetArea, CostCategory, MonthlySnapshot, ScenarioSummary } from '../types'
import { BUDGET_AREAS } from '../types/constants'

export type { ScenarioMetrics } from '../lib/scenario'

/**
 * Compõe os domínios e calcula o que depende de mais de um deles: o orçamento
 * do cenário ativo já enxergando o realizado do cartão, o caixa do mês, a
 * projeção de patrimônio líquido e o fechamento de mês.
 */
export function useFinancas() {
  const activeCycle = useActiveCycle()
  const scenarios = useScenarios(activeCycle.month)
  const cards = useCreditCards()
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

  const investments = useInvestments(debts.summary.totalBalance, {
    securedLiabilities: debts.summary.securedBalance,
    physicalAssets: assets.summary.totalValue,
  }, activeCycle.month)
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
    ...scenarios.scenarios.filter((scenario) => scenario.id !== scenarios.activeScenarioId).flatMap((scenario) => scenario.costs),
    ...scenarios.activeScenarioAll.costs,
  ], [scenarios.scenarios, scenarios.activeScenarioAll.costs, scenarios.activeScenarioId])
  const knownWants = useMemo(() => [
    ...scenarios.scenarios.filter((scenario) => scenario.id !== scenarios.activeScenarioId).flatMap((scenario) => scenario.wants),
    ...scenarios.activeScenarioAll.wants,
  ], [scenarios.scenarios, scenarios.activeScenarioAll.wants, scenarios.activeScenarioId])
  const actuals = useActuals(
    scenarios.activeScenario.costs,
    scenarios.activeScenario.wants,
    activeCycle.month,
    knownCosts,
    knownWants,
  )

  useEffect(() => {
    const checkBackup = () => maybeCreateAutoBackup()
    checkBackup()
    window.addEventListener(REPOSITORY_CHANGED_EVENT, checkBackup)
    return () => window.removeEventListener(REPOSITORY_CHANGED_EVENT, checkBackup)
  }, [])

  const { emergencyFund } = investments
  const { activeScenario } = scenarios

  /**
   * O cartão mantém o calendário de vencimento separado do ciclo financeiro.
   * A fatura que vence no mês seguinte é o bucket usado para encerrar o ciclo
   * atual; o snapshot do pagamento preserva total e parte pessoal após o giro.
   */
  const cardCycleAccounting = useMemo(
    () =>
      calculateCardCycleAccounting({
        entries: cards.entries,
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
    const payroll = metrics.investmentDeductions
    const employer = metrics.employerInvestmentContributions
    const personalTotal = payroll + ledger.directNet
    const creditedTotal = personalTotal + employer
    const realizedIncomeBase = metrics.availableForBudget + actuals.summary.extraIncomeTotal
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
    metrics.availableForBudget,
    metrics.employerInvestmentContributions,
    metrics.investmentDeductions,
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
  const currentCycleFacts = useMemo(() => {
    const invoiceToPay = cardCycleAccounting.invoiceThisCycle.personalTotal
    const cardAdvancePaid = cardAdvancePaymentsForMonth(cards.entries, cards.paidInvoices, activeCycle.month)
    const costsOnAccount = actuals.summary.rows
      .filter((row) => row.cost.paidWith !== 'card')
      .reduce((sum, row) => sum + row.effective, 0)
    const costsOnAccountPlanned = actuals.summary.rows
      .filter((row) => row.cost.paidWith !== 'card')
      .reduce((sum, row) => sum + row.planned, 0)

    return buildCurrentCycleFacts({
      month: activeCycle.month,
      paycheck: metrics.paycheckInAccount,
      extraIncome: actuals.summary.extraIncomeTotal,
      extraExpense: actuals.summary.extraExpenseTotal,
      cardAdvancePaid,
      costsOnAccountActual: costsOnAccount,
      costsPlanned: costsOnAccountPlanned,
      wantsOnAccountActual: actuals.summary.effectiveWants,
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
  ])
  const cashFlow = currentCycleFacts.cash

  const financialCycle = useMemo(
    () =>
      calculateFinancialCycle({
        cashMonth: activeCycle.month,
        income: cashFlow.totalIn,
        invoiceToPay: cashFlow.invoiceToPay,
        costsOnAccount: cashFlow.costsOnAccount,
        wantsOnAccount: cashFlow.wantsOnAccount,
        directInvestment: cashFlow.directInvestment,
        extraExpense: cashFlow.extraExpense + cashFlow.cardAdvancePaid,
        // A reserva do próximo caixa usa a parte pessoal da fatura que encerra
        // o ciclo ativo.
        nextInvoicePersonal: cardCycleAccounting.invoiceFormedByCycle.personalTotal,
        plannedNextInvoice: cashFlow.plannedOnCard,
      }),
    [activeCycle.month, cardCycleAccounting.invoiceFormedByCycle.personalTotal, cashFlow],
  )

  /**
   * O "Liberado para alocar" pertence ao próximo ciclo. Ex.: ao fechar Agosto,
   * usa o salário que financiará Setembro e abate a fatura de Setembro formada
   * por Agosto. O snapshot mantém esse mesmo valor mesmo se a fatura já tiver
   * sido paga antes do fechamento.
   */
  const nextCycleAllocation = useMemo(() => {
    const month = addMonths(activeCycle.month, 1)
    const occurrences = occurrencesInMonth(forecast.events, month)
    const extraIncome = occurrences
      .filter((item) => item.event.kind === 'income')
      .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months, new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices).remainingAmount, 0)
    const extraExpense = occurrences
      .filter((item) => item.event.kind === 'expense' && item.event.cashTreatment !== 'planned' && item.event.cashTreatment !== 'card')
      .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months, new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices).remainingAmount, 0)

    return calculateAllocationPreview({
      month,
      paycheck: metrics.paycheckInAccount,
      invoice: cardCycleAccounting.invoiceFormedByCycle.personalTotal,
      // O Liberado carrega o resultado real do ciclo encerrado para o próximo:
      // economia em custos aumenta a folga; estouro reduz o que resta para alocar.
      // `cashFlow.costsOnAccount` usa realizado e cai no plano apenas onde ainda
      // não há valor efetivo informado.
      costsOnAccount: cashFlow.costsOnAccount,
      baseInvestment: metrics.directInvestmentTarget,
      // Neste contexto, Desejos fora do cartão são os envelopes que sairão da
      // conta (Viagens, Qualidade de vida etc.). O cartão já foi abatido inteiro
      // pela fatura acima.
      plannedWants: metrics.wantsOnAccount,
      extraIncome,
      extraExpense,
    })
  }, [
    activeCycle.month,
    cardCycleAccounting.invoiceFormedByCycle.personalTotal,
    forecast.events,
    actuals.months,
    cards.entries,
    cards.paidInvoices,
    cashFlow.costsOnAccount,
    metrics.directInvestmentTarget,
    metrics.paycheckInAccount,
    metrics.wantsOnAccount,
  ])

  const monthlyContribution = useMemo(() => {
    if (forecast.assumptions.monthlyContribution !== null) {
      return forecast.assumptions.monthlyContribution
    }
    const leftover = forecast.assumptions.includeLeftover
      ? Math.max(0, metrics.balanceAfterPlan)
      : 0
    return metrics.totalPlannedInvestment + leftover
  }, [forecast.assumptions, metrics.balanceAfterPlan, metrics.totalPlannedInvestment])

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

  const projection = useMemo(
    () => {
      const remainingByOccurrence = Object.fromEntries(upcomingOccurrences(
        forecast.events, actuals.months, addMonths(activeCycle.month, 1),
        forecast.assumptions.horizonMonths, new Date().toISOString().slice(0, 10),
        cards.entries, cards.paidInvoices,
      ).map((item) => [item.id, item.remainingAmount]))
      return projectNetWorth({
        startMonth: activeCycle.month,
        startAssets: investments.summary.financialAssets,
        monthlyContribution,
        annualReturnPct: forecast.assumptions.annualReturnPct,
        inflationPct: forecast.assumptions.inflationPct,
        horizonMonths: forecast.assumptions.horizonMonths,
        events: forecast.events,
        remainingByOccurrence,
        debts: projectedDebts,
        properties: projectedProperties,
        reinvestFreedInstallments: forecast.assumptions.reinvestFreedInstallments,
      })
    },
    [
      activeCycle.month,
      forecast.assumptions.annualReturnPct,
      forecast.assumptions.inflationPct,
      forecast.assumptions.horizonMonths,
      forecast.assumptions.reinvestFreedInstallments,
      forecast.events,
      actuals.months,
      cards.entries,
      cards.paidInvoices,
      investments.summary.financialAssets,
      monthlyContribution,
      projectedDebts,
      projectedProperties,
    ],
  )

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
        metrics.paycheckInAccount +
        actuals.summary.extraIncomeTotal -
        actuals.summary.extraExpenseTotal -
        costs -
        actuals.summary.effectiveWants -
        investmentActuals.directNet

      const snapshot: Omit<MonthlySnapshot, 'id' | 'closedAt'> = {
        month,
        scenarioId: activeScenario.id,
        scenarioName: activeScenario.name,
        availableForBudget: metrics.availableForBudget,
        paycheckInAccount: metrics.paycheckInAccount,
        extraIncome: actuals.summary.extraIncomeTotal,
        extraIncomeEntries: actuals.summary.extraIncome,
        extraExpense: actuals.summary.extraExpenseTotal,
        extraExpenseEntries: actuals.summary.extraExpenses,
        costs,
        costsPlanned: actuals.summary.plannedCosts,
        wants: actuals.summary.effectiveWants,
        wantsPlanned: actuals.summary.plannedWants,
        wantAllocations: actuals.summary.wantRows.map((row) => ({
          id: row.want.id,
          name: row.want.name,
          planned: row.planned,
          actual: row.effective,
          paidWith: row.want.paidWith,
          includedInCardPlan: false,
        })),
        payrollInvested: investmentActuals.payroll,
        employerInvested: investmentActuals.employer,
        employerInvestmentKnown: true,
        directInvestedAtClose: investmentActuals.directNet,
        openingBalance: investmentActuals.openingBalance,
        investmentProjectionVersion: 1,
        invested: investmentActuals.total,
        investmentPlanCaptured: true,
        investedPlanned: metrics.totalPlannedInvestment,
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
        cardPlanned: metrics.plannedOnCard,
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
      cardCycleAccounting.invoiceFormedByCycle.personalTotal,
      cardCycleAccounting.spendingThisCycle.personalByArea,
      currentCycleFacts.cash.leftover,
      emergencyFund,
      investmentActuals,
      investments.summary,
      metrics,
    ],
  )

  return {
    activeCycle,
    scenarios,
    cards,
    cardCycleAccounting,
    assets,
    debts,
    investments,
    investmentActuals,
    history,
    forecast,
    actuals,
    metrics,
    cashFlow,
    currentCycleFacts,
    financialCycle,
    nextCycleAllocation,
    projection,
    monthlyContribution,
    scenarioSummaries,
    closeCurrentMonth,
  }
}

export type FinancasStore = ReturnType<typeof useFinancas>
