import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { Asset, CostItem, Debt, DebtKind } from '../types'
import { calculateDebtsSummary, normalizeDebt } from '../lib/debts'
import { finiteNumber, ledgerBalance, nowIso, uid } from '../lib/shared'

/**
 * Dívidas. Recebe os custos do cenário ativo só para conferir se a parcela
 * cadastrada aqui bate com o custo fixo que a representa no orçamento — a
 * parcela continua saindo do orçamento, não daqui. E recebe os bens para saber
 * quais dívidas têm contrapartida: um financiamento com a casa do outro lado
 * não é a mesma coisa que um rotativo.
 */
export function useDebts(costs: CostItem[] = [], assets: Asset[] = []) {
  const [stored, setStored] = useRepositoryState<Debt[]>('debts', [])
  const debts = useMemo(
    () => (Array.isArray(stored) ? stored.map(normalizeDebt) : []),
    [stored],
  )

  const addDebt = useCallback(
    (input: {
      name: string
      kind: DebtKind
      balance: number
      monthlyRatePct: number
      installment: number
      remainingInstallments?: number
      linkedCostId?: string
      linkedAssetId?: string
    }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return false
      return setStored((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeDebt({ ...input, name: trimmed, id: uid(), createdAt: nowIso(), transactions: [] }),
      ])
    },
    [setStored],
  )

  const updateDebt = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          Debt,
          | 'name'
          | 'kind'
          | 'balance'
          | 'monthlyRatePct'
          | 'installment'
          | 'remainingInstallments'
          | 'linkedCostId'
          | 'linkedAssetId'
        >
      >,
    ) => {
      setStored((prev) =>
        prev.map((debt) => (debt.id === id ? normalizeDebt({ ...debt, ...patch }) : debt)),
      )
    },
    [setStored],
  )

  const removeDebt = useCallback(
    (id: string) => setStored((prev) => prev.filter((debt) => debt.id !== id)),
    [setStored],
  )

  /**
   * Movimenta o saldo. Negativo = amortização (limitada ao saldo devedor);
   * positivo = saldo que cresceu. O saldo acompanha a movimentação, como o
   * valor de mercado de uma posição acompanha o aporte.
   */
  const addDebtTransaction = useCallback(
    (id: string, amount: number, note?: string) => {
      return setStored((prev) =>
        prev.map((debt) => {
          if (debt.id !== id) return debt
          const delta = amount < 0 ? -Math.min(-amount, debt.balance) : amount
          if (delta === 0) return debt
          const balance = Math.max(0, debt.balance + delta)
          return {
            ...debt,
            balance,
            transactions: [
              ...debt.transactions,
              { id: uid(), amount: delta, date: nowIso(), note: note?.trim() || undefined },
            ],
            settledAt: balance <= 0 ? (debt.settledAt ?? nowIso()) : undefined,
          }
        }),
      )
    },
    [setStored],
  )

  const removeDebtTransaction = useCallback(
    (debtId: string, transactionId: string) => {
      setStored((prev) =>
        prev.map((debt) => {
          if (debt.id !== debtId) return debt
          const removed = debt.transactions.find((tx) => tx.id === transactionId)
          if (!removed) return debt
          // Desfaz o efeito da movimentação sobre o saldo.
          return {
            ...debt,
            balance: Math.max(0, debt.balance - removed.amount),
            transactions: debt.transactions.filter((tx) => tx.id !== transactionId),
          }
        }),
      )
    },
    [setStored],
  )

  /** Define o saldo devedor direto, sem registrar movimentação (extrato novo). */
  const setDebtBalance = useCallback(
    (id: string, balance: number) => {
      setStored((prev) =>
        prev.map((debt) =>
          debt.id === id ? { ...debt, balance: Math.max(0, finiteNumber(balance)) } : debt,
        ),
      )
    },
    [setStored],
  )

  const summary = useMemo(
    () => calculateDebtsSummary(debts, costs, assets),
    [debts, costs, assets],
  )

  /** Total já amortizado, somando as saídas de todos os livros-razão. */
  const totalAmortized = useMemo(
    () =>
      debts.reduce(
        (sum, debt) => sum + Math.max(0, -ledgerBalance(debt.transactions.filter((tx) => tx.amount < 0))),
        0,
      ),
    [debts],
  )

  return {
    debts,
    summary,
    totalAmortized,
    addDebt,
    updateDebt,
    removeDebt,
    addDebtTransaction,
    removeDebtTransaction,
    setDebtBalance,
  }
}
