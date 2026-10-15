// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import { normalizeGoal } from '../lib/goals'
import { createDefaultScenario } from '../lib/scenario'
import { useInvestments } from './useInvestments'

it('acompanha a posição inteira sem duplicar patrimônio e conserva o vínculo no backup', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id,
    investmentHoldings: [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', purpose: 'portfolio', marketValue: 100, transactions: [] }],
    goals: ['viagem', 'carro'].map((id) => normalizeGoal({ id, name: id, kind: 'funding', targetAmount: 500 })),
  } })
  const app = renderHook(() => useInvestments(0, {}, '2026-10'))
  const goal = () => app.result.current.goals[0]
  act(() => { app.result.current.setGoalHoldingAllocation('viagem', 'h', 'full') })
  expect(goal().current).toBe(100)
  expect(app.result.current.summary.financialAssets).toBe(100)
  expect(goal().transactions).toEqual([])
  act(() => { app.result.current.addHoldingTransaction('h', 50, undefined, '2026-10', '2026-10-10') })
  expect(goal().current).toBe(150)
  act(() => { app.result.current.addHoldingTransaction('h', -25, undefined, '2026-10', '2026-10-11') })
  expect(goal().current).toBe(125)
  act(() => { app.result.current.setMarketValue('h', 140) })
  expect(goal().current).toBe(140)
  expect(app.result.current.summary.financialAssets).toBe(140)
  act(() => { app.result.current.setMarketValue('h', 0) })
  act(() => { app.result.current.setGoalHoldingAllocation('carro', 'h', 'full') })
  expect(app.result.current.goals[1].includes).toBeUndefined()
  act(() => { app.result.current.setMarketValue('h', 200) })
  act(() => { app.result.current.setGoalHoldingAllocation('carro', 'h', 50) })
  expect(app.result.current.goals[1].includes).toBeUndefined()

  const backup = JSON.parse(JSON.stringify(repositoryToBackupV9(readRepositoryDocument(), '2026-10-15T12:00:00.000Z')))
  const inspected = inspectBackupPayload(backup)
  expect(inspected.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  app.unmount()
  writeRepositoryDocument(backupV9ToRepository(inspected.backup))
  const restored = renderHook(() => useInvestments(0, {}, '2026-10'))
  expect(restored.result.current.goals[0].current).toBe(200)
  expect(restored.result.current.goals[0].includes).toEqual([{ type: 'holding', id: 'h' }])
  act(() => { restored.result.current.setGoalHoldingAllocation('viagem', 'h', 80) })
  act(() => { restored.result.current.setMarketValue('h', 250) })
  expect(restored.result.current.goals[0].current).toBe(80)
  act(() => { restored.result.current.setGoalHoldingAllocation('carro', 'h', 'full') })
  expect(restored.result.current.goals[1].includes).toBeUndefined()
  restored.unmount()
})
