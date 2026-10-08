import { addMonths } from './shared'

/** O ciclo financiado pelo recebimento mais recente. */
export interface FinancialCycleInput {
  cashMonth: string
  /** Entradas de caixa registradas, incluindo resgates. */
  income: number
  invoiceToPay: number
  costsOnAccount: number
  /** Contas confirmadas ou ainda reservadas pelo plano. */
  costsCommitted?: number
  wantsOnAccount: number
  /** Aportes brutos efetivamente registrados pela conta. */
  directInvestment: number
  /** Resgates registrados; a parcela reaplicada compensa os aportes brutos. */
  investmentWithdrawals?: number
  /** Aporte líquido programado, comparado ao líquido já executado. */
  directInvestmentCommitted?: number
  extraExpense: number
  /** Extras pagos somados às ocorrências ainda pendentes neste ciclo. */
  extraExpenseCommitted?: number
  /** Compras já feitas no cartão — viram a fatura do *próximo* ciclo. */
  nextInvoicePersonal: number
  /** Plano do cartão para o mês em formação (também do próximo ciclo). */
  plannedNextInvoice: number
}

export interface FinancialCycleSummary {
  cashMonth: string
  spendingMonth: string
  nextSpendingMonth: string
  /** Renda e resgates não reaplicados usados no orçamento. */
  income: number
  invoiceToPay: number
  costsOnAccount: number
  wantsOnAccount: number
  /** Aportes pela conta após compensar os resgates do ciclo. */
  directInvestment: number
  /** Resgates que excedem os aportes; recursos patrimoniais usados no ciclo, não renda. */
  withdrawalsForCycle: number
  costsCommitted: number
  directInvestmentCommitted: number
  extraExpense: number
  extraExpenseCommitted: number
  nextInvoicePersonal: number
  plannedNextInvoice: number
  /** Obrigações que vencem agora, já incluindo desejos em conta. */
  commitmentsDueNow: number
  /** Fatura, contas, aporte e extraordinários: tudo que vem antes de alocar Desejos. */
  commitmentsBeforeWants: number
  cashAfterDue: number
  /**
   * Prévia da fatura do próximo ciclo (`max` do lançado e do plano).
   * Não sai deste salário — o próximo ciclo paga.
   */
  reservedForNextInvoice: number
  /** Após obrigações deste ciclo (inclui desejos em conta). Sem “reserva” da próxima. */
  availableAfterReservations: number
  /**
   * Folga depois de pagar obrigações *e* os desejos em conta planejados.
   * Prefira `discretionaryPool` quando a pergunta for “quanto posso alocar”.
   */
  safeToSpend: number
  shortfall: number
  /**
   * Quanto sobra para alocar em desejos ou investimentos — *antes* de
   * comprometer os envelopes de desejos em conta (Viagens, Qualidade de vida…).
   * `renda − fatura deste ciclo − custos − aporte − saídas do ano`.
   * A fatura em formação (próximo ciclo) não entra: paga-se com o próximo salário.
   */
  discretionaryAvailable: number
  /** Parte positiva de `discretionaryAvailable` (zero se estiver no vermelho). */
  discretionaryPool: number
  /** Quanto falta para cobrir obrigações deste ciclo, sem contar desejos em conta. */
  discretionaryShortfall: number
  /** Verba restante depois dos Desejos efetivamente destinados. */
  remainingAfterWants: number
}

export function calculateFinancialCycle(input: FinancialCycleInput): FinancialCycleSummary {
  // Reaplicar patrimônio não cria renda nem cumpre o aporte líquido do plano.
  // Compensar ambos os lados mantém o fluxo registrado e a sobra efetiva.
  const withdrawals = Math.max(0, input.investmentWithdrawals ?? 0)
  const reapplied = Math.min(withdrawals, Math.max(0, input.directInvestment))
  const income = input.income - reapplied
  const directInvestment = input.directInvestment - reapplied
  const commitmentsDueNow =
    input.invoiceToPay +
    input.costsOnAccount +
    input.wantsOnAccount +
    directInvestment +
    input.extraExpense
  const cashAfterDue = income - commitmentsDueNow
  // Prévia do próximo ciclo — informativa, não obrigação deste salário.
  const reservedForNextInvoice = Math.max(input.nextInvoicePersonal, input.plannedNextInvoice)

  // Pool discricionário: só o que este salário precisa cobrir agora.
  const costsCommitted = Math.max(input.costsOnAccount, input.costsCommitted ?? input.costsOnAccount)
  const directInvestmentCommitted = Math.max(directInvestment, input.directInvestmentCommitted ?? directInvestment)
  const extraExpenseCommitted = Math.max(input.extraExpense, input.extraExpenseCommitted ?? input.extraExpense)
  const commitmentsBeforeWants =
    input.invoiceToPay + costsCommitted + directInvestmentCommitted + extraExpenseCommitted
  const discretionaryAvailable = income - commitmentsBeforeWants

  return {
    cashMonth: input.cashMonth,
    spendingMonth: addMonths(input.cashMonth, -1),
    nextSpendingMonth: input.cashMonth,
    income,
    invoiceToPay: input.invoiceToPay,
    costsOnAccount: input.costsOnAccount,
    wantsOnAccount: input.wantsOnAccount,
    directInvestment,
    withdrawalsForCycle: withdrawals - reapplied,
    costsCommitted,
    directInvestmentCommitted,
    extraExpenseCommitted,
    extraExpense: input.extraExpense,
    nextInvoicePersonal: input.nextInvoicePersonal,
    plannedNextInvoice: input.plannedNextInvoice,
    commitmentsDueNow,
    commitmentsBeforeWants,
    cashAfterDue,
    reservedForNextInvoice,
    availableAfterReservations: cashAfterDue,
    safeToSpend: Math.max(0, cashAfterDue),
    shortfall: Math.max(0, -cashAfterDue),
    discretionaryAvailable,
    discretionaryPool: Math.max(0, discretionaryAvailable),
    discretionaryShortfall: Math.max(0, -discretionaryAvailable),
    remainingAfterWants: discretionaryAvailable - input.wantsOnAccount,
  }
}


/**
 * Prévia do dinheiro que poderá ser alocado no próximo ciclo.
 *
 * Este número não é o caixa do ciclo que está sendo fechado. Ele responde à
 * pergunta operacional: depois que o próximo salário pagar a fatura formada
 * agora, as contas em conta e o aporte-base, quanto sobra para Desejos e aporte
 * complementar?
 */
export interface AllocationPreviewInput {
  month: string
  paycheck: number
  invoice: number
  costsOnAccount: number
  baseInvestment: number
  /** Desejos planejados fora do cartão: Viagens, Qualidade de vida etc. */
  plannedWants: number
  extraIncome?: number
  extraExpense?: number
}

export interface AllocationPreview {
  month: string
  paycheck: number
  extraIncome: number
  totalIncome: number
  invoice: number
  costsOnAccount: number
  baseInvestment: number
  plannedWants: number
  extraExpense: number
  committedBeforeAllocation: number
  availableToAllocate: number
  /** Sobra (ou falta) depois de também respeitar o plano de Desejos fora do cartão. */
  afterPlannedWants: number
  pool: number
  shortfall: number
}

export function calculateAllocationPreview(input: AllocationPreviewInput): AllocationPreview {
  const extraIncome = Math.max(0, input.extraIncome ?? 0)
  const extraExpense = Math.max(0, input.extraExpense ?? 0)
  const plannedWants = Math.max(0, input.plannedWants)
  const totalIncome = input.paycheck + extraIncome
  const committedBeforeAllocation =
    input.invoice + input.costsOnAccount + input.baseInvestment + extraExpense
  const availableToAllocate = totalIncome - committedBeforeAllocation
  const afterPlannedWants = availableToAllocate - plannedWants

  return {
    month: input.month,
    paycheck: input.paycheck,
    extraIncome,
    totalIncome,
    invoice: input.invoice,
    costsOnAccount: input.costsOnAccount,
    baseInvestment: input.baseInvestment,
    plannedWants,
    extraExpense,
    committedBeforeAllocation,
    availableToAllocate,
    afterPlannedWants,
    pool: Math.max(0, availableToAllocate),
    shortfall: Math.max(0, -availableToAllocate),
  }
}
