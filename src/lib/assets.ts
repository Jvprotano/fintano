import type {
  Asset,
  AssetKind,
  AssetsSummary,
  AssetSummary,
  DebtSummary,
  HousingComparison,
} from '../types'
import { ASSET_KINDS } from '../types/constants'
import { finiteNumber, nowIso, uid } from './shared'

// ---------------------------------------------------------------------------
// Bens.
//
// Um financiamento sem o bem do outro lado não é dívida: é um erro de balanço.
// Você não ficou R$ 260 mil mais pobre ao comprar a casa — trocou dinheiro por
// imóvel e assumiu um passivo do mesmo tamanho. O patrimônio líquido só voltou
// a fazer sentido quando as duas pontas existem.
//
// E a parcela não é toda despesa. Só os juros são; a amortização é dinheiro
// saindo da conta e entrando na parede. É isso que `housingComparison` mede.
// ---------------------------------------------------------------------------

const KINDS: AssetKind[] = ASSET_KINDS.map((item) => item.key)

export function defaultAppreciationFor(kind: AssetKind): number {
  return ASSET_KINDS.find((item) => item.key === kind)?.defaultAppreciationPct ?? 0
}

export function normalizeAsset(raw: Partial<Asset> | undefined): Asset {
  const kind: AssetKind = KINDS.includes(raw?.kind as AssetKind) ? (raw?.kind as AssetKind) : 'outros'
  const rentEquivalent = Math.max(0, finiteNumber(raw?.rentEquivalent))

  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Bem',
    kind,
    value: Math.max(0, finiteNumber(raw?.value)),
    // Um bem pode desvalorizar: o intervalo é assimétrico de propósito.
    annualAppreciationPct: Math.max(
      -50,
      Math.min(30, finiteNumber(raw?.annualAppreciationPct, defaultAppreciationFor(kind))),
    ),
    rentEquivalent: rentEquivalent > 0 ? rentEquivalent : undefined,
    createdAt: raw?.createdAt || nowIso(),
    note: raw?.note?.trim() || undefined,
    archivedAt: raw?.archivedAt && Number.isFinite(Date.parse(raw.archivedAt)) ? raw.archivedAt : undefined,
  }
}

/**
 * Um bem com as dívidas que apontam para ele. A ligação mora na dívida
 * (`linkedAssetId`), então o bem continua identificável quando arquivado.
 */
export function summarizeAsset(asset: Asset, debts: DebtSummary[] = []): AssetSummary {
  const linked = debts.filter((debt) => debt.linkedAssetId === asset.id && !debt.isSettled)
  const linkedDebt = linked.reduce((sum, debt) => sum + debt.balance, 0)
  const equity = asset.value - linkedDebt

  return {
    ...asset,
    linkedDebt,
    equity,
    equityPct: asset.value > 0 ? (equity / asset.value) * 100 : 0,
    installment: linked.reduce((sum, debt) => sum + debt.installment, 0),
    monthlyInterest: linked.reduce((sum, debt) => sum + debt.monthlyInterest, 0),
    hasDebt: linkedDebt > 0,
  }
}

export function calculateAssetsSummary(
  assets: Asset[],
  debts: DebtSummary[] = [],
): AssetsSummary {
  const summaries = assets.map((asset) => summarizeAsset(asset, debts))
  const totalValue = summaries.reduce((sum, asset) => sum + asset.value, 0)
  const totalLinkedDebt = summaries.reduce((sum, asset) => sum + asset.linkedDebt, 0)

  return {
    totalValue,
    totalLinkedDebt,
    totalEquity: totalValue - totalLinkedDebt,
    assets: summaries,
  }
}

/**
 * Ser dono contra alugar, neste mês. A parcela inteira não entra: a
 * amortização não é despesa, é poupança forçada. Sobra o juro, de onde se
 * desconta a valorização esperada do bem — o resto é o preço de morar aqui.
 */
export function housingComparison(
  asset: Pick<AssetSummary, 'value' | 'annualAppreciationPct' | 'rentEquivalent' | 'installment' | 'monthlyInterest'>,
): HousingComparison | null {
  const rentEquivalent = asset.rentEquivalent ?? 0
  if (rentEquivalent <= 0 || asset.installment <= 0) return null

  const monthlyAppreciationRate = Math.pow(1 + asset.annualAppreciationPct / 100, 1 / 12) - 1
  const monthlyAppreciation = asset.value * monthlyAppreciationRate
  const ownershipCost = asset.monthlyInterest - monthlyAppreciation

  return {
    installment: asset.installment,
    monthlyInterest: asset.monthlyInterest,
    amortization: Math.max(0, asset.installment - asset.monthlyInterest),
    rentEquivalent,
    monthlyAppreciation,
    ownershipCost,
    difference: ownershipCost - rentEquivalent,
  }
}

/** Um mês de valorização — o espelho de `advanceDebtMonth` do lado do ativo. */
export function advanceAssetMonth(value: number, annualAppreciationPct: number): number {
  const monthlyRate = Math.pow(1 + annualAppreciationPct / 100, 1 / 12) - 1
  return Math.max(0, value * (1 + monthlyRate))
}
