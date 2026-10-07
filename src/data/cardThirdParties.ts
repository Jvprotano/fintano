import type { CardThirdParty, CreditCardEntry, MonthlySnapshot } from '../types'
import type { RepositoryDocument } from './repository'
import { uid } from '../lib/shared'
import { runRepositoryCommand } from './repositoryCommand'

/** A parte de terceiros nasce da compra; o usuário sempre paga a fatura. */
export function thirdPartiesForEntries(rows: CardThirdParty[], entries: CreditCardEntry[]): CardThirdParty[] {
  const result = [...rows]
  for (const entry of entries) {
    if (entry.entryType || !entry.accountId || !entry.dueMonth || entry.amount <= entry.personalAmount) continue
    const index = result.findIndex((row) => row.entryId === entry.id)
    const existing = result[index]
    const next: CardThirdParty = {
      id: existing?.id ?? `third-${entry.id}`, entryId: entry.id, accountId: entry.accountId,
      dueMonth: entry.dueMonth, description: entry.description, ownerName: entry.ownerName || entry.ownerNote || existing?.ownerName || 'Terceiro',
      amount: Math.round((entry.amount - entry.personalAmount) * 100) / 100, fundedBy: 'user',
      cashMonth: existing?.fundedBy === 'user' ? existing.cashMonth : entry.isPrepaid ? entry.cashCycleMonth ?? entry.dueMonth : entry.dueMonth,
      payments: existing?.payments ?? [],
    }
    if (index >= 0) result[index] = next
    else result.push(next)
  }
  return result
}

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
  return rows.flatMap((row) => {
    const entry = entries.find((entry) => entry.id === row.entryId)
    if (!entry) return row
    const amount = Math.round((entry.amount - entry.personalAmount) * 100) / 100
    if ((entry.entryType || amount <= 0) && row.payments.length === 0) return []
    if (entry.entryType || amount <= 0 || row.payments.reduce((sum, payment) => sum + payment.amount, 0) > amount + 0.005) {
      throw new Error('A parte de terceiros não pode ficar menor que o recebido. Desfaça os recebimentos antes de corrigir a compra.')
    }
    return { ...row, amount, accountId: entry.accountId!, dueMonth: entry.dueMonth!, description: entry.description, ownerName: entry.ownerName || row.ownerName }
  })
}

export function reimburseThirdParty(document: RepositoryDocument, id: string, amount: number, cycleMonth: string, occurredOn: string): RepositoryDocument {
  const rows = thirdPartiesForEntries(document.collections.cardThirdParties as CardThirdParty[] ?? [],
    document.collections.cardEntries as CreditCardEntry[] ?? [])
  const target = rows.find((row) => row.id === id)
  const received = target?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0
  if (!target || target.fundedBy !== 'user' || !Number.isFinite(amount) || amount <= 0 || amount > target.amount - received + 0.005 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(cycleMonth) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || !Number.isFinite(Date.parse(occurredOn)) || new Date(occurredOn).toISOString().slice(0, 10) !== occurredOn) throw new Error('Confira valor restante, data real e ciclo do reembolso.')
  const stored = document.collections.cardThirdParties as CardThirdParty[] ?? []
  return withThirdParties(document, [...stored.filter((row) => row.id !== id), { ...target,
    payments: [...target.payments, { id: uid(), amount, cycleMonth, occurredOn }],
  }])
}

export const recordReimbursement = (id: string, amount: number, cycleMonth: string, occurredOn: string) =>
  runRepositoryCommand({ id: uid(), apply: (document) => reimburseThirdParty(document, id, amount, cycleMonth, occurredOn) })

export const removeReimbursement = (id: string, paymentId: string) => runRepositoryCommand({ id: uid(), apply: (document) => {
  const rows = document.collections.cardThirdParties as CardThirdParty[] ?? []
  if (!rows.some((row) => row.id === id && row.payments.some((payment) => payment.id === paymentId))) return null
  return withThirdParties(document, rows.map((row) => row.id === id
    ? { ...row, payments: row.payments.filter((payment) => payment.id !== paymentId) } : row))
} })
