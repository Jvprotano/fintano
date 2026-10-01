import type {
  AssetClassSummary,
  EmergencyFundState,
  HoldingSummary,
  InvestmentAssetClass,
  InvestmentHolding,
  InvestmentsSummary,
  LedgerEntry,
} from '../types'
import { DEFAULT_INVESTMENT_CLASSES } from '../types/constants'
import { finiteNumber, ledgerBalance, normalizeLedger, nowIso, uid } from './shared'

const DAY_MS = 24 * 60 * 60 * 1000
/** Abaixo disso, anualizar transforma ruído de dias em "retorno" de três dígitos. */
const MIN_DAYS_FOR_ANNUALIZED = 60

/**
 * Finalidade da posição. A classe responde "no que está aplicado"; a finalidade
 * responde "para que esse dinheiro existe". Isso permite que um CDB seja Renda
 * Fixa e, ao mesmo tempo, Reserva de emergência sem misturá-lo com a carteira.
 */
export type InvestmentPurpose = 'portfolio' | 'emergency_fund'

export type FinancialHolding = InvestmentHolding & {
  purpose?: InvestmentPurpose
  /** Referência/rentabilidade contratada: ex. 100% CDI, Selic, IPCA + 6%. */
  benchmark?: string
  /** Prazo de resgate informado pelo usuário: ex. D+0, D+1. */
  liquidity?: string
}

export type FinancialHoldingSummary = HoldingSummary & {
  purpose?: InvestmentPurpose
  benchmark?: string
  liquidity?: string
}

export type ExtendedInvestmentsSummary = InvestmentsSummary & {
  /** Todas as posições, inclusive as que materializam a reserva. */
  allHoldings: FinancialHoldingSummary[]
  /** Classes reais de todas as posições financeiras. */
  allClasses: AssetClassSummary[]
  holdingsMarketValue: number
  financialInvested: number
  financialGain: number
  /** Posições cuja finalidade é a reserva, fora da carteira de rebalanceamento. */
  reserveHoldings: FinancialHoldingSummary[]
  reserveInvested: number
  reserveGain: number
  /** Valor de mercado apenas da carteira de médio/longo prazo. */
  portfolioMarketValue: number
}

export function holdingPurpose(holding: FinancialHolding): InvestmentPurpose {
  return holding.purpose === 'emergency_fund' ? 'emergency_fund' : 'portfolio'
}

// ---------------------------------------------------------------------------
// Rentabilidade anualizada (TIR sobre fluxos de caixa irregulares)
// ---------------------------------------------------------------------------

interface CashFlow {
  /** Negativo = dinheiro que saiu do bolso (aporte). */
  amount: number
  time: number
}

function netPresentValue(flows: CashFlow[], rate: number, start: number): number {
  return flows.reduce((sum, flow) => {
    const years = (flow.time - start) / (365 * DAY_MS)
    return sum + flow.amount / Math.pow(1 + rate, years)
  }, 0)
}

/**
 * Retorno anualizado de uma posição a partir das datas dos aportes e do valor de
 * mercado de hoje. Resolve a TIR por bisseção — sem sinal trocado (ou com
 * histórico curto demais) devolve null em vez de um número sem sentido.
 */
export function annualizedReturn(transactions: LedgerEntry[], marketValue: number): number | null {
  if (transactions.length === 0 || marketValue <= 0) return null

  const now = Date.now()
  const flows: CashFlow[] = []
  for (const tx of transactions) {
    const time = new Date(tx.date).getTime()
    if (Number.isNaN(time)) return null
    flows.push({ amount: -tx.amount, time })
  }

  const start = Math.min(...flows.map((flow) => flow.time))
  if (now - start < MIN_DAYS_FOR_ANNUALIZED * DAY_MS) return null
  flows.push({ amount: marketValue, time: now })

  let low = -0.9999
  let high = 10
  let npvLow = netPresentValue(flows, low, start)
  let npvHigh = netPresentValue(flows, high, start)
  if (npvLow * npvHigh > 0) return null

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    const npvMid = netPresentValue(flows, mid, start)
    if (Math.abs(npvMid) < 0.01) return mid * 100
    if (npvLow * npvMid < 0) {
      high = mid
      npvHigh = npvMid
    } else {
      low = mid
      npvLow = npvMid
    }
  }
  void npvHigh

  return ((low + high) / 2) * 100
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * A reserva antiga é mantida apenas como formato de migração. Depois da
 * migração, o saldo passa a ser a soma das posições `emergency_fund`.
 */
export function normalizeEmergencyFund(
  raw: Partial<EmergencyFundState> | undefined,
  seedId = 'ef-initial',
  seedDate = nowIso(),
): EmergencyFundState {
  const targetMonths = Math.max(1, Math.round(finiteNumber(raw?.targetMonths, 6)))
  let transactions = normalizeLedger(raw?.transactions, seedDate)

  const legacyCurrent = Math.max(0, finiteNumber(raw?.current))
  if (transactions.length === 0 && legacyCurrent > 0) {
    transactions = [{ id: seedId, amount: legacyCurrent, date: seedDate, note: 'Saldo inicial' }]
  }

  return { current: Math.max(0, ledgerBalance(transactions)), targetMonths, transactions }
}

export function normalizeHolding(raw: Partial<FinancialHolding> | undefined): FinancialHolding {
  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Posição',
    assetClassId: raw?.assetClassId || 'outros',
    institution: raw?.institution?.trim() || undefined,
    marketValue: Math.max(0, finiteNumber(raw?.marketValue)),
    transactions: normalizeLedger(raw?.transactions),
    purpose: raw?.purpose === 'emergency_fund' ? 'emergency_fund' : 'portfolio',
    benchmark: raw?.benchmark?.trim() || undefined,
    liquidity: raw?.liquidity?.trim() || undefined,
    archivedAt: raw?.archivedAt && Number.isFinite(Date.parse(raw.archivedAt))
      ? raw.archivedAt : undefined,
  }
}

export function normalizeAssetClass(
  raw: Partial<InvestmentAssetClass> | undefined,
  index = 0,
): InvestmentAssetClass {
  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || `Classe ${index + 1}`,
    color:
      raw?.color || DEFAULT_INVESTMENT_CLASSES[index % DEFAULT_INVESTMENT_CLASSES.length].color,
  }
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

/** O que vem de fora do módulo de investimentos e muda a leitura do patrimônio. */
export interface BalanceSheetInput {
  /** Saldo devedor com bem cadastrado do outro lado (financiamento). */
  securedLiabilities?: number
  /** Valor de mercado dos bens. */
  physicalAssets?: number
}

export function calculateInvestmentsSummary(
  holdings: FinancialHolding[],
  classes: InvestmentAssetClass[],
  legacyReserveBalance = 0,
  goalsBalance = 0,
  liabilities = 0,
  balanceSheet: BalanceSheetInput = {},
): ExtendedInvestmentsSummary {
  const holdingSummaries: FinancialHoldingSummary[] = holdings.map((holding) => {
    const invested = ledgerBalance(holding.transactions)
    const gain = holding.marketValue - invested
    return {
      ...holding,
      invested,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : 0,
      annualizedPct: annualizedReturn(holding.transactions, holding.marketValue),
    }
  })

  const reserveHoldings = holdingSummaries.filter(
    (holding) => holdingPurpose(holding) === 'emergency_fund',
  )
  const portfolioHoldings = holdingSummaries.filter(
    (holding) => holdingPurpose(holding) === 'portfolio',
  )

  // `legacyReserveBalance` só existe durante a primeira renderização de uma base
  // antiga. Assim que a migração cria uma posição de reserva, ele deixa de somar.
  const reserveMarketValue = reserveHoldings.reduce((sum, h) => sum + h.marketValue, 0)
  const reserveBalance = reserveHoldings.length > 0 ? reserveMarketValue : legacyReserveBalance
  const reserveInvested = reserveHoldings.reduce((sum, h) => sum + h.invested, 0)
  const reserveGain = reserveHoldings.reduce((sum, h) => sum + h.gain, 0)
  const holdingsMarketValue = holdingSummaries.reduce((sum, h) => sum + h.marketValue, 0)
  const holdingsInvested = holdingSummaries.reduce((sum, h) => sum + h.invested, 0)

  // Estes totais continuam significando a carteira de médio/longo prazo. A
  // reserva é um ativo financeiro, mas não participa do rebalanceamento dela.
  const totalMarketValue = portfolioHoldings.reduce((sum, h) => sum + h.marketValue, 0)
  const totalInvested = portfolioHoldings.reduce((sum, h) => sum + h.invested, 0)
  const totalGain = totalMarketValue - totalInvested

  // Reserva e metas são dinheiro seu. Em `goalsBalance` entra só o livro-razão
  // das metas — o que uma meta de patrimônio engloba já está contado.
  const financialAssets = totalMarketValue + reserveBalance + goalsBalance

  const physicalAssets = Math.max(0, balanceSheet.physicalAssets ?? 0)
  // Garantida nunca passa do total: o saldo do financiamento é o mesmo saldo.
  const securedLiabilities = Math.min(
    liabilities,
    Math.max(0, balanceSheet.securedLiabilities ?? 0),
  )
  const unsecuredLiabilities = liabilities - securedLiabilities

  const grossAssets = financialAssets + physicalAssets
  const netWorth = grossAssets - liabilities
  // O número que responde "quanto dinheiro eu tenho": a casa não paga a conta
  // do mês e o financiamento dela já é custo fixo — os dois saem daqui.
  const financialNetWorth = financialAssets - unsecuredLiabilities

  // Classes de carteira: posições de reserva têm classe real, mas não entram na
  // alocação/rebalanceamento de longo prazo. Elas aparecem dentro da seção Reserva.
  const orphanClassIds = portfolioHoldings
    .map((h) => h.assetClassId)
    .filter((id) => !classes.some((c) => c.id === id))
  const orderedClasses: InvestmentAssetClass[] = [
    ...classes,
    ...Array.from(new Set(orphanClassIds)).map((id, index) => ({
      id,
      name: 'Sem classe',
      color: DEFAULT_INVESTMENT_CLASSES[index % DEFAULT_INVESTMENT_CLASSES.length].color,
    })),
  ]

  const classSummaries: AssetClassSummary[] = orderedClasses
    .map((assetClass) => {
      const classHoldings = portfolioHoldings.filter((h) => h.assetClassId === assetClass.id)
      const marketValue = classHoldings.reduce((sum, h) => sum + h.marketValue, 0)
      const invested = classHoldings.reduce((sum, h) => sum + h.invested, 0)
      const gain = marketValue - invested
      return {
        id: assetClass.id,
        name: assetClass.name,
        color: assetClass.color,
        marketValue,
        invested,
        gain,
        gainPct: invested > 0 ? (gain / invested) * 100 : 0,
        // Mantém a leitura de composição do patrimônio financeiro; a reserva é
        // mostrada como fatia própria na barra e não some silenciosamente.
        allocationPct: financialAssets > 0 ? (marketValue / financialAssets) * 100 : 0,
        holdings: classHoldings,
      }
    })
    .filter((summary) => summary.holdings.length > 0)

  const allOrphanClassIds = holdingSummaries
    .map((holding) => holding.assetClassId)
    .filter((id) => !classes.some((assetClass) => assetClass.id === id))
  const allOrderedClasses: InvestmentAssetClass[] = [
    ...classes,
    ...Array.from(new Set(allOrphanClassIds)).map((id, index) => ({
      id,
      name: 'Sem classe',
      color: DEFAULT_INVESTMENT_CLASSES[index % DEFAULT_INVESTMENT_CLASSES.length].color,
    })),
  ]
  const allClasses: AssetClassSummary[] = allOrderedClasses
    .map((assetClass) => {
      const classHoldings = holdingSummaries.filter(
        (holding) => holding.assetClassId === assetClass.id,
      )
      const marketValue = classHoldings.reduce((sum, holding) => sum + holding.marketValue, 0)
      const invested = classHoldings.reduce((sum, holding) => sum + holding.invested, 0)
      const gain = marketValue - invested
      return {
        id: assetClass.id,
        name: assetClass.name,
        color: assetClass.color,
        marketValue,
        invested,
        gain,
        gainPct: invested > 0 ? (gain / invested) * 100 : 0,
        allocationPct: holdingsMarketValue > 0 ? (marketValue / holdingsMarketValue) * 100 : 0,
        holdings: classHoldings,
      }
    })
    .filter((summary) => summary.holdings.length > 0)

  return {
    allHoldings: holdingSummaries,
    allClasses,
    holdingsMarketValue,
    financialInvested: holdingsInvested + goalsBalance,
    financialGain: totalGain + reserveGain,
    totalMarketValue,
    totalInvested,
    totalGain,
    totalGainPct: totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0,
    financialAssets,
    physicalAssets,
    grossAssets,
    liabilities,
    securedLiabilities,
    unsecuredLiabilities,
    financialNetWorth,
    netWorth,
    reserveBalance,
    goalsBalance,
    classes: classSummaries,
    reserveHoldings,
    reserveInvested,
    reserveGain,
    portfolioMarketValue: totalMarketValue,
  }
}
