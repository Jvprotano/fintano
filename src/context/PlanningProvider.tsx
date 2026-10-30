import { useEffect, useState, type ReactNode } from 'react'
import { useScenarios } from '../hooks/useScenarios'
import { calculateScenario } from '../lib/scenario'
import type { FinanceScenario } from '../types'
import { readRepositoryDocument } from '../data/repository'
import { FinancasContext, MetricsContext, ScenarioContext, useFinancasStore } from './financasStore'
import { PlanningContext, usePlanningWorkspace } from './planningStore'

/** A seleção e os rascunhos pertencem somente ao Planejar, nunca ao ciclo. */
export function PlanningProvider({ children }: { children: ReactNode }) {
  const store = useFinancasStore()
  const [selection, select] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, FinanceScenario>>({})
  const selected = store.scenarios.scenarios.find((scenario) => scenario.id === selection)
  const selectedId = selected?.id ?? null
  const pendingScenarioIds = store.scenarios.scenarios.filter((scenario) => drafts[scenario.id]).map((scenario) => scenario.id)
  const hasPending = pendingScenarioIds.length > 0
  const scenarios = useScenarios(store.activeCycle.month, selected ? {
    scenario: drafts[selected.id] ?? selected,
    update: (updater) => {
      setDrafts((previous) => ({ ...previous, [selected.id]: updater(previous[selected.id] ?? structuredClone(selected)) }))
      return true
    },
  } : undefined)
  const clearDraft = () => {
    if (!selectedId) return
    setDrafts((previous) => {
      const next = { ...previous }
      delete next[selectedId]
      return next
    })
  }
  useEffect(() => {
    if (!hasPending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasPending])

  return <PlanningContext.Provider value={{ selectedId, select, scenarios,
    hasChanges: !!selectedId && !!drafts[selectedId], pendingScenarioIds, discard: clearDraft,
    saved: (id) => { clearDraft(); select(id) },
    createVariation: (name) => {
      if (!name.trim()) return false
      const result = scenarios.saveCurrentPlanAsScenario({ name: name.trim(), useForNextCycles: false,
        source: selectedId ? scenarios.activeScenarioAll : undefined })
      if (result.ok) select(readRepositoryDocument().collections.activeScenarioId as string)
      return result.ok
    },
  }}>{children}</PlanningContext.Provider>
}

/** Só o conteúdo de Planejar recebe os valores simulados. */
export function PlanningViewProvider({ children }: { children: ReactNode }) {
  const store = useFinancasStore()
  const { scenarios, selectedId } = usePlanningWorkspace()
  const metrics = selectedId ? calculateScenario(scenarios.activeScenario, store.investments.emergencyFund) : store.metrics
  return <FinancasContext.Provider value={{ ...store, scenarios, metrics }}>
    <ScenarioContext.Provider value={scenarios}>
      <MetricsContext.Provider value={metrics}>{children}</MetricsContext.Provider>
    </ScenarioContext.Provider>
  </FinancasContext.Provider>
}
