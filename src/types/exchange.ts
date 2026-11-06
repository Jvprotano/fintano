export type GoalCurrency = 'BRL' | 'EUR' | 'USD'
export type ForeignCurrency = Exclude<GoalCurrency, 'BRL'>

export interface ExchangeQuote {
  rate: number
  date: string
  fetchedAt: string
}

export interface CurrencyExchangeSettings {
  reference?: ExchangeQuote
  /** Custo efetivo informado pelo usuário, já incluindo tarifas e tributos. */
  manualRate?: number
  manualUpdatedAt?: string
  /** Acréscimo estimado sobre a referência automática; não incide no custo manual. */
  costsPct: number
}

export interface ExchangeSettings {
  autoUpdate: boolean
  currencies: Record<ForeignCurrency, CurrencyExchangeSettings>
}
