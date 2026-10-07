import type { CardThirdParty, CreditCardAccount, CreditCardEntry } from '../types'
import type { ParsedImportRow } from '../lib/cardImport'
import { normalizeCreditCardEntry, syncGeneratedNextEntries } from '../lib/creditCards'
import { withCardEntrySpendingMonth } from '../lib/cardCycleAccounting'
import { normalizeText, uid } from '../lib/shared'
import { runRepositoryCommand } from './repositoryCommand'
import { reconcileThirdParties, withThirdParties } from './cardThirdParties'

export interface ImportReview {
  accountId: string
  dueMonth: string
  rows: { line: number; description: string; status: string; duplicate: boolean; amount?: number }[]
  result: CreditCardEntry[]
  removed: CreditCardEntry[]
  added: number
  updated: number
  unchanged: number
  beforeTotal: number
  afterTotal: number
}

function identity(entry: Pick<CreditCardEntry, 'description' | 'purchaseDate' | 'installmentCurrent' | 'installmentTotal'>) {
  const date = entry.purchaseDate.replace(/\b(\d{1,2})\/(\d{1,2})\b/, (_, day: string, month: string) => `${day.padStart(2, '0')}/${month.padStart(2, '0')}`)
  return [normalizeText(entry.description), date, entry.installmentCurrent ?? '', entry.installmentTotal ?? ''].join('|')
}

export function reviewCardImport(report: ParsedImportRow[], all: CreditCardEntry[], account: CreditCardAccount, dueMonth: string, replace: boolean, ignored: number[] = [], allowDuplicate: number[] = []): ImportReview {
  const existing = all.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)
  const result: CreditCardEntry[] = replace ? [] : [...existing]
  const seen = new Set<string>()
  let added = 0, updated = 0, unchanged = 0
  const rows = report.map((row) => {
    if (!row.entry || ignored.includes(row.line)) return { line: row.line, description: row.description, status: row.reason ?? 'Ignorada por você', duplicate: false }
    const entry = row.entry
    const key = identity(entry)
    const matches = existing.filter((candidate) => !candidate.entryType && identity(candidate) === key)
    const repeated = seen.has(key)
    seen.add(key)
    const match = !repeated && matches.length === 1 ? matches[0] : undefined
    const exact = match && match.amount === entry.amount && match.personalAmount === entry.personalAmount && match.remainingAmount === entry.remainingAmount &&
      (!entry.ownerName || entry.ownerName === match.ownerName) && (!entry.budgetArea || entry.budgetArea === match.budgetArea) &&
      (entry.isRecurring === undefined || entry.isRecurring === Boolean(match.isRecurring)) && (entry.isPrepaid === undefined || entry.isPrepaid === Boolean(match.isPrepaid))
    const duplicate = repeated || matches.length > 1
    if (duplicate && !allowDuplicate.includes(row.line)) {
      if (replace) for (const old of matches) if (!result.some((candidate) => candidate.id === old.id)) result.push(old)
      return { line: row.line, description: entry.description, status: 'Possível duplicata — ignorada', duplicate: true, amount: entry.amount }
    }
    const incoming = withCardEntrySpendingMonth(normalizeCreditCardEntry({ ...match, ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)),
      description: entry.description, purchaseDate: entry.purchaseDate, amount: entry.amount, personalAmount: entry.personalAmount, remainingAmount: entry.remainingAmount,
      budgetArea: entry.budgetArea ?? match?.budgetArea, ownerName: entry.ownerName || match?.ownerName,
      id: match?.id ?? uid(), accountId: account.id, cardName: account.name, dueMonth,
      cycle: dueMonth === account.currentDueMonth ? 'current' : 'next',
    }), account.currentDueMonth ?? dueMonth)
    if (match) {
      if (exact) unchanged++; else updated++
      const index = result.findIndex((candidate) => candidate.id === match.id)
      if (index >= 0) result[index] = incoming; else result.push(incoming)
    } else { added++; result.push(incoming) }
    return { line: row.line, description: entry.description, status: match ? exact ? 'Já existe — preservada' : 'Alterada — mesma identidade' : 'Nova compra', duplicate, amount: entry.amount }
  })
  return { accountId: account.id, dueMonth, rows, result, removed: existing.filter((entry) => !result.some((row) => row.id === entry.id)),
    added, updated, unchanged, beforeTotal: existing.reduce((sum, entry) => sum + (entry.entryType ? -entry.amount : entry.amount), 0),
    afterTotal: result.reduce((sum, entry) => sum + (entry.entryType ? -entry.amount : entry.amount), 0) }
}

export function applyCardImport(review: ImportReview, expectedRevision: string | null) {
  return runRepositoryCommand({ id: uid(), expectedRevision, apply: (document) => {
    const account = (document.collections.cardAccounts as CreditCardAccount[] ?? []).find((row) => row.id === review.accountId)
    if (!account || !review.result.length) return null
    const entries = document.collections.cardEntries as CreditCardEntry[] ?? []
    const next = [...entries.filter((entry) => entry.accountId !== review.accountId || entry.dueMonth !== review.dueMonth), ...review.result]
    return withThirdParties({ ...document, collections: { ...document.collections,
      cardEntries: review.dueMonth === account.currentDueMonth ? [
        ...next.filter((entry) => entry.accountId !== account.id),
        ...syncGeneratedNextEntries(next.filter((entry) => entry.accountId === account.id), account.currentDueMonth),
      ] : next,
    } }, reconcileThirdParties(document.collections.cardThirdParties as CardThirdParty[] ?? [], next))
  } })
}
