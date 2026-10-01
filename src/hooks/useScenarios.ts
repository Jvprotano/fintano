import { useCallback, useEffect, useMemo } from 'react'
import { readRepositoryDocument, useRepositoryState } from '../data/repository'
import { runRepositoryCommand } from '../data/repositoryCommand'
import { deleteUnusedCatalog } from '../data/catalogDeletion'
import type {
  CostCategory,
  CostItem,
  DeductionType,
  DiversificationSlice,
  FinanceScenario,
  FinanceScenarioData,
  Debt,
  MonthlyActuals,
  PaymentMethod,
  SalaryInputMode,
} from '../types'
import {
  cloneScenario,
  createDefaultScenario,
  isCardEnvelopeWant,
  isWantIncludedInCardPlan,
  moveWantInPlanningOrder,
  normalizeScenario,
} from '../lib/scenario'
import { nowIso, uid } from '../lib/shared'

function loadInitialScenarios(): FinanceScenario[] {
  return [createDefaultScenario('Atual')]
}

export function useScenarios() {
  const [storedScenarios, setScenarios] = useRepositoryState<FinanceScenario[]>(
    'scenarios',
    loadInitialScenarios,
  )
  const scenarios = useMemo(
    () => (Array.isArray(storedScenarios) ? storedScenarios.map(normalizeScenario) : []),
    [storedScenarios],
  )
  const [activeScenarioId, setActiveScenarioId] = useRepositoryState<string>(
    'activeScenarioId',
    '',
  )

  useEffect(() => {
    const persisted = readRepositoryDocument().collections.scenarios
    if (!Array.isArray(persisted) || persisted.length === 0) {
      const scenario = scenarios[0] ?? createDefaultScenario('Atual')
      runRepositoryCommand({
        id: uid(),
        apply: (document) => {
          if (Array.isArray(document.collections.scenarios) && document.collections.scenarios.length > 0) return null
          return {
            ...document,
            collections: {
              ...document.collections,
              scenarios: [scenario],
              activeScenarioId: scenario.id,
            },
          }
        },
      })
      return
    }

    if (!scenarios.some((scenario) => scenario.id === activeScenarioId)) {
      setActiveScenarioId(scenarios[0].id)
    }
  }, [activeScenarioId, scenarios, setActiveScenarioId])

  const activeScenarioAll =
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    scenarios[0] ??
    createDefaultScenario('Atual')
  const activeId = activeScenarioAll.id
  const activeScenario = useMemo(() => ({
    ...activeScenarioAll,
    costs: activeScenarioAll.costs.filter((cost) => !cost.archivedAt),
    wants: activeScenarioAll.wants.filter((want) => !want.archivedAt),
  }), [activeScenarioAll])

  const updateActiveScenario = useCallback(
    (updater: (scenario: FinanceScenario) => FinanceScenario) => {
      return setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === activeId
            ? { ...updater(normalizeScenario(scenario)), updatedAt: nowIso() }
            : scenario,
        ),
      )
    },
    [activeId, setScenarios],
  )

  const setScenarioField = useCallback(
    <K extends keyof FinanceScenarioData>(field: K, value: FinanceScenarioData[K]) => {
      return updateActiveScenario((scenario) => ({ ...scenario, [field]: value }))
    },
    [updateActiveScenario],
  )

  // Cenários -----------------------------------------------------------------

  const createScenario = useCallback(
    (name = `Cenário ${scenarios.length + 1}`) => {
      const scenario = createDefaultScenario(name)
      return runRepositoryCommand({
        id: uid(),
        apply: (document) => ({
          ...document,
          collections: {
            ...document.collections,
            scenarios: [...(Array.isArray(document.collections.scenarios) ? document.collections.scenarios : []), scenario],
            activeScenarioId: scenario.id,
          },
        }),
      }).ok
    },
    [scenarios.length],
  )

  const duplicateScenario = useCallback(
    (sourceId = activeId) => {
      return runRepositoryCommand({
        id: uid(),
        apply: (document) => {
          const current = Array.isArray(document.collections.scenarios)
            ? document.collections.scenarios as FinanceScenario[] : []
          const source = current.find((item) => item.id === sourceId)
          if (!source) return null
          const scenario = cloneScenario(source, `${source.name} (cópia)`)
          return {
            ...document,
            collections: {
              ...document.collections,
              scenarios: [...current, scenario],
              activeScenarioId: scenario.id,
            },
          }
        },
      }).ok
    },
    [activeId],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === id ? { ...scenario, name: trimmed, updatedAt: nowIso() } : scenario,
        ),
      )
    },
    [setScenarios],
  )

  const removeScenario = useCallback(
    (id: string) => {
      return runRepositoryCommand({
        id: uid(),
        apply: (document) => {
          const current = Array.isArray(document.collections.scenarios)
            ? document.collections.scenarios as FinanceScenario[] : []
          if (current.length <= 1 || !current.some((scenario) => scenario.id === id)) return null
          const removed = current.find((scenario) => scenario.id === id)!
          const remaining = current.filter((scenario) => scenario.id !== id)
          const actuals = Array.isArray(document.collections.actuals)
            ? document.collections.actuals as MonthlyActuals[] : []
          const paidCostIds = new Set(actuals.flatMap((month) => Object.keys(month.costs ?? {})))
          const paidWantIds = new Set(actuals.flatMap((month) => Object.keys(month.wants ?? {})))
          const survivingCostIds = new Set(remaining.flatMap((scenario) => scenario.costs.map((cost) => cost.id)))
          const survivingWantIds = new Set(remaining.flatMap((scenario) => scenario.wants.map((want) => want.id)))
          if (removed.costs.some((cost) => paidCostIds.has(cost.id) && !survivingCostIds.has(cost.id)) ||
            removed.wants.some((want) => paidWantIds.has(want.id) && !survivingWantIds.has(want.id))) return null
          return {
            ...document,
            collections: {
              ...document.collections,
              scenarios: remaining,
              activeScenarioId: document.collections.activeScenarioId === id
                ? remaining[0].id : document.collections.activeScenarioId,
            },
          }
        },
      }).ok
    },
    [],
  )

  // Custos -------------------------------------------------------------------

  const addCost = useCallback(
    (input: {
      name: string
      value: number
      category: CostCategory
      sharedAmount?: number
      sharedWith?: string
      paidWith?: PaymentMethod
    }) => {
      return updateActiveScenario((scenario) => ({
        ...scenario,
        costs: [
          ...scenario.costs,
          {
            id: uid(),
            name: input.name,
            value: input.value,
            category: input.category,
            sharedAmount: input.sharedAmount || undefined,
            sharedWith: input.sharedWith?.trim() || undefined,
            paidWith: input.paidWith ?? 'account',
          },
        ],
      }))
    },
    [updateActiveScenario],
  )

  const updateCost = useCallback(
    (id: string, patch: Partial<Omit<CostItem, 'id'>>) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        costs: scenario.costs.map((cost) => (cost.id === id ? { ...cost, ...patch } : cost)),
      }))
    },
    [updateActiveScenario],
  )

  const removeCost = useCallback(
    (id: string) => {
      return runRepositoryCommand({
        id: uid(),
        apply: (document) => {
          const debts = Array.isArray(document.collections.debts)
            ? document.collections.debts as Debt[] : []
          if (debts.some((debt) => debt.linkedCostId === id && debt.balance > 0)) return null
          const current = Array.isArray(document.collections.scenarios)
            ? document.collections.scenarios as FinanceScenario[] : []
          if (!current.some((scenario) => scenario.id === activeId && scenario.costs.some((cost) => cost.id === id))) return null
          return {
            ...document,
            collections: {
              ...document.collections,
              scenarios: current.map((scenario) => scenario.id === activeId
                ? { ...scenario, updatedAt: nowIso(), costs: scenario.costs.map((cost) =>
                    cost.id === id ? { ...cost, archivedAt: nowIso() } : cost,
                  ) }
                : scenario),
            },
          }
        },
      }).ok
    },
    [activeId],
  )

  const restoreCost = useCallback(
    (id: string) => updateActiveScenario((scenario) => ({
      ...scenario,
      costs: scenario.costs.map((cost) =>
        cost.id === id ? { ...cost, archivedAt: undefined } : cost,
      ),
    })),
    [updateActiveScenario],
  )
  const deleteUnusedCost = useCallback((id: string) => deleteUnusedCatalog('cost', id, activeId), [activeId])

  // Desejos ------------------------------------------------------------------

  const addWant = useCallback(
    (name: string, plannedAmount = 0, paidWith: PaymentMethod = 'card') => {
      return updateActiveScenario((scenario) => ({
        ...scenario,
        wants: [
          ...scenario.wants,
          { id: uid(), name, plannedAmount: Math.max(0, plannedAmount), paidWith },
        ],
      }))
    },
    [updateActiveScenario],
  )

  const removeWant = useCallback(
    (id: string) => {
      return updateActiveScenario((scenario) => {
        const envelope = scenario.wants.find((item) => item.id === id)
        const archivedAt = nowIso()
        return {
          ...scenario,
          wants: scenario.wants.map((want) => {
            const together = envelope && isCardEnvelopeWant(envelope) &&
              isWantIncludedInCardPlan(want, scenario.wants)
            return want.id === id || together ? { ...want, archivedAt } : want
          }),
        }
      })
    },
    [updateActiveScenario],
  )

  const restoreWant = useCallback(
    (id: string) => updateActiveScenario((scenario) => {
      const envelope = scenario.wants.find((item) => item.id === id)
      return {
        ...scenario,
        wants: scenario.wants.map((want) => {
          const together = envelope && isCardEnvelopeWant(envelope) &&
            want.archivedAt === envelope.archivedAt &&
            isWantIncludedInCardPlan(want, scenario.wants)
          return want.id === id || together ? { ...want, archivedAt: undefined } : want
        }),
      }
    }),
    [updateActiveScenario],
  )
  const deleteUnusedWant = useCallback((id: string) => deleteUnusedCatalog('want', id, activeId), [activeId])

  const updateWantAmount = useCallback(
    (id: string, plannedAmount: number) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        wants: scenario.wants.map((w) =>
          w.id === id ? { ...w, plannedAmount: Math.max(0, plannedAmount) } : w,
        ),
      }))
    },
    [updateActiveScenario],
  )

  /** Atualiza vários desejos numa única escrita (rateio do pool). */
  const applyWantAmounts = useCallback(
    (updates: { id: string; plannedAmount: number }[]) => {
      if (updates.length === 0) return
      const byId = new Map(updates.map((item) => [item.id, item.plannedAmount]))
      updateActiveScenario((scenario) => ({
        ...scenario,
        wants: scenario.wants.map((w) =>
          byId.has(w.id)
            ? { ...w, plannedAmount: Math.max(0, byId.get(w.id) ?? w.plannedAmount) }
            : w,
        ),
      }))
    },
    [updateActiveScenario],
  )

  const setWantPaidWith = useCallback(
    (id: string, paidWith: PaymentMethod) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        wants: scenario.wants.map((w) =>
          w.id === id
            ? {
                ...w,
                paidWith,
                includedInCardPlan:
                  paidWith === 'account' ? false : w.includedInCardPlan,
              }
            : w,
        ),
      }))
    },
    [updateActiveScenario],
  )

  const setWantIncludedInCardPlan = useCallback(
    (id: string, includedInCardPlan: boolean) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        wants: scenario.wants.map((w) => (w.id === id ? { ...w, includedInCardPlan } : w)),
      }))
    },
    [updateActiveScenario],
  )

  const moveWant = useCallback(
    (id: string, direction: -1 | 1) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        wants: moveWantInPlanningOrder(scenario.wants, id, direction),
      }))
    },
    [updateActiveScenario],
  )

  // Descontos em folha -------------------------------------------------------

  const addDeduction = useCallback(
    (
      name: string,
      value: number,
      type: DeductionType,
      employerContribution = 0,
      linkedHoldingId?: string,
    ) => {
      return updateActiveScenario((scenario) => ({
        ...scenario,
        deductions: [
          ...scenario.deductions,
          { id: uid(), name, value, type, employerContribution, linkedHoldingId },
        ],
      }))
    },
    [updateActiveScenario],
  )

  const removeDeduction = useCallback(
    (id: string) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        deductions: scenario.deductions.filter((d) => d.id !== id),
      }))
    },
    [updateActiveScenario],
  )

  const updateDeductionEmployerContribution = useCallback(
    (id: string, employerContribution: number) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        deductions: scenario.deductions.map((d) =>
          d.id === id ? { ...d, employerContribution: Math.max(0, employerContribution) } : d,
        ),
      }))
    },
    [updateActiveScenario],
  )

  const updateDeductionHolding = useCallback(
    (id: string, linkedHoldingId?: string) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        deductions: scenario.deductions.map((deduction) =>
          deduction.id === id ? { ...deduction, linkedHoldingId } : deduction,
        ),
      }))
    },
    [updateActiveScenario],
  )

  // Diversificação -----------------------------------------------------------

  const updateDiversification = useCallback(
    (slices: DiversificationSlice[]) => setScenarioField('diversification', slices),
    [setScenarioField],
  )

  const addDiversificationSlice = useCallback(
    (name: string, percentage: number, color: string) => {
      return updateActiveScenario((scenario) => ({
        ...scenario,
        diversification: [...scenario.diversification, { id: uid(), name, percentage, color }],
      }))
    },
    [updateActiveScenario],
  )

  const removeDiversificationSlice = useCallback(
    (id: string) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        diversification: scenario.diversification.filter((s) => s.id !== id),
      }))
    },
    [updateActiveScenario],
  )

  /** Reescala os pesos para fechar exatamente 100%, preservando as proporções. */
  const normalizeDiversification = useCallback(() => {
    updateActiveScenario((scenario) => {
      const total = scenario.diversification.reduce((sum, slice) => sum + slice.percentage, 0)
      if (total <= 0 || scenario.diversification.length === 0) return scenario

      const scaled = scenario.diversification.map((slice) => ({
        ...slice,
        percentage: Math.round((slice.percentage / total) * 100),
      }))
      // O arredondamento raramente fecha 100: a sobra vai para a maior fatia.
      const rounded = scaled.reduce((sum, slice) => sum + slice.percentage, 0)
      const drift = 100 - rounded
      if (drift !== 0) {
        const largest = scaled.reduce(
          (top, slice, index) => (slice.percentage > scaled[top].percentage ? index : top),
          0,
        )
        scaled[largest] = {
          ...scaled[largest],
          percentage: Math.max(0, scaled[largest].percentage + drift),
        }
      }

      return { ...scenario, diversification: scaled }
    })
  }, [updateActiveScenario])

  /** Joga todo o percentual ainda sem destino numa fatia. */
  const assignRemainingToSlice = useCallback(
    (id: string) => {
      updateActiveScenario((scenario) => {
        const total = scenario.diversification.reduce((sum, slice) => sum + slice.percentage, 0)
        const remaining = 100 - total
        if (remaining === 0) return scenario
        return {
          ...scenario,
          diversification: scenario.diversification.map((slice) =>
            slice.id === id
              ? { ...slice, percentage: Math.max(0, Math.min(100, slice.percentage + remaining)) }
              : slice,
          ),
        }
      })
    },
    [updateActiveScenario],
  )

  return {
    scenarios,
    activeScenario,
    activeScenarioAll,
    activeScenarioId: activeId,
    setActiveScenarioId,
    createScenario,
    duplicateScenario,
    renameScenario,
    removeScenario,

    salaryNet: activeScenario.salaryNet,
    setSalaryNet: useCallback(
      (value: number) => setScenarioField('salaryNet', value),
      [setScenarioField],
    ),
    salaryInputMode: activeScenario.salaryInputMode,
    setSalaryInputMode: useCallback(
      (mode: SalaryInputMode) => setScenarioField('salaryInputMode', mode),
      [setScenarioField],
    ),
    costs: activeScenario.costs,
    archivedCosts: activeScenarioAll.costs.filter((cost) => cost.archivedAt),
    addCost,
    updateCost,
    removeCost,
    restoreCost,
    deleteUnusedCost,
    wants: activeScenario.wants,
    archivedWants: activeScenarioAll.wants.filter((want) => want.archivedAt),
    addWant,
    removeWant,
    restoreWant,
    deleteUnusedWant,
    updateWantAmount,
    applyWantAmounts,
    setWantPaidWith,
    setWantIncludedInCardPlan,
    moveWant,
    deductions: activeScenario.deductions,
    addDeduction,
    removeDeduction,
    updateDeductionEmployerContribution,
    updateDeductionHolding,
    selectedModelId: activeScenario.selectedModelId,
    setSelectedModelId: useCallback(
      (id: string) => setScenarioField('selectedModelId', id),
      [setScenarioField],
    ),
    customModel: activeScenario.customModel,
    setCustomModel: useCallback(
      (model: { n: number; d: number; i: number }) => setScenarioField('customModel', model),
      [setScenarioField],
    ),
    diversification: activeScenario.diversification,
    updateDiversification,
    addDiversificationSlice,
    removeDiversificationSlice,
    normalizeDiversification,
    assignRemainingToSlice,
  }
}
