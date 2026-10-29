import { describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../lib/scenario'
import { planFromTemplate, type MonthlyPlan } from '../lib/monthlyPlans'
import type { RepositoryDocument } from './repository'
import { savePlanScenarioInDocument } from './planScenarioCommand'

function fixture() {
  const model = createDefaultScenario('Atual')
  model.salaryNet = 5000
  const current = planFromTemplate('2026-11', model)
  current.salaryNet = 6000
  current.customized = true
  current.fixedReference = { fixedAt: '2026-10-29T12:00:00Z', scenario: structuredClone(model) }
  const plans = [current, ...['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'].map((month) => planFromTemplate(month, model))]
  plans[2].customized = true
  plans[3].fixedReference = structuredClone(current.fixedReference)
  const document: RepositoryDocument = { schemaVersion: 7, updatedAt: '2026-10-29T12:00:00Z', collections: {
    scenarios: [model], monthlyPlans: plans, recurringTemplateId: model.id, activeScenarioId: model.id,
    actuals: [{ month: '2027-03', paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
    history: [{ month: '2027-04' }], cardEntries: [{ id: 'preserved' }],
  } }
  return { document, model, current, plans }
}

describe('salvar plano como cenário', () => {
  it('atualiza o modelo e somente meses futuros intactos, preservando plano atual, referência e fatos', () => {
    const { document, model, current, plans } = fixture()
    const original = structuredClone(document)
    const next = savePlanScenarioInDocument(document, { month: current.month, scenarioId: model.id, useForNextCycles: true })
    expect((next.collections.scenarios as typeof model[])[0]).toMatchObject({ id: model.id, salaryNet: 6000 })
    const updatedPlans = next.collections.monthlyPlans as MonthlyPlan[]
    expect(updatedPlans[0]).toEqual(current)
    expect(updatedPlans[1]).toMatchObject({ id: plans[1].id, salaryNet: 6000 })
    expect(updatedPlans.slice(2, 6)).toEqual(plans.slice(2, 6))
    expect(updatedPlans[6].salaryNet).toBe(6000)
    expect(next.collections.actuals).toEqual(document.collections.actuals)
    expect(next.collections.history).toEqual(document.collections.history)
    expect(next.collections.cardEntries).toEqual(document.collections.cardEntries)
    expect(document).toEqual(original)
  })

  it('cria cenário independente ou novo modelo conservando IDs dos itens e origem dos ciclos protegidos', () => {
    const { document, model, current, plans } = fixture()
    const independent = savePlanScenarioInDocument(document, { month: current.month, name: 'Novo salário', useForNextCycles: false })
    expect(independent.collections.recurringTemplateId).toBe(model.id)
    expect(independent.collections.monthlyPlans).toEqual(plans)
    const created = (independent.collections.scenarios as typeof model[])[1]
    expect(created).toMatchObject({ name: 'Novo salário', salaryNet: 6000, costs: current.costs, wants: current.wants })
    expect(created.id).not.toBe(model.id)
    const recurring = savePlanScenarioInDocument(document, { month: current.month, name: 'Novo modelo', useForNextCycles: true })
    const newModelId = recurring.collections.recurringTemplateId
    expect(newModelId).not.toBe(model.id)
    expect((recurring.collections.monthlyPlans as MonthlyPlan[])[1]).toMatchObject({ sourceTemplateId: newModelId, salaryNet: 6000 })
    expect((recurring.collections.monthlyPlans as MonthlyPlan[])[2]).toEqual(plans[2])
    expect(() => savePlanScenarioInDocument(document, { month: current.month, name: ' ', useForNextCycles: false })).toThrow('nome')
  })
})
