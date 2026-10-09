// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useActuals } from './useActuals'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import type { MonthlyActuals } from '../types'
import { createDefaultScenario } from '../lib/scenario'

it('guarda ajustes por custo e ciclo sem duplicar totais e conserva a ida e volta do backup', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Validação')
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-09T12:00:00.000Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id,
    actuals: [{ month: '2026-09', costs: { mercado: 50 }, wants: {}, extraIncome: [], extraExpenses: [] }],
  } })
  const app = renderHook(() => useActuals([], [], '2026-10'))
  act(() => { app.result.current.adjustCost('mercado', 100.15) })
  act(() => { app.result.current.adjustCost('mercado', 20.25) })
  act(() => { app.result.current.adjustCost('combustivel', 60) })
  act(() => { app.result.current.adjustCost('mercado', -200) })
  act(() => { app.result.current.adjustCost('mercado', -10) })
  act(() => { app.result.current.adjustCost('mercado', 30) })
  expect(app.result.current.summary.confirmedCosts).toBe(90)
  const document = readRepositoryDocument()
  const october = (document.collections.actuals as MonthlyActuals[]).find((item) => item.month === '2026-10')!
  expect(october.costAdjustments?.mercado.map((entry) => entry.delta)).toEqual([100.15, 20.25, -120.4, 30])
  expect((document.collections.actuals as MonthlyActuals[])[0].costs).toEqual({ mercado: 50 })
  const backup = repositoryToBackupV9(document, '2026-10-09T12:00:00.000Z')
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  const restored = backupV9ToRepository(backup).collections.actuals as MonthlyActuals[]
  expect(restored.find((item) => item.month === '2026-10')).toMatchObject({
    costs: october.costs, costAdjustments: october.costAdjustments,
  })
  backup.actuals.cycles.find((item) => item.month === '2026-10')!.costPayments
    .find((item) => item.planItemId === 'mercado')!.adjustments![0].deltaCents = 0
  expect(inspectBackupPayload(backup).issues.some((issue) => issue.code === 'cost_adjustments_invalid')).toBe(true)
  app.unmount()
  const reopened = renderHook(() => useActuals([], [], '2026-10'))
  expect(reopened.result.current.months.find((item) => item.month === '2026-10')?.costAdjustments).toEqual(october.costAdjustments)
  act(() => { reopened.result.current.setActual('mercado', null) })
  expect(reopened.result.current.months.find((item) => item.month === '2026-10')?.costAdjustments?.mercado).toBeUndefined()
  expect(reopened.result.current.summary.confirmedCosts).toBe(60)
  reopened.unmount()
})
