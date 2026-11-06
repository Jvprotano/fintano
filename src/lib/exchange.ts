import type { ExchangeQuote, ExchangeSettings, ForeignCurrency, GoalCurrency } from '../types/exchange'

export const FOREIGN_CURRENCIES: ForeignCurrency[] = ['EUR', 'USD']
export const CURRENCY_LABELS: Record<GoalCurrency, string> = { BRL: 'Real', EUR: 'Euro', USD: 'Dólar americano' }
export const CURRENCY_SYMBOLS: Record<GoalCurrency, string> = { BRL: 'R$', EUR: '€', USD: 'US$' }
export const EXCHANGE_SOURCE_URL = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao'
export const DEFAULT_EXCHANGE_SETTINGS: ExchangeSettings = {
  autoUpdate: true,
  currencies: { EUR: { costsPct: 0 }, USD: { costsPct: 0 } },
}

export function validExchangeDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

const positiveRate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

export function normalizeExchangeSettings(raw?: Partial<ExchangeSettings>): ExchangeSettings {
  const currencies = Object.fromEntries(FOREIGN_CURRENCIES.map((currency) => {
    const row = raw?.currencies?.[currency]
    const quote = row?.reference
    return [currency, {
      costsPct: typeof row?.costsPct === 'number' && Number.isFinite(row.costsPct) ? Math.min(100, Math.max(0, row.costsPct)) : 0,
      ...(positiveRate(row?.manualRate) ? { manualRate: row.manualRate, manualUpdatedAt: row.manualUpdatedAt } : {}),
      ...(quote && positiveRate(quote.rate) && validExchangeDate(quote.date) && Number.isFinite(Date.parse(quote.fetchedAt))
        ? { reference: { rate: quote.rate, date: quote.date, fetchedAt: quote.fetchedAt } } : {}),
    }]
  })) as ExchangeSettings['currencies']
  return { autoUpdate: raw?.autoUpdate !== false, currencies }
}

export function effectiveExchangeRate(currency: GoalCurrency = 'BRL', settings?: ExchangeSettings): number | null {
  if (currency === 'BRL') return 1
  const row = settings?.currencies[currency]
  if (positiveRate(row?.manualRate)) return row.manualRate
  return row?.reference ? row.reference.rate * (1 + row.costsPct / 100) : null
}

export function exchangeQuoteIsOld(date?: string, now = Date.now()): boolean {
  return !date || now - Date.parse(date.length === 10 ? `${date}T12:00:00-03:00` : date) > 4 * 86_400_000
}

export function exchangeDateLabel(value?: string): string {
  if (!value) return 'data desconhecida'
  return value.includes('T') ? new Date(value).toLocaleDateString('pt-BR') : value.split('-').reverse().join('/')
}

export function goalTargetInBrl(goal: { targetAmount: number; currency?: GoalCurrency; marginPct?: number }, settings?: ExchangeSettings): number | null {
  const rate = effectiveExchangeRate(goal.currency, settings)
  if (rate === null) return null
  return Math.round(goal.targetAmount * rate * (1 + (goal.currency && goal.currency !== 'BRL' ? goal.marginPct ?? 0 : 0) / 100) * 100) / 100
}

/** PTAX de venda do último fechamento disponível, em reais por unidade estrangeira. */
export async function fetchExchangeQuote(currency: ForeignCurrency, now = new Date()): Promise<ExchangeQuote> {
  const date = (value: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: '2-digit', day: '2-digit', year: 'numeric' }).format(value).replaceAll('/', '-')
  const params = new URLSearchParams({
    '@moeda': `'${currency}'`, '@dataInicial': `'${date(new Date(now.getTime() - 15 * 86_400_000))}'`,
    '@dataFinalCotacao': `'${date(now)}'`, '$filter': "tipoBoletim eq 'Fechamento'",
    '$orderby': 'dataHoraCotacao desc', '$top': '1', '$format': 'json',
  })
  // O parser OData do BCB exige %20 para espaços; o '+' de URLSearchParams gera erro 400.
  const query = params.toString().replaceAll('+', '%20')
  const response = await fetch(`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${query}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Banco Central indisponível para ${currency} (HTTP ${response.status}).`)
  const data = await response.json() as { value?: { cotacaoVenda?: number; dataHoraCotacao?: string; tipoBoletim?: string }[] }
  const row = data.value?.[0]
  const asOf = row?.dataHoraCotacao?.slice(0, 10)
  if (!row || row.tipoBoletim !== 'Fechamento' || !positiveRate(row.cotacaoVenda) || !validExchangeDate(asOf) || asOf > now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })) {
    throw new Error(`O Banco Central não retornou uma cotação válida para ${currency}.`)
  }
  return { rate: row.cotacaoVenda, date: asOf, fetchedAt: now.toISOString() }
}
