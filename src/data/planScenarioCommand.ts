import type { FinanceScenario, MonthlyActuals } from '../types'
import { planAsScenario, planFromTemplate, type MonthlyPlan } from '../lib/monthlyPlans'
import { nowIso, uid } from '../lib/shared'
import type { RepositoryDocument } from './repository'

export interface SavePlanScenarioInput {
  month: string
  scenarioId?: string
  name?: string
  useForNextCycles: boolean
  /** Rascunho de uma simulação; ausente copia o plano operacional. */
  source?: FinanceScenario
}

/** Copia o plano para um cenário sem substituir o plano atual nem sua referência. */
export function savePlanScenarioInDocument(document: RepositoryDocument, input: SavePlanScenarioInput): RepositoryDocument {
  const templates = document.collections.scenarios as FinanceScenario[] ?? []
  const plans = document.collections.monthlyPlans as MonthlyPlan[] ?? []
  const current = plans.find((plan) => plan.month === input.month)
  const target = templates.find((scenario) => scenario.id === input.scenarioId)
  const source = input.source
  if (source && !templates.some((scenario) => scenario.id === source.id && scenario.updatedAt === source.updatedAt)) {
    throw new Error('O cenário de origem mudou. Guarde suas alterações e reabra o cenário antes de salvar.')
  }
  if (!current || (input.scenarioId && !target)) throw new Error('O plano ou cenário não está mais disponível. Reabra a revisão.')
  const name = target?.name ?? input.name?.trim()
  if (!name) throw new Error('Informe o nome do novo cenário.')
  const now = nowIso()
  const saved: FinanceScenario = { ...structuredClone(input.source ?? planAsScenario(current)),
    id: target?.id ?? uid(), name, createdAt: target?.createdAt ?? now, updatedAt: now }
  const previousModelId = document.collections.recurringTemplateId
  const useForNextCycles = input.useForNextCycles || saved.id === previousModelId
  const actuals = document.collections.actuals as MonthlyActuals[] ?? []
  const closed = document.collections.history as { month: string }[] ?? []
  const protectedMonth = (month: string) => closed.some((row) => row.month === month) || actuals.some((row) => row.month === month &&
    (row.paycheck || Object.keys(row.costs ?? {}).length || Object.keys(row.wants ?? {}).length || row.extraIncome?.length || row.extraExpenses?.length))
  return { ...document, collections: { ...document.collections,
    scenarios: target ? templates.map((scenario) => scenario.id === saved.id ? saved : scenario) : [...templates, saved],
    activeScenarioId: saved.id,
    recurringTemplateId: useForNextCycles ? saved.id : previousModelId,
    monthlyPlans: useForNextCycles ? plans.map((plan) => {
      if (plan.month <= input.month || plan.customized || plan.fixedReference || protectedMonth(plan.month) ||
        (plan.sourceTemplateId !== previousModelId && plan.sourceTemplateId !== saved.id)) return plan
      return { ...planFromTemplate(plan.month, saved), id: plan.id, createdAt: plan.createdAt, updatedAt: now }
    }) : plans,
  } }
}
