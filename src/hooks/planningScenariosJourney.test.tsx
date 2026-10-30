// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { FinancasProvider } from '../context/FinancasContext'
import { PlanningProvider } from '../context/PlanningProvider'
import { useFinancasStore } from '../context/financasStore'
import { usePlanningWorkspace } from '../context/planningStore'
import { bootstrapMonthlyPlans } from '../data/monthlyPlanMigration'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import { createDefaultScenario } from '../lib/scenario'
import type { FinanceScenario } from '../types'
import App from '../App'

function wrapper({ children }: { children: ReactNode }) {
  return <FinancasProvider><PlanningProvider>{children}</PlanningProvider></FinancasProvider>
}

describe('cenários consultáveis em Planejar', () => {
  afterEach(cleanup)
  beforeEach(() => {
    localStorage.clear()
    const base = createDefaultScenario('Atual')
    base.salaryNet = 5000
    base.deductions = []
    base.costs = [{ id: 'rent', name: 'Aluguel', value: 1000, category: 'moradia', paidWith: 'account' }]
    base.wants = [{ id: 'leisure', name: 'Lazer', plannedAmount: 200, paidWith: 'account' }]
    base.plannedInvestmentAmount = 500
    writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-30T12:00:00Z', collections: {
      activeCycle: { month: '2026-11', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: base.id, recurringTemplateId: base.id, scenarios: [base],
      actuals: [{ month: '2026-11', costs: { rent: 1200 }, wants: { leisure: 50 }, extraIncome: [], extraExpenses: [] }],
    } })
    expect(bootstrapMonthlyPlans().status).toBe('ready')
  })

  it('cria IDEAL, edita e salva a simulação, volta ao Atual e conserva fatos, referência, modelo e backup', () => {
    const app = renderHook(() => ({ actual: useFinancasStore(), planning: usePlanningWorkspace() }), { wrapper })
    act(() => expect(app.result.current.actual.scenarios.fixCurrentPlan()).toBe(true))
    const before = structuredClone(readRepositoryDocument().collections)
    const metrics = structuredClone(app.result.current.actual.metrics)
    act(() => expect(app.result.current.planning.createVariation('IDEAL')).toBe(true))
    const idealId = app.result.current.planning.selectedId!
    act(() => {
      const { scenarios } = app.result.current.planning
      scenarios.setSalaryNet(9000)
      scenarios.updateCost('rent', { value: 700 })
      scenarios.updateWantAmount('leisure', 1200)
      scenarios.setPlannedInvestmentAmount(2000)
      scenarios.addDeduction('Benefício', 100, 'outros')
      scenarios.setScenarioField('contributionDestinations', [])
      scenarios.removeCost('rent')
      expect(scenarios.deleteUnusedCost('rent')).toBe(false)
      expect(scenarios.deleteUnusedWant('leisure')).toBe(false)
    })
    expect(app.result.current.planning.hasChanges).toBe(true)
    expect(app.result.current.planning.scenarios.salaryNet).toBe(9000)
    expect(app.result.current.planning.scenarios.costs).toEqual([])
    expect(app.result.current.actual.metrics).toEqual(metrics)
    act(() => app.result.current.planning.select(null))
    expect(app.result.current.planning.scenarios.salaryNet).toBe(5000)
    expect(app.result.current.planning.scenarios.costs[0].value).toBe(1000)
    act(() => app.result.current.planning.select(idealId))
    expect(app.result.current.planning.scenarios.salaryNet).toBe(9000)
    act(() => expect(app.result.current.planning.scenarios.saveCurrentPlanAsScenario({
      scenarioId: idealId, useForNextCycles: false, source: app.result.current.planning.scenarios.activeScenarioAll,
    }, repositoryRevision()).ok).toBe(true))
    act(() => app.result.current.planning.saved(idealId))
    expect(app.result.current.planning.hasChanges).toBe(false)
    const after = readRepositoryDocument().collections
    for (const key of ['monthlyPlans', 'actuals', 'recurringTemplateId', 'cardEntries', 'cardPaidInvoices', 'history'] as const) {
      expect(after[key]).toEqual(before[key])
    }
    expect((after.scenarios as FinanceScenario[]).find((scenario) => scenario.id === idealId)).toMatchObject({ salaryNet: 9000, plannedInvestmentAmount: 2000 })
    const backup = repositoryToBackupV9(readRepositoryDocument())
    expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect((backupV9ToRepository(backup).collections.scenarios as FinanceScenario[]).find((scenario) => scenario.id === idealId)?.salaryNet).toBe(9000)
    app.unmount()
    const reopened = renderHook(() => usePlanningWorkspace(), { wrapper })
    expect(reopened.result.current.selectedId).toBe(null)
    act(() => reopened.result.current.select(idealId))
    expect(reopened.result.current.scenarios.salaryNet).toBe(9000)
    reopened.unmount()
  })

  it('editar o cenário modelo só muda rascunho e recusa salvar sobre origem alterada', () => {
    const app = renderHook(() => ({ actual: useFinancasStore(), planning: usePlanningWorkspace() }), { wrapper })
    const modelId = app.result.current.actual.scenarios.recurringTemplateId
    const before = structuredClone(readRepositoryDocument().collections)
    act(() => app.result.current.planning.select(modelId))
    act(() => app.result.current.planning.scenarios.setSalaryNet(10000))
    expect(readRepositoryDocument().collections).toEqual(before)
    expect(app.result.current.actual.scenarios.salaryNet).toBe(5000)
    act(() => expect(app.result.current.actual.scenarios.renameScenario(modelId, 'Modelo renomeado')).toBe(true))
    act(() => expect(app.result.current.planning.scenarios.saveCurrentPlanAsScenario({ scenarioId: modelId,
      useForNextCycles: true, source: app.result.current.planning.scenarios.activeScenarioAll,
    }, repositoryRevision()).ok).toBe(false))
    expect(app.result.current.planning.scenarios.salaryNet).toBe(10000)
    act(() => app.result.current.planning.discard())
    expect(app.result.current.planning.scenarios.salaryNet).toBe(5000)
    expect(app.result.current.planning.hasChanges).toBe(false)
    app.unmount()
  })

  it('abre IDEAL na interface, salva seus valores e retorna ao salário real pelo seletor', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Planejar · Atual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar variação' }))
    fireEvent.change(screen.getByLabelText('Nome da variação'), { target: { value: 'IDEAL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar cenário' }))
    expect((screen.getByLabelText('Salário mensal planejado') as HTMLInputElement).value).toBe('5.000,00')
    fireEvent.change(screen.getByLabelText('Salário mensal planejado'), { target: { value: '900000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cenário' }))
    expect((screen.getByLabelText('Usar como modelo dos próximos ciclos') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Revisar gravação' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salvar cenário' }))
    expect(screen.queryByRole('button', { name: 'Descartar alterações' })).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao Atual' }))
    expect((screen.getByLabelText('Salário mensal planejado') as HTMLInputElement).value).toBe('5.000,00')
    fireEvent.click(screen.getByRole('button', { name: 'Planejar · Atual' }))
    fireEvent.click(screen.getByRole('button', { name: /IDEAL.*renda/ }))
    expect((screen.getByLabelText('Salário mensal planejado') as HTMLInputElement).value).toBe('9.000,00')
    expect(screen.queryByRole('button', { name: 'Fixar plano do ciclo' })).toBe(null)
  }, 15000)
})
