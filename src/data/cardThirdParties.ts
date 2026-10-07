import type { CardThirdParty, CreditCardEntry, MonthlySnapshot } from '../types'
import type { RepositoryDocument } from './repository'
import type { PaidInvoiceSnapshot } from '../lib/cardCycleAccounting'
import { uid } from '../lib/shared'
import { runRepositoryCommand } from './repositoryCommand'

export function withThirdParties(document: RepositoryDocument, rows: CardThirdParty[]): RepositoryDocument {
  const previous = document.collections.cardThirdParties as CardThirdParty[] ?? []
  const cash = (items: CardThirdParty[], month: string) => ({
    advanced: items.filter((row) => row.fundedBy === 'user' && row.cashMonth === month).reduce((sum, row) => sum + row.amount, 0),
    received: items.flatMap((row) => row.payments).filter((row) => row.cycleMonth === month).reduce((sum, row) => sum + row.amount, 0),
  })
  const history = (document.collections.history as MonthlySnapshot[] ?? []).map((snapshot) => {
    const before = cash(previous, snapshot.month), after = cash(rows, snapshot.month)
    const delta = after.received - after.advanced - before.received + before.advanced
    return before.advanced === after.advanced && before.received === after.received ? snapshot : { ...snapshot,
      thirdPartyAdvanced: after.advanced, reimbursementsReceived: after.received,
      balance: snapshot.balance + delta, cashLeftover: snapshot.cashLeftover + delta,
    }
  })
  return { ...document, collections: { ...document.collections, cardThirdParties: rows, ...(document.collections.history ? { history } : {}) } }
}

/** Ausência da compra não apaga um desembolso ou recebimento já confirmado. */
export function reconcileThirdParties(rows: CardThirdParty[], entries: CreditCardEntry[]): CardThirdParty[] {
  return rows.map((row) => {
    const entry = entries.find((entry) => entry.id === row.entryId)
    if (!entry) return row
    const amount = Math.round((entry.amount - entry.personalAmount) * 100) / 100
    if (entry.entryType || amount <= 0 || row.payments.reduce((sum, payment) => sum + payment.amount, 0) > amount + 0.005) {
      throw new Error('A alteração conflita com o adiantamento registrado. Revise Terceiros antes de mudar o rateio.')
    }
    return { ...row, amount, accountId: entry.accountId!, dueMonth: entry.dueMonth!, description: entry.description, ownerName: entry.ownerName || row.ownerName }
  })
}

export function setThirdPartyFunding(document: RepositoryDocument, entryId: string, fundedBy: CardThirdParty['fundedBy'], cashMonth: string): RepositoryDocument {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cashMonth)) throw new Error('Informe o ciclo do desembolso.')
  const statements = document.collections.cardPaidInvoices as PaidInvoiceSnapshot[] ?? []
  const entries = [...(document.collections.cardEntries as CreditCardEntry[] ?? []), ...statements.flatMap((row) => row.entries ?? [])]
  const entry = entries.find((row) => row.id === entryId)
  if (!entry?.accountId || !entry.dueMonth || entry.entryType || entry.amount <= entry.personalAmount || !['user', 'third_party'].includes(fundedBy)) throw new Error('Compra dividida não encontrada.')
  const rows = document.collections.cardThirdParties as CardThirdParty[] ?? []
  const existing = rows.find((row) => row.entryId === entryId)
  const amount = Math.round((entry.amount - entry.personalAmount) * 100) / 100
  const received = existing?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0
  if (received > amount + 0.005 || fundedBy === 'third_party' && received > 0) throw new Error('Corrija os reembolsos antes de alterar quem financiou a compra.')
  const next: CardThirdParty = { id: existing?.id ?? uid(), entryId, accountId: entry.accountId, dueMonth: entry.dueMonth,
    cashMonth, description: entry.description, ownerName: entry.ownerName || 'Terceiro', amount, fundedBy, payments: existing?.payments ?? [] }
  return withThirdParties(document, [...rows.filter((row) => row.entryId !== entryId), next])
}

export function reimburseThirdParty(document: RepositoryDocument, id: string, amount: number, cycleMonth: string, occurredOn: string): RepositoryDocument {
  const rows = document.collections.cardThirdParties as CardThirdParty[] ?? []
  const target = rows.find((row) => row.id === id)
  const received = target?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0
  if (!target || target.fundedBy !== 'user' || !Number.isFinite(amount) || amount <= 0 || amount > target.amount - received + 0.005 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(cycleMonth) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || !Number.isFinite(Date.parse(occurredOn)) || new Date(occurredOn).toISOString().slice(0, 10) !== occurredOn) throw new Error('Confira valor restante, data real e ciclo do reembolso.')
  return withThirdParties(document, rows.map((row) => row.id === id ? { ...row,
    payments: [...row.payments, { id: uid(), amount, cycleMonth, occurredOn }],
  } : row))
}

export const recordThirdPartyFunding = (entryId: string, fundedBy: CardThirdParty['fundedBy'], cashMonth: string) =>
  runRepositoryCommand({ id: uid(), apply: (document) => setThirdPartyFunding(document, entryId, fundedBy, cashMonth) })
export const recordReimbursement = (id: string, amount: number, cycleMonth: string, occurredOn: string) =>
  runRepositoryCommand({ id: uid(), apply: (document) => reimburseThirdParty(document, id, amount, cycleMonth, occurredOn) })

export const removeThirdPartyFunding = (id: string) => runRepositoryCommand({ id: uid(), apply: (document) => {
  const rows = document.collections.cardThirdParties as CardThirdParty[] ?? []
  const row = rows.find((row) => row.id === id)
  if (!row || row.payments.length) throw new Error('Desfaça as devoluções antes de remover o adiantamento.')
  return withThirdParties(document, rows.filter((row) => row.id !== id))
} })

export const removeReimbursement = (id: string, paymentId: string) => runRepositoryCommand({ id: uid(), apply: (document) => {
  const rows = document.collections.cardThirdParties as CardThirdParty[] ?? []
  if (!rows.some((row) => row.id === id && row.payments.some((payment) => payment.id === paymentId))) return null
  return withThirdParties(document, rows.map((row) => row.id === id
    ? { ...row, payments: row.payments.filter((payment) => payment.id !== paymentId) } : row))
} })
