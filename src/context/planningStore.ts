import { createContext, useContext } from 'react'
import type { useScenarios } from '../hooks/useScenarios'

export interface PlanningWorkspace {
  selectedId: string | null
  select: (id: string | null) => void
  scenarios: ReturnType<typeof useScenarios>
  hasChanges: boolean
  pendingScenarioIds: string[]
  discard: () => void
  saved: (id: string) => void
  createVariation: (name: string) => boolean
}

export const PlanningContext = createContext<PlanningWorkspace | null>(null)

export function usePlanningWorkspace() {
  const workspace = useContext(PlanningContext)
  if (!workspace) throw new Error('Planejar precisa estar dentro de <PlanningProvider>.')
  return workspace
}
