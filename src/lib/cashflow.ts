import type { CashFlowSummary } from '../types'

// ---------------------------------------------------------------------------
// Caixa do mês.
//
// O orçamento é regime de competência: um jantar de julho é um desejo de julho,
// mesmo que a fatura só seja paga em agosto. O caixa é outra história — o que
// sai da conta neste mês é a fatura que vence agora, mais o que nunca passou no
// cartão, mais o aporte direto.
//
// Os dois convivem: o orçamento diz se você gastou demais, o caixa diz se o
// dinheiro do mês dá para pagar o que vence. Misturá-los é o que faz parecer
// que um gasto foi contado duas vezes.
// ---------------------------------------------------------------------------

export interface CashFlowInput {
  /** O que efetivamente cai na conta depois da folha. */
  paycheck: number
  /** Entradas avulsas efetivamente recebidas no ciclo. */
  extraIncome?: number
  /** Saídas avulsas efetivamente pagas no ciclo. */
  extraExpense?: number
  /** Pagamentos avulsos do cartão que já saíram do caixa neste ciclo. */
  cardAdvancePaid?: number
  investmentWithdrawals?: number
  debtExtraPayments?: number
  thirdPartyAdvanced?: number
  reimbursementsReceived?: number
  costsOnAccount: number
  costsOnCard: number
  wantsOnAccount: number
  wantsOnCard: number
  directInvestment: number
  /** Parte pessoal da fatura que vence neste mês. */
  invoiceToPay: number
}

export function calculateCashFlow(input: CashFlowInput): CashFlowSummary {
  // Futuro é previsão. Só o que foi registrado no Realizado vira caixa livre;
  // assim uma entrada esperada não libera dinheiro antes de realmente cair.
  const extraIncome = Math.max(0, input.extraIncome ?? 0)
  const extraExpense = Math.max(0, input.extraExpense ?? 0)
  const cardAdvancePaid = Math.max(0, input.cardAdvancePaid ?? 0)

  const plannedOnCard = input.costsOnCard + input.wantsOnCard
  const investmentWithdrawals = input.investmentWithdrawals ?? 0
  const debtExtraPayments = input.debtExtraPayments ?? 0
  const thirdPartyAdvanced = input.thirdPartyAdvanced ?? 0
  const reimbursementsReceived = input.reimbursementsReceived ?? 0
  const totalIn = input.paycheck + extraIncome + investmentWithdrawals + reimbursementsReceived
  const totalOut =
    input.invoiceToPay +
    input.costsOnAccount +
    input.wantsOnAccount +
    input.directInvestment +
    extraExpense +
    cardAdvancePaid + debtExtraPayments + thirdPartyAdvanced

  return {
    paycheck: input.paycheck,
    extraIncome,
    totalIn,
    invoiceToPay: input.invoiceToPay,
    costsOnAccount: input.costsOnAccount,
    wantsOnAccount: input.wantsOnAccount,
    costsOnCard: input.costsOnCard,
    wantsOnCard: input.wantsOnCard,
    plannedOnCard,
    directInvestment: input.directInvestment,
    extraExpense,
    cardAdvancePaid,
    investmentWithdrawals,
    debtExtraPayments,
    thirdPartyAdvanced,
    reimbursementsReceived,
    totalOut,
    leftover: totalIn - totalOut,
    cardPlanGap: input.invoiceToPay - plannedOnCard,
  }
}
