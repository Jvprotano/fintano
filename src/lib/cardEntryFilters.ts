import type { BudgetArea } from '../types'
import type { CycleCardEntry } from './cardCycleView'
import { normalizeText } from './shared'

export interface CardEntryFilters {
  search: string
  accountId: string
  observation: string
  share: '' | 'mine' | 'others' | 'only-mine' | 'only-others' | 'shared'
  kind: '' | 'single' | 'installment' | 'recurring' | 'credit'
  area: '' | 'unclassified' | BudgetArea
  payment: '' | 'open' | 'paid' | 'prepaid'
  dateFrom: string
  dateTo: string
  minAmount: number | null
  maxAmount: number | null
}

export const EMPTY_CARD_FILTERS: CardEntryFilters = {
  search: '', accountId: '', observation: '', share: '', kind: '', area: '', payment: '',
  dateFrom: '', dateTo: '', minAmount: null, maxAmount: null,
}

/** Datas sem ano continuam sem ano; a competência não prova a data da compra. */
export function parseCardPurchaseDate(raw: string) {
  const text = raw.trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const br = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (!iso && !br) return null
  const day = Number(iso ? iso[3] : br![1])
  const month = Number(iso ? iso[2] : br![2])
  const year = iso ? Number(iso[1]) : br![3] ? Number(br![3]) : null
  const date = new Date(Date.UTC(year ?? 2000, month - 1, day))
  if ((year !== null && year < 1000) || date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null
  return { dayMonth: month * 100 + day, full: year === null ? null : year * 10000 + month * 100 + day }
}

export function cardFilterError(filters: CardEntryFilters): string | null {
  const from = parseCardPurchaseDate(filters.dateFrom)
  const to = parseCardPurchaseDate(filters.dateTo)
  if ((filters.dateFrom.trim() && !from) || (filters.dateTo.trim() && !to)) return 'Informe datas válidas em DD/MM ou DD/MM/AAAA.'
  if (from && to && (from.full === null) !== (to.full === null)) return 'Use o mesmo formato nas duas datas: ambas com ano ou ambas sem ano.'
  if (from?.full != null && to?.full != null && from.full > to.full) return 'A data final deve ser igual ou posterior à inicial.'
  if (filters.minAmount !== null && filters.maxAmount !== null && filters.minAmount > filters.maxAmount) return 'O valor máximo deve ser igual ou maior que o mínimo.'
  return null
}

export function filterCardEntries(entries: CycleCardEntry[], filters: CardEntryFilters): CycleCardEntry[] {
  if (cardFilterError(filters)) return []
  const words = normalizeText(filters.search).split(/\s+/).filter(Boolean)
  const observation = normalizeText(filters.observation)
  const from = parseCardPurchaseDate(filters.dateFrom)
  const to = parseCardPurchaseDate(filters.dateTo)
  const dated = !!(from || to)
  const withYear = from?.full != null || to?.full != null
  return entries.filter((entry) => {
    const credit = entry.entryType === 'invoiceCredit'
    const other = Math.round(entry.amount * 100) - Math.round(entry.personalAmount * 100)
    const personal = Math.round(entry.personalAmount * 100)
    const text = normalizeText(`${entry.description} ${entry.cardName} ${entry.ownerName ?? ''} ${entry.ownerNote ?? ''}`)
    if (words.some((word) => !text.includes(word))) return false
    if (filters.accountId && entry.accountId !== filters.accountId) return false
    if (observation && !normalizeText(`${entry.ownerName ?? ''} ${entry.ownerNote ?? ''}`).includes(observation)) return false
    if (filters.share && credit) return false
    if (filters.share === 'mine' && personal <= 0) return false
    if (filters.share === 'others' && other <= 0) return false
    if (filters.share === 'only-mine' && (personal <= 0 || other > 0)) return false
    if (filters.share === 'only-others' && (other <= 0 || personal > 0)) return false
    if (filters.share === 'shared' && (personal <= 0 || other <= 0)) return false
    const kind = credit ? 'credit' : entry.isRecurring ? 'recurring' : (entry.installmentTotal ?? 0) > 1 ? 'installment' : 'single'
    if (filters.kind && kind !== filters.kind) return false
    if (filters.area && (credit || (filters.area === 'unclassified' ? !!entry.budgetArea : entry.budgetArea !== filters.area))) return false
    if (filters.payment === 'open' && (entry.paidAt || entry.isPrepaid)) return false
    if (filters.payment === 'paid' && !entry.paidAt) return false
    if (filters.payment === 'prepaid' && (credit || !entry.isPrepaid)) return false
    const cents = Math.round(entry.amount * 100)
    if (filters.minAmount !== null && cents < Math.round(filters.minAmount * 100)) return false
    if (filters.maxAmount !== null && cents > Math.round(filters.maxAmount * 100)) return false
    if (dated) {
      const date = parseCardPurchaseDate(entry.purchaseDate)
      const value = withYear ? date?.full : date?.dayMonth
      if (value == null) return false
      const start = withYear ? from?.full : from?.dayMonth
      const end = withYear ? to?.full : to?.dayMonth
      // Sem ano, 20/12 a 10/01 representa um intervalo que cruza dezembro.
      if (start != null && end != null && start > end) {
        if (value < start && value > end) return false
      } else if ((start != null && value < start) || (end != null && value > end)) return false
    }
    return true
  })
}
