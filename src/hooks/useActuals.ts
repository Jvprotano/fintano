import { useCallback, useMemo, useState } from 'react'
import { useRepositoryState } from '../data/repository'
import type { CostItem, DeductionItem, ExtraIncomeEntry, MonthlyActuals, WantItem } from '../types'
import { setPaycheckInDocument } from '../data/payrollPension'
import { runRepositoryCommand } from '../data/repositoryCommand'
import { normalizeActuals, summarizeActuals } from '../lib/actuals'
import { localDateKey, monthKey, uid } from '../lib/shared'
import { forecastCommand, realizeForecastInDocument } from '../data/forecastCommands'

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
  actuals.payrollPensionLegacy ||
  Object.keys(actuals.costs).length > 0 ||
  actuals.paycheck !== undefined ||
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
  knownCosts: CostItem[] = costs,
  knownWants: WantItem[] = wants,
  deductions: DeductionItem[] = [],
) {
  const [paycheckError, setPaycheckError] = useState('')
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
    () => summarizeActuals(costs, forMonth, month, wants, knownCosts, knownWants),
    [costs, forMonth, month, wants, knownCosts, knownWants],
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

  const setPaycheck = useCallback((value: MonthlyActuals['paycheck'] | null, targetMonth = month) => {
    const result = runRepositoryCommand({ id: uid(), apply: (document) => setPaycheckInDocument(document, targetMonth, value ?? null, deductions) })
    setPaycheckError(result.ok ? '' : result.message)
    return result.ok
  }, [month, deductions])

  /** Informa o valor pago de um custo. `null` volta ao estado pendente. */
  const setActual = useCallback(
    (costId: string, amount: number | null, targetMonth = month,
      origin: 'manual' | 'confirmed_from_plan' = 'manual') => {
      return updateMonth(targetMonth, (current) => {
        const nextCosts = { ...current.costs }
        const costOrigins = { ...current.costOrigins }
        const costAdjustments = { ...current.costAdjustments }
        if (amount === null) { delete nextCosts[costId]; delete costOrigins[costId]; delete costAdjustments[costId] }
        else { nextCosts[costId] = Math.max(0, amount); costOrigins[costId] = origin }
        return { ...current, costs: nextCosts, costOrigins, costAdjustments }
      })
    },
    [month, updateMonth],
  )

  const adjustCost = useCallback((costId: string, delta: number, targetMonth = month) => {
    if (!Number.isFinite(delta) || delta === 0) return false
    const id = uid()
    const recordedAt = new Date().toISOString()
    return updateMonth(targetMonth, (current) => {
      const previous = current.costs[costId] ?? 0
      const amount = Math.max(0, Math.round((previous + delta) * 100) / 100)
      const appliedDelta = Math.round((amount - previous) * 100) / 100
      if (appliedDelta === 0) return current
      return { ...current,
        costs: { ...current.costs, [costId]: amount },
        costOrigins: { ...current.costOrigins, [costId]: 'manual' },
        costAdjustments: { ...current.costAdjustments,
          [costId]: [...(current.costAdjustments?.[costId] ?? []), { id, delta: appliedDelta, recordedAt }] },
      }
    })
  }, [month, updateMonth])

  /** Informa quanto foi efetivamente destinado a um item de Desejos. */
  const setWantActual = useCallback(
    (wantId: string, amount: number | null, targetMonth = month,
      origin: 'manual' | 'confirmed_from_plan' = 'manual') => {
      return updateMonth(targetMonth, (current) => {
        const nextWants = { ...current.wants }
        const wantOrigins = { ...current.wantOrigins }
        if (amount === null) { delete nextWants[wantId]; delete wantOrigins[wantId] }
        else { nextWants[wantId] = Math.max(0, amount); wantOrigins[wantId] = origin }
        return { ...current, wants: nextWants, wantOrigins }
      })
    },
    [month, updateMonth],
  )

  /** Preenche todos os itens ainda vazios com o valor planejado. */
  const fillFromPlan = useCallback(
    (targetMonth = month) => {
      return updateMonth(targetMonth, (current) => {
        const filled = { ...current.costs }
        const costOrigins = { ...current.costOrigins }
        for (const row of summary.rows) {
          if (costs.some((cost) => cost.id === row.cost.id && cost.paidWith !== 'card') && !Object.hasOwn(filled, row.cost.id)) {
            filled[row.cost.id] = row.planned
            costOrigins[row.cost.id] = 'confirmed_from_plan'
          }
        }
        const filledWants = { ...current.wants }
        const wantOrigins = { ...current.wantOrigins }
        for (const row of summary.wantRows) {
          if (wants.some((want) => want.id === row.want.id) && !Object.hasOwn(filledWants, row.want.id)) {
            filledWants[row.want.id] = row.planned
            wantOrigins[row.want.id] = 'confirmed_from_plan'
          }
        }
        return { ...current, costs: filled, costOrigins, wants: filledWants, wantOrigins }
      })
    },
    [costs, month, summary.rows, summary.wantRows, updateMonth, wants],
  )

  const clearCosts = useCallback(
    (targetMonth = month) => updateMonth(targetMonth, (current) => ({ ...current, costs: {}, costOrigins: {}, costAdjustments: {} })),
    [month, updateMonth],
  )

  const clearWants = useCallback(
    (targetMonth = month) => updateMonth(targetMonth, (current) => ({ ...current, wants: {}, wantOrigins: {} })),
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
      if (!cleanName || amount <= 0) return false
      if (sourceEventId && sourceOccurrenceId) return forecastCommand((document) => realizeForecastInDocument(document, sourceEventId, sourceOccurrenceId.slice(sourceEventId.length + 1), amount, targetMonth, occurredAt ?? localDateKey())).ok
      return updateMonth(targetMonth, (current) => {
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
      return updateMonth(targetMonth, (current) => ({
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
      return updateMonth(targetMonth, (current) => ({
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
    setPaycheck,
    paycheckError,
    setActual,
    adjustCost,
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
