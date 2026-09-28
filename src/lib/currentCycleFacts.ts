import type { CashFlowSummary } from '../types'
import { calculateCashFlow } from './cashflow'

export interface CurrentCycleFactsInput {
  month: string
  paycheck: number
  extraIncome: number
  extraExpense: number
  cardAdvancePaid?: number
  invoiceToPay: number
  costsOnAccountActual: number
  costsPlanned: number
  wantsOnAccountActual: number
  wantsPlanned: number
  costsOnCardPlanned: number
  wantsOnCardPlanned: number
  directInvestmentActual: number
  directInvestmentPlanned: number
  payrollInvestment: number
  employerInvestment: number
  totalInvestmentPlanned: number
}

export interface CurrentCycleFacts {
  month: string
  cash: CashFlowSummary
  plan: {
    costs: number
    wantsOnAccount: number
    directInvestment: number
    personalInvestment: number
  }
  actual: {
    costsOnAccount: number
    wantsOnAccount: number
    directInvestment: number
    payrollInvestment: number
    employerInvestment: number
    /** Recursos próprios destinados a investimentos no ciclo. */
    personalInvestment: number
    /** Tudo que entrou em investimentos, incluindo o bônus da empresa. */
    creditedInvestment: number
  }
}

/**
 * Read model canônico do ciclo ativo.
 *
 * Cada fato vem da entidade que o possui: realizado em conta, fatura, livro-
 * razão de investimentos e folha. As telas consomem esta projeção em vez de
 * remontar a equação com uma mistura de plano e realizado.
 */
export function buildCurrentCycleFacts(input: CurrentCycleFactsInput): CurrentCycleFacts {
  const personalInvestment = input.payrollInvestment + input.directInvestmentActual
  const creditedInvestment = personalInvestment + input.employerInvestment
  const cash = calculateCashFlow({
    paycheck: input.paycheck,
    extraIncome: input.extraIncome,
    extraExpense: input.extraExpense,
    cardAdvancePaid: input.cardAdvancePaid,
    costsOnAccount: input.costsOnAccountActual,
    costsOnCard: input.costsOnCardPlanned,
    wantsOnAccount: input.wantsOnAccountActual,
    wantsOnCard: input.wantsOnCardPlanned,
    directInvestment: input.directInvestmentActual,
    invoiceToPay: input.invoiceToPay,
  })

  return {
    month: input.month,
    cash,
    plan: {
      costs: input.costsPlanned,
      wantsOnAccount: input.wantsPlanned,
      directInvestment: input.directInvestmentPlanned,
      personalInvestment: input.totalInvestmentPlanned,
    },
    actual: {
      costsOnAccount: input.costsOnAccountActual,
      wantsOnAccount: input.wantsOnAccountActual,
      directInvestment: input.directInvestmentActual,
      payrollInvestment: input.payrollInvestment,
      employerInvestment: input.employerInvestment,
      personalInvestment,
      creditedInvestment,
    },
  }
}
