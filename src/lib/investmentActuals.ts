import type {
  EmergencyFundState,
  FinancialGoal,
  LedgerEntry,
} from '../types'
import { holdingPurpose, type FinancialHolding } from './investments'
import { ledgerEntryCycleMonth } from './shared'

export interface MonthlyInvestmentActuals {
  month: string
  reserveNet: number
  holdingsNet: number
  goalsNet: number
  /** Movimentação líquida feita pela conta: aportes − retiradas. */
  directNet: number
  /** Posição já existente ao iniciar o controle; patrimônio, não fluxo do mês. */
  openingBalance: number
  cashContributions: number
  cashWithdrawals: number
}

export interface InvestmentLedgerSource {
  emergencyFund: EmergencyFundState
  holdings: FinancialHolding[]
  goals: FinancialGoal[]
}

/**
 * Entradas criadas ao cadastrar um saldo que já existia não são poupança do mês.
 * Elas servem apenas para abrir o livro-razão no saldo correto.
 */
export function isOpeningBalance(entry: LedgerEntry) {
  return entry.kind === 'opening_balance'
}

function monthlyLedgerNet(entries: LedgerEntry[], month: string) {
  return entries.reduce((sum, entry) => {
    if (entry.payrollMonth || ledgerEntryCycleMonth(entry) !== month || isOpeningBalance(entry) || entry.kind === 'transfer_in' || entry.kind === 'transfer_out' || entry.kind === 'adjustment') return sum
    return sum + entry.amount
  }, 0)
}

function monthlyOpeningBalance(entries: LedgerEntry[], month: string) {
  return entries.reduce((sum, entry) => {
    if (ledgerEntryCycleMonth(entry) !== month || !isOpeningBalance(entry)) return sum
    return sum + Math.max(0, entry.amount)
  }, 0)
}

function materialEntries(input: InvestmentLedgerSource): LedgerEntry[] {
  const reserveHoldings = input.holdings.filter(
    (holding) => holdingPurpose(holding) === 'emergency_fund',
  )
  const reserveEntries =
    reserveHoldings.length > 0
      ? reserveHoldings.flatMap((holding) => holding.transactions)
      : input.emergencyFund.transactions

  return [
    ...reserveEntries,
    ...input.holdings
      .filter((holding) => holdingPurpose(holding) === 'portfolio')
      .flatMap((holding) => holding.transactions),
    ...input.goals.flatMap((goal) => goal.transactions),
  ].filter((entry) => !isOpeningBalance(entry) && !entry.payrollMonth)
}

/**
 * Indica que o livro-razão já é a fonte dos aportes realizados. Saldos de
 * abertura não bastam: eles posicionam o patrimônio, mas não contam como fluxo.
 */
export function hasInvestmentLedgerActivity(input: InvestmentLedgerSource): boolean {
  return materialEntries(input).length > 0
}

/**
 * Quanto realmente foi colocado em patrimônio financeiro no mês, pelo caixa.
 *
 * A reserva agora usa o mesmo livro-razão das posições. O bucket antigo só é
 * consultado como fallback durante a migração de backups anteriores.
 */
export function calculateMonthlyInvestmentActuals(input: InvestmentLedgerSource & {
  month: string
}): MonthlyInvestmentActuals {
  const reserveHoldings = input.holdings.filter(
    (holding) => holdingPurpose(holding) === 'emergency_fund',
  )
  const portfolioHoldings = input.holdings.filter(
    (holding) => holdingPurpose(holding) === 'portfolio',
  )

  const reserveNet =
    reserveHoldings.length > 0
      ? reserveHoldings.reduce(
          (sum, holding) => sum + monthlyLedgerNet(holding.transactions, input.month),
          0,
        )
      : monthlyLedgerNet(input.emergencyFund.transactions, input.month)

  const holdingsNet = portfolioHoldings.reduce(
    (sum, holding) => sum + monthlyLedgerNet(holding.transactions, input.month),
    0,
  )
  const goalsNet = input.goals.reduce(
    (sum, goal) => sum + monthlyLedgerNet(goal.transactions, input.month),
    0,
  )
  const openingBalance = monthlyOpeningBalance([
    ...(reserveHoldings.length > 0
      ? reserveHoldings.flatMap((holding) => holding.transactions)
      : input.emergencyFund.transactions),
    ...portfolioHoldings.flatMap((holding) => holding.transactions),
    ...input.goals.flatMap((goal) => goal.transactions),
  ], input.month)

  return {
    month: input.month,
    reserveNet,
    holdingsNet,
    goalsNet,
    directNet: reserveNet + holdingsNet + goalsNet,
    openingBalance,
    cashContributions: materialEntries(input).filter((tx) => ledgerEntryCycleMonth(tx) === input.month && tx.kind === 'contribution').reduce((sum, tx) => sum + tx.amount, 0),
    cashWithdrawals: materialEntries(input).filter((tx) => ledgerEntryCycleMonth(tx) === input.month && tx.kind === 'withdrawal').reduce((sum, tx) => sum - tx.amount, 0),
  }
}
