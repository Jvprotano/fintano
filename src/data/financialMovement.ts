import type { Debt, FinancialGoal, LedgerEntry, MonthlySnapshot } from '../types'
import { normalizeHolding, type FinancialHolding } from '../lib/investments'
import { normalizeGoal } from '../lib/goals'
import { normalizeDebt } from '../lib/debts'
import { ledgerBalance, ledgerEntryCycleMonth, ledgerOperationDates, normalizeLedger, uid } from '../lib/shared'
import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'

export type MovementOwner = 'holding' | 'goal' | 'reserve' | 'debt'
export type MovementEndpoint = { type: MovementOwner; id: string } | { type: 'account' }
export interface MovementInput {
  source: MovementEndpoint
  destination: MovementEndpoint
  amount: number
  month: string
  occurredOn: string
  note?: string
  linkedCostId?: string
}

type LedgerOwner = { label: string; transactions: LedgerEntry[]; balance: number; set: (entries: LedgerEntry[], balance: number) => void }

/** Rever uma operação também revê o caixa do fechamento, sem alterar sua marca patrimonial. */
function refreshMovementHistory(previous: RepositoryDocument, next: RepositoryDocument): RepositoryDocument {
  if (!next.collections.history) return next
  const facts = (doc: RepositoryDocument, month: string) => {
    const assets = [...(doc.collections.investmentHoldings as FinancialHolding[] ?? []), ...(doc.collections.goals as FinancialGoal[] ?? [])]
    const reserve = doc.collections.emergencyFund as { transactions?: LedgerEntry[] } | undefined
    const direct = [...assets.flatMap((row) => row.transactions), ...(reserve?.transactions ?? [])].filter((tx) => tx.operationId && ledgerEntryCycleMonth(tx) === month && (tx.kind === 'contribution' || tx.kind === 'withdrawal')).reduce((sum, tx) => sum + tx.amount, 0)
    const payments = (doc.collections.debts as Debt[] ?? []).flatMap((row) => row.transactions.filter((tx) => tx.operationId && tx.kind === 'amortization' && tx.cashTreatment === 'extra' && ledgerEntryCycleMonth(tx) === month)
      .map((tx) => ({ id: tx.id, name: `Amortização · ${row.name}`, amount: -tx.amount })))
    return { direct, payments, debt: payments.reduce((sum, row) => sum + row.amount, 0) }
  }
  const history = (next.collections.history as MonthlySnapshot[]).map((snapshot) => {
    const before = facts(previous, snapshot.month), after = facts(next, snapshot.month)
    const deltaDirect = after.direct - before.direct, deltaDebt = after.debt - before.debt
    if (!deltaDirect && !deltaDebt) return snapshot
    const invested = snapshot.invested + deltaDirect
    return { ...snapshot, directInvestedAtClose: snapshot.directInvestedAtClose + deltaDirect, invested,
      extraExpense: snapshot.extraExpense + deltaDebt,
      extraExpenseEntries: [...snapshot.extraExpenseEntries.filter((row) => !before.payments.some((payment) => payment.id === row.id)), ...after.payments],
      balance: snapshot.balance - deltaDirect - deltaDebt,
      cashLeftover: snapshot.cashLeftover - deltaDirect - deltaDebt,
      savingsRate: snapshot.availableForBudget + snapshot.extraIncome > 0 ? invested / (snapshot.availableForBudget + snapshot.extraIncome) * 100 : 0,
    }
  })
  return { ...next, collections: { ...next.collections, history } }
}

function owner(document: RepositoryDocument, endpoint: MovementEndpoint, allowArchived = false): LedgerOwner | null {
  if (endpoint.type === 'account') return null
  const collections = document.collections
  if (endpoint.type === 'reserve') {
    const fund = collections.emergencyFund as { current: number; transactions: LedgerEntry[] } | undefined
    if (!fund) throw new Error('Reserva não encontrada.')
    return { label: 'Reserva', transactions: normalizeLedger(fund.transactions), balance: fund.current,
      set: (transactions, balance) => { collections.emergencyFund = { ...fund, transactions, current: balance } } }
  }
  const collection = endpoint.type === 'holding' ? 'investmentHoldings' : endpoint.type === 'goal' ? 'goals' : 'debts'
  const rows = Array.isArray(collections[collection]) ? collections[collection] as (FinancialHolding | FinancialGoal | Debt)[] : []
  const index = rows.findIndex((row) => row.id === endpoint.id)
  if (index < 0 || rows[index].archivedAt && !allowArchived) throw new Error('Destino ou origem indisponível.')
  const row = endpoint.type === 'holding' ? normalizeHolding(rows[index] as FinancialHolding)
    : endpoint.type === 'goal' ? normalizeGoal(rows[index] as FinancialGoal, index) : normalizeDebt(rows[index] as Debt)
  if (endpoint.type === 'goal' && (row as FinancialGoal).kind === 'tracking' && !allowArchived) throw new Error('Esta meta apenas acompanha patrimônio.')
  const balance = endpoint.type === 'holding' ? (row as FinancialHolding).marketValue
    : endpoint.type === 'debt' ? (row as Debt).balance : ledgerBalance(row.transactions)
  return { label: row.name, transactions: row.transactions, balance, set: (transactions, nextBalance) => {
    const latest = document.collections[collection] as typeof rows
    document.collections[collection] = latest.map((item, i) => i !== index ? item : {
      ...row, transactions,
      ...(endpoint.type === 'holding' ? { marketValue: nextBalance }
        : endpoint.type === 'debt' ? { balance: nextBalance, settledAt: nextBalance === 0 ? new Date().toISOString() : undefined }
        : { completedAt: (row as FinancialGoal).targetAmount > 0 && nextBalance >= (row as FinancialGoal).targetAmount ? (row as FinancialGoal).completedAt ?? new Date().toISOString() : undefined }),
    })
  } }
}

export function moveInDocument(document: RepositoryDocument, input: MovementInput, operationId = uid()): RepositoryDocument {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100)) || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 0.00001 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || !/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) ||
    !Number.isFinite(Date.parse(input.occurredOn)) || new Date(input.occurredOn).toISOString().slice(0, 10) !== input.occurredOn) throw new Error('Informe valor, data real e ciclo válidos.')
  if (JSON.stringify(input.source) === JSON.stringify(input.destination) || input.source.type === 'debt') throw new Error('Escolha origem e destino diferentes.')
  const next = structuredClone(document)
  const source = owner(next, input.source)
  const destination = owner(next, input.destination)
  if (source && source.balance + 0.005 < input.amount) throw new Error('Saldo insuficiente na origem.')
  if (input.destination.type === 'debt' && destination!.balance + 0.005 < input.amount) throw new Error('O valor excede o saldo devedor.')
  if (input.linkedCostId) {
    const debt = (next.collections.debts as Debt[]).find((debt) => input.destination.type === 'debt' && debt.id === input.destination.id)
    if (debt?.linkedCostId !== input.linkedCostId) throw new Error('A parcela deve pertencer ao custo vinculado a esta dívida.')
    const months = next.collections.actuals as { month: string; costs: Record<string, number> }[] | undefined
    const paid = months?.find((month) => month.month === input.month)?.costs[input.linkedCostId] ?? 0
    const allocated = (next.collections.debts as Debt[]).flatMap((debt) => debt.transactions)
      .filter((tx) => tx.linkedCostId === input.linkedCostId && tx.cycleMonth === input.month).reduce((sum, tx) => sum - tx.amount, 0)
    if (input.source.type !== 'account' || input.destination.type !== 'debt' || paid < input.amount + allocated - 0.005) throw new Error('Confirme a parcela no Ciclo antes de registrar sua amortização.')
  }
  const metadata = { operationId, cycleMonth: input.month, ...ledgerOperationDates(input.occurredOn), kindSource: 'user' as const, note: input.note?.trim() || `${source?.label ?? 'Conta'} → ${destination?.label ?? 'Conta'}` }
  if (source) source.set([...source.transactions, { ...metadata, id: uid(), amount: -input.amount,
    kind: input.destination.type === 'account' || input.destination.type === 'debt' ? 'withdrawal' : 'transfer_out' }], source.balance - input.amount)
  if (destination) destination.set([...destination.transactions, { ...metadata, id: uid(),
    amount: input.destination.type === 'debt' ? -input.amount : input.amount,
    kind: input.destination.type === 'debt' ? 'amortization' : input.source.type === 'account' ? 'contribution' : 'transfer_in',
    ...(input.destination.type === 'debt' ? { cashTreatment: input.linkedCostId ? 'planned_cost' as const : 'extra' as const, linkedCostId: input.linkedCostId } : {}),
  }], destination.balance + (input.destination.type === 'debt' ? -input.amount : input.amount))
  return refreshMovementHistory(document, next)
}

export function undoMovement(document: RepositoryDocument, operationId: string): RepositoryDocument {
  const next = structuredClone(document)
  const endpoints: MovementEndpoint[] = [
    ...(next.collections.investmentHoldings as FinancialHolding[] ?? []).map((row) => ({ type: 'holding' as const, id: row.id })),
    ...(next.collections.goals as FinancialGoal[] ?? []).map((row) => ({ type: 'goal' as const, id: row.id })),
    ...(next.collections.debts as Debt[] ?? []).map((row) => ({ type: 'debt' as const, id: row.id })),
    ...(next.collections.emergencyFund ? [{ type: 'reserve' as const, id: 'reserve' }] : []),
  ]
  for (const endpoint of endpoints) {
    const collection = endpoint.type === 'holding' ? 'investmentHoldings' : endpoint.type === 'goal' ? 'goals' : endpoint.type === 'debt' ? 'debts' : 'emergencyFund'
    const candidate = endpoint.type === 'reserve' ? next.collections.emergencyFund as { transactions: LedgerEntry[] }
      : (next.collections[collection] as { id: string; transactions: LedgerEntry[] }[]).find((row) => row.id === (endpoint as { id: string }).id)
    if (!candidate?.transactions.some((tx) => tx.operationId === operationId)) continue
    // Uma origem arquivada continua precisando ser restaurada antes de alterar seu livro.
    const target = owner(next, endpoint, true)!
    const delta = target.transactions.filter((tx) => tx.operationId === operationId).reduce((sum, tx) => sum + tx.amount, 0)
    if (target.balance - delta < -0.005) throw new Error('O destino já utilizou esse saldo. Reponha-o antes de desfazer.')
    target.set(target.transactions.filter((tx) => tx.operationId !== operationId), target.balance - delta)
  }
  return refreshMovementHistory(document, next)
}

export const recordMovement = (input: MovementInput, expectedRevision?: string | null) => runRepositoryCommand({
  id: uid(), expectedRevision, apply: (document) => moveInDocument(document, input),
})

export function recordAssetMove(type: 'holding' | 'goal' | 'reserve', id: string, amount: number, month: string, occurredOn?: string, note?: string): boolean {
  const now = new Date()
  const day = occurredOn ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const asset = { type, id }
  return recordMovement({ source: amount > 0 ? { type: 'account' } : asset,
    destination: amount > 0 ? asset : { type: 'account' }, amount: Math.abs(amount), month, occurredOn: day, note }).ok
}

export function removeLinkedMovement(type: MovementOwner, ownerId: string, entryId: string): boolean | null {
  let found = false
  const result = runRepositoryCommand({ id: uid(), apply: (document) => {
    const target = owner(structuredClone(document), { type, id: ownerId }, true)
    const entry = target?.transactions.find((tx) => tx.id === entryId)
    if (!entry?.operationId) return null
    found = true
    return undoMovement(document, entry.operationId)
  } })
  return found ? result.ok : null
}

export function changeLinkedMovementCycle(type: MovementOwner, ownerId: string, entryId: string, month: string): boolean | null {
  let found = false
  const result = runRepositoryCommand({ id: uid(), apply: (document) => {
    const target = owner(structuredClone(document), { type, id: ownerId }, true)
    const entry = target?.transactions.find((tx) => tx.id === entryId)
    if (!entry?.operationId) return null
    found = true
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || entry.cashTreatment === 'planned_cost') return null
    const next = structuredClone(document)
    for (const collection of ['investmentHoldings', 'goals', 'debts'] as const) {
      next.collections[collection] = (next.collections[collection] as { transactions: LedgerEntry[] }[] ?? []).map((row) => ({ ...row,
        transactions: row.transactions.map((tx) => tx.operationId === entry.operationId ? { ...tx, cycleMonth: month } : tx),
      }))
    }
    if (next.collections.emergencyFund) {
      const fund = next.collections.emergencyFund as { transactions: LedgerEntry[] }
      fund.transactions = fund.transactions.map((tx) => tx.operationId === entry.operationId ? { ...tx, cycleMonth: month } : tx)
    }
    return refreshMovementHistory(document, next)
  } })
  return found ? result.ok : null
}
