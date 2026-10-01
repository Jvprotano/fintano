import type { Debt, FinancialGoal, InvestmentHolding, LedgerEntryKind } from '../types'
import { uid } from '../lib/shared'
import { runRepositoryCommand } from './repositoryCommand'

type Owner = 'holding' | 'goal' | 'debt'

/** Reclassificação explícita de um legado ambíguo; datas e valor permanecem intactos. */
export function resolveLegacyLedgerKind(
  owner: Owner, ownerId: string, entryId: string, kind: LedgerEntryKind,
): boolean {
  if (kind !== 'opening_balance' &&
    kind !== (owner === 'debt' ? 'balance_increase' : 'contribution')) return false
  return runRepositoryCommand({ id: uid(), apply: (document) => {
    const collection = owner === 'holding' ? 'investmentHoldings' : owner === 'goal' ? 'goals' : 'debts'
    const raw = document.collections[collection]
    if (!Array.isArray(raw)) return null
    const items = raw as Array<InvestmentHolding | FinancialGoal | Debt>
    const target = items.find((item) => item.id === ownerId)
    const entry = target?.transactions?.find((item) => item.id === entryId)
    if (!entry || entry.kindSource !== 'legacy_ambiguous' || entry.amount <= 0) return null
    return { ...document, collections: { ...document.collections, [collection]: items.map((item) =>
      item.id === ownerId ? { ...item, transactions: item.transactions.map((tx) =>
        tx.id === entryId ? { ...tx, kind, kindSource: 'user' as const } : tx,
      ) } : item,
    ) } }
  } }).ok
}
