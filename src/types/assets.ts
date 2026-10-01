export type AssetKind = 'imovel' | 'veiculo' | 'outros'

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  value: number
  annualAppreciationPct: number
  rentEquivalent?: number
  createdAt: string
  note?: string
  archivedAt?: string
}

export interface AssetSummary extends Asset {
  linkedDebt: number
  equity: number
  equityPct: number
  installment: number
  monthlyInterest: number
  hasDebt: boolean
}

export interface AssetsSummary {
  totalValue: number
  totalLinkedDebt: number
  totalEquity: number
  assets: AssetSummary[]
}

export interface HousingComparison {
  installment: number
  monthlyInterest: number
  amortization: number
  rentEquivalent: number
  monthlyAppreciation: number
  ownershipCost: number
  difference: number
}
