export function formatCurrency(value: number | null, currency = 'BRL'): string {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
}

/** Versão curta para eixos de gráfico: R$ 12,5 mil. */
export function formatCurrencyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(value))}`
}

export function formatMonths(months: number): string {
  if (months <= 1) return '1 mês'
  if (months < 12) return `${months} meses`
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) return years === 1 ? '1 ano' : `${years} anos`
  return `${years}a ${remainingMonths}m`
}

const MONTH_NAMES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/** AAAA-MM → "jul/26". */
export function formatMonthKey(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  if (!year || !monthIndex) return month
  return `${MONTH_NAMES[monthIndex - 1]}/${String(year).slice(2)}`
}

/** AAAA-MM → "Julho de 2026". */
export function formatMonthLong(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  if (!year || !monthIndex) return month
  const date = new Date(year, monthIndex - 1, 1)
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export const inputClass =
  'app-field w-full px-3 py-2.5 text-sm placeholder:text-dark-text-muted'

export const selectClass = inputClass
