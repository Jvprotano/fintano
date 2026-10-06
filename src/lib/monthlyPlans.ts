import type { FinanceScenario, FinanceScenarioData } from '../types'
import { normalizeScenario } from './scenario'
import { nowIso, uid } from './shared'

/** Uma competência contém seus próprios itens; o modelo é apenas a origem. */
export interface MonthlyPlan extends FinanceScenarioData {
  id: string
  month: string
  sourceTemplateId: string
  sourceTemplateName: string
  createdAt: string
  updatedAt: string
  customized: boolean
  fixedReference?: { fixedAt: string; scenario: FinanceScenario }
}

export function planFromTemplate(month: string, source: FinanceScenario): MonthlyPlan {
  const template = normalizeScenario(source)
  const now = nowIso()
  return {
    id: uid(), month, sourceTemplateId: template.id, sourceTemplateName: template.name,
    createdAt: now, updatedAt: now, customized: false,
    salaryNet: template.salaryNet, salaryInputMode: template.salaryInputMode,
    plannedInvestmentAmount: template.plannedInvestmentAmount,
    costs: template.costs.map((item) => ({ ...item })),
    wants: template.wants.map((item) => ({ ...item })),
    deductions: template.deductions.map((item) => ({ ...item })),
    selectedModelId: template.selectedModelId,
    diversification: template.diversification.map((item) => ({ ...item })),
    customModel: { ...template.customModel },
  }
}

export function planAsScenario(plan: MonthlyPlan): FinanceScenario {
  return {
    id: plan.sourceTemplateId,
    name: plan.sourceTemplateName,
    createdAt: plan.createdAt, updatedAt: plan.updatedAt,
    salaryNet: plan.salaryNet, salaryInputMode: plan.salaryInputMode,
    plannedInvestmentAmount: plan.plannedInvestmentAmount,
    costs: plan.costs, wants: plan.wants, deductions: plan.deductions,
    selectedModelId: plan.selectedModelId, diversification: plan.diversification,
    customModel: plan.customModel,
  }
}

export function normalizeMonthlyPlan(raw: Partial<MonthlyPlan>): MonthlyPlan {
  const source = normalizeScenario({
    ...raw,
    id: raw.sourceTemplateId || 'legacy-template',
    name: raw.sourceTemplateName || 'Plano do ciclo',
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  } as FinanceScenario)
  return {
    ...planFromTemplate(raw.month || nowIso().slice(0, 7), source),
    id: raw.id || uid(),
    month: raw.month || nowIso().slice(0, 7),
    sourceTemplateId: source.id,
    sourceTemplateName: source.name,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    customized: raw.customized === true,
    fixedReference: raw.fixedReference ? {
      fixedAt: raw.fixedReference.fixedAt,
      scenario: normalizeScenario(raw.fixedReference.scenario),
    } : undefined,
  }
}
