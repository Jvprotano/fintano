import type { Asset, CostItem, Debt, DebtKind, DebtsSummary, DebtSummary } from '../types'
import { finiteNumber, normalizeLedger, nowIso, uid } from './shared'

// ---------------------------------------------------------------------------
// Dívidas.
//
// Um app que só soma ativos mede a metade otimista da vida. Amortizar R$ 1.000
// de um financiamento e aportar R$ 1.000 num CDB fazem exatamente a mesma coisa
// com o seu patrimônio líquido — e o app precisa enxergar as duas.
//
// Mas nem toda dívida é do mesmo tipo. Uma dívida *garantida* — o financiamento
// da casa em que você mora — tem um bem do outro lado e substitui um aluguel:
// ela não pede a decisão "quito ou invisto?", pede "vale a pena morar aqui?".
// Só a dívida sem contrapartida entra na média ponderada, no ranking da mais
// cara e no total de juros até quitar. Misturar as duas enterra o sinal.
//
// O saldo devedor é mantido por você, como o valor de mercado de uma posição:
// juros correm, seguros entram, e ninguém acerta isso derivando de pagamentos.
// As movimentações são o registro de amortizações (negativo abate o saldo).
// ---------------------------------------------------------------------------

const KINDS: DebtKind[] = ['financiamento', 'emprestimo', 'consignado', 'cartao', 'outros']

/** Acima disso, a parcela quita em um mês e o cálculo de prazo perde sentido. */
const MAX_PAYOFF_MONTHS = 720

export function normalizeDebt(raw: Partial<Debt> | undefined): Debt {
  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Dívida',
    kind: KINDS.includes(raw?.kind as DebtKind) ? (raw?.kind as DebtKind) : 'outros',
    balance: Math.max(0, finiteNumber(raw?.balance)),
    monthlyRatePct: Math.max(0, Math.min(50, finiteNumber(raw?.monthlyRatePct))),
    installment: Math.max(0, finiteNumber(raw?.installment)),
    remainingInstallments: Math.max(0, Math.round(finiteNumber(raw?.remainingInstallments))),
    linkedCostId: raw?.linkedCostId || undefined,
    linkedAssetId: raw?.linkedAssetId || undefined,
    transactions: normalizeLedger(raw?.transactions),
    createdAt: raw?.createdAt || nowIso(),
    settledAt: raw?.settledAt || undefined,
    archivedAt: raw?.archivedAt && Number.isFinite(Date.parse(raw.archivedAt))
      ? raw.archivedAt : undefined,
  }
}

/**
 * Meses até o saldo zerar pagando a parcela. Sem juros é uma divisão; com
 * juros é a fórmula do valor presente de uma anuidade. Devolve null quando a
 * parcela não cobre nem os juros do mês — aí a dívida cresce e não há prazo.
 */
export function monthsToPayoff(balance: number, monthlyRate: number, installment: number): number | null {
  if (balance <= 0) return 0
  if (installment <= 0) return null
  if (monthlyRate <= 0) return Math.ceil(balance / installment)

  const interest = balance * monthlyRate
  if (installment <= interest) return null

  const months = Math.log(installment / (installment - interest)) / Math.log(1 + monthlyRate)
  return Math.min(MAX_PAYOFF_MONTHS, Math.ceil(months))
}

export function summarizeDebt(
  debt: Debt,
  costs: CostItem[] = [],
  assets: Asset[] = [],
): DebtSummary {
  const monthlyRate = debt.monthlyRatePct / 100
  const monthlyInterest = debt.balance * monthlyRate
  const payoff = monthsToPayoff(debt.balance, monthlyRate, debt.installment)
  // O prazo informado manda: é o que está no contrato. Sem ele, estimamos.
  const months = debt.remainingInstallments > 0 ? debt.remainingInstallments : payoff
  const totalRemaining = months !== null ? debt.installment * months : Infinity

  const linkedCost = debt.linkedCostId
    ? costs.find((cost) => cost.id === debt.linkedCostId)
    : undefined
  const linkedCostMismatch =
    linkedCost && debt.installment > 0 ? linkedCost.value - debt.installment : null

  // O bem apagado não deixa a dívida "garantida" por um fantasma.
  const linkedAsset = debt.linkedAssetId
    ? assets.find((asset) => asset.id === debt.linkedAssetId)
    : undefined

  return {
    ...debt,
    annualRatePct: (Math.pow(1 + monthlyRate, 12) - 1) * 100,
    monthlyInterest,
    amortizationShare:
      debt.installment > 0 ? Math.max(0, (debt.installment - monthlyInterest) / debt.installment) : 0,
    monthsToPayoff: months,
    totalRemaining: Number.isFinite(totalRemaining) ? totalRemaining : 0,
    interestRemaining: Number.isFinite(totalRemaining)
      ? Math.max(0, totalRemaining - debt.balance)
      : 0,
    isSettled: debt.balance <= 0,
    linkedCostMismatch:
      linkedCostMismatch !== null && Math.abs(linkedCostMismatch) > 0.005 ? linkedCostMismatch : null,
    isSecured: linkedAsset !== undefined,
    assetValue: linkedAsset ? linkedAsset.value : null,
    equity: linkedAsset ? linkedAsset.value - debt.balance : null,
    ltvPct: linkedAsset && linkedAsset.value > 0 ? (debt.balance / linkedAsset.value) * 100 : null,
  }
}

export function calculateDebtsSummary(
  debts: Debt[],
  costs: CostItem[] = [],
  assets: Asset[] = [],
): DebtsSummary {
  const summaries = debts.map((debt) => summarizeDebt(debt, costs, assets))
  const active = summaries.filter((debt) => !debt.isSettled)
  const unsecured = active.filter((debt) => !debt.isSecured)
  const unsecuredBalance = unsecured.reduce((sum, debt) => sum + debt.balance, 0)

  // Ponderar pelo saldo: uma dívida de R$ 200 a 14% ao mês não deve puxar a
  // média tanto quanto um empréstimo de R$ 20 mil a 1,8%.
  const weightedAnnualRatePct =
    unsecuredBalance > 0
      ? unsecured.reduce((sum, debt) => sum + debt.annualRatePct * debt.balance, 0) / unsecuredBalance
      : 0

  const costliest = unsecured.reduce<DebtSummary | null>(
    (top, debt) => (!top || debt.annualRatePct > top.annualRatePct ? debt : top),
    null,
  )

  return {
    totalBalance: active.reduce((sum, debt) => sum + debt.balance, 0),
    totalInstallment: active.reduce((sum, debt) => sum + debt.installment, 0),
    totalMonthlyInterest: active.reduce((sum, debt) => sum + debt.monthlyInterest, 0),
    totalInterestRemaining: active.reduce((sum, debt) => sum + debt.interestRemaining, 0),
    securedBalance: active
      .filter((debt) => debt.isSecured)
      .reduce((sum, debt) => sum + debt.balance, 0),
    unsecured: {
      balance: unsecuredBalance,
      installment: unsecured.reduce((sum, debt) => sum + debt.installment, 0),
      monthlyInterest: unsecured.reduce((sum, debt) => sum + debt.monthlyInterest, 0),
      interestRemaining: unsecured.reduce((sum, debt) => sum + debt.interestRemaining, 0),
      weightedAnnualRatePct,
      costliest,
      count: unsecured.length,
    },
    debts: summaries,
  }
}

// ---------------------------------------------------------------------------
// Amortizar ou investir
// ---------------------------------------------------------------------------

export interface PayoffComparison {
  /** Quanto R$ `amount` amortizados economizam de juros em 12 meses. */
  interestSaved: number
  /** Quanto os mesmos R$ `amount` rendem investidos em 12 meses. */
  investmentReturn: number
  /** interestSaved − investmentReturn. Positivo = amortizar sai na frente. */
  difference: number
  debtAnnualRatePct: number
  investmentAnnualRatePct: number
}

/**
 * Compara aritmeticamente as duas destinações de um mesmo dinheiro, em 12
 * meses. Não é conselho: são duas taxas lado a lado, com a premissa de retorno
 * que você mesmo definiu na projeção.
 */
export function comparePayoffVsInvest(
  debt: Pick<DebtSummary, 'annualRatePct'>,
  investmentAnnualRatePct: number,
  amount: number,
): PayoffComparison {
  const interestSaved = amount * (debt.annualRatePct / 100)
  const investmentReturn = amount * (investmentAnnualRatePct / 100)

  return {
    interestSaved,
    investmentReturn,
    difference: interestSaved - investmentReturn,
    debtAnnualRatePct: debt.annualRatePct,
    investmentAnnualRatePct,
  }
}

/** Um mês de evolução do saldo: juros correm, a parcela abate. */
export function advanceDebtMonth(balance: number, monthlyRatePct: number, installment: number) {
  if (balance <= 0) return { balance: 0, paid: 0, interest: 0 }
  const interest = balance * (monthlyRatePct / 100)
  const withInterest = balance + interest
  const payment = Math.min(installment, withInterest)
  return { balance: Math.max(0, withInterest - payment), paid: payment, interest }
}
