import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { CostItem, ExtraIncomeEntry, MonthlyActuals, WantItem } from '../types'
import { normalizeActuals, summarizeActuals } from '../lib/actuals'
import { monthKey, uid } from '../lib/shared'

type CashEntryField = 'extraIncome' | 'extraExpenses'

const sortMonths = (items: MonthlyActuals[]) =>
  items.sort((a, b) => a.month.localeCompare(b.month))

const emptyMonth = (month: string): MonthlyActuals => ({
  month,
  costs: {},
  wants: {},
  extraIncome: [],
  extraExpenses: [],
})

const hasFacts = (actuals: MonthlyActuals) =>
  Object.keys(actuals.costs).length > 0 ||
  Object.keys(actuals.wants).length > 0 ||
  actuals.extraIncome.length > 0 ||
  actuals.extraExpenses.length > 0

/**
 * O que de fato foi pago e recebido em cada mês. Guardado por mês (não por
 * cenário): o realizado é um fato, não uma hipótese.
 */
export function useActuals(
  costs: CostItem[] = [],
  wants: WantItem[] = [],
  month = monthKey(),
) {
  const [stored, setStored] = useRepositoryState<MonthlyActuals[]>('actuals', [])
  const months = useMemo(
    () => (Array.isArray(stored) ? stored.map(normalizeActuals) : []),
    [stored],
  )

  const forMonth = useMemo(
    () => months.find((item) => item.month === month),
    [months, month],
  )
  const summary = useMemo(
    () => summarizeActuals(costs, forMonth, month, wants),
    [costs, forMonth, month, wants],
  )
  const nonCardWantIds = useMemo(
    () => new Set(summary.wantRows.map((row) => row.want.id)),
    [summary.wantRows],
  )

  const updateMonth = useCallback(
    (targetMonth: string, update: (current: MonthlyActuals) => MonthlyActuals) => {
      return setStored((prev) => {
        const list = (Array.isArray(prev) ? prev : []).map(normalizeActuals)
        const current = list.find((item) => item.month === targetMonth) ?? emptyMonth(targetMonth)
        const next = update(current)
        const others = list.filter((item) => item.month !== targetMonth)
        return hasFacts(next) ? sortMonths([...others, next]) : others
      })
    },
    [setStored],
  )

  /** Informa o valor pago de um custo. `null` volta a usar o planejado. */
  const setActual = useCallback(
    (costId: string, amount: number | null, targetMonth = month) => {
      updateMonth(targetMonth, (current) => {
        const nextCosts = { ...current.costs }
        if (amount === null) delete nextCosts[costId]
        else nextCosts[costId] = Math.max(0, amount)
        return { ...current, costs: nextCosts }
      })
    },
    [month, updateMonth],
  )

  /** Informa quanto foi efetivamente destinado a um item de Desejos. */
  const setWantActual = useCallback(
    (wantId: string, amount: number | null, targetMonth = month) => {
      updateMonth(targetMonth, (current) => {
        const nextWants = Object.fromEntries(
          Object.entries(current.wants).filter(([id]) => nonCardWantIds.has(id)),
        )
        if (amount === null) delete nextWants[wantId]
        else nextWants[wantId] = Math.max(0, amount)
        return { ...current, wants: nextWants }
      })
    },
    [month, nonCardWantIds, updateMonth],
  )

  /** Preenche todos os itens ainda vazios com o valor planejado. */
  const fillFromPlan = useCallback(
    (targetMonth = month) => {
      return updateMonth(targetMonth, (current) => {
        const filled = { ...current.costs }
        for (const row of summary.rows) {
          if (!Object.hasOwn(filled, row.cost.id)) filled[row.cost.id] = row.planned
        }
        const filledWants = Object.fromEntries(
          Object.entries(current.wants).filter(([id]) => nonCardWantIds.has(id)),
        )
        for (const row of summary.wantRows) {
          if (!Object.hasOwn(filledWants, row.want.id)) filledWants[row.want.id] = row.planned
        }
        return { ...current, costs: filled, wants: filledWants }
      })
    },
    [month, nonCardWantIds, summary.rows, summary.wantRows, updateMonth],
  )

  const clearCosts = useCallback(
    (targetMonth = month) => updateMonth(targetMonth, (current) => ({ ...current, costs: {} })),
    [month, updateMonth],
  )

  const clearWants = useCallback(
    (targetMonth = month) => updateMonth(targetMonth, (current) => ({ ...current, wants: {} })),
    [month, updateMonth],
  )

  const addCashEntry = useCallback(
    (
      field: CashEntryField,
      name: string,
      amount: number,
      sourceEventId?: string,
      targetMonth = month,
      sourceOccurrenceId?: string,
      occurredAt?: string,
    ) => {
      const cleanName = name.trim()
      if (!cleanName || amount <= 0) return
      updateMonth(targetMonth, (current) => {
        const entry: ExtraIncomeEntry = {
          id: uid(),
          name: cleanName,
          amount,
          sourceEventId: sourceEventId || undefined,
          ...(sourceOccurrenceId ? { sourceOccurrenceId } : {}),
          ...(occurredAt ? { occurredAt } : {}),
        }
        return { ...current, [field]: [...current[field], entry] }
      })
    },
    [month, updateMonth],
  )

  const updateCashEntry = useCallback(
    (
      field: CashEntryField,
      id: string,
      patch: Partial<Pick<ExtraIncomeEntry, 'name' | 'amount'>>,
      targetMonth = month,
    ) => {
      updateMonth(targetMonth, (current) => ({
        ...current,
        [field]: current[field]
          .map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  name: patch.name === undefined ? entry.name : patch.name.trim(),
                  amount: patch.amount === undefined ? entry.amount : Math.max(0, patch.amount),
                }
              : entry,
          )
          .filter((entry) => entry.name && entry.amount > 0),
      }))
    },
    [month, updateMonth],
  )

  const removeCashEntry = useCallback(
    (field: CashEntryField, id: string, targetMonth = month) => {
      updateMonth(targetMonth, (current) => ({
        ...current,
        [field]: current[field].filter((entry) => entry.id !== id),
      }))
    },
    [month, updateMonth],
  )

  const addExtraIncome = useCallback(
    (name: string, amount: number, sourceEventId?: string, targetMonth = month, sourceOccurrenceId?: string, occurredAt?: string) =>
      addCashEntry('extraIncome', name, amount, sourceEventId, targetMonth, sourceOccurrenceId, occurredAt),
    [addCashEntry, month],
  )
  const addExtraExpense = useCallback(
    (name: string, amount: number, sourceEventId?: string, targetMonth = month, sourceOccurrenceId?: string, occurredAt?: string) =>
      addCashEntry('extraExpenses', name, amount, sourceEventId, targetMonth, sourceOccurrenceId, occurredAt),
    [addCashEntry, month],
  )
  const updateExtraIncome = useCallback(
    (id: string, patch: Partial<Pick<ExtraIncomeEntry, 'name' | 'amount'>>, targetMonth = month) =>
      updateCashEntry('extraIncome', id, patch, targetMonth),
    [month, updateCashEntry],
  )
  const updateExtraExpense = useCallback(
    (id: string, patch: Partial<Pick<ExtraIncomeEntry, 'name' | 'amount'>>, targetMonth = month) =>
      updateCashEntry('extraExpenses', id, patch, targetMonth),
    [month, updateCashEntry],
  )
  const removeExtraIncome = useCallback(
    (id: string, targetMonth = month) => removeCashEntry('extraIncome', id, targetMonth),
    [month, removeCashEntry],
  )
  const removeExtraExpense = useCallback(
    (id: string, targetMonth = month) => removeCashEntry('extraExpenses', id, targetMonth),
    [month, removeCashEntry],
  )

  return {
    months,
    month,
    summary,
    setActual,
    setWantActual,
    fillFromPlan,
    clearCosts,
    clearWants,
    addExtraIncome,
    addExtraExpense,
    updateExtraIncome,
    updateExtraExpense,
    removeExtraIncome,
    removeExtraExpense,
  }
}
