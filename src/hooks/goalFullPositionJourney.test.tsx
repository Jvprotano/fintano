// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { backupV9ToRepository, inspectBackupPayload, repositoryToBackupV9 } from '../data/backupV7'
import { normalizeGoal } from '../lib/goals'
import { runRepositoryCommand } from '../data/repositoryCommand'
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

it('divide euros entre metas, preserva legados e conserva quantidades ao mudar câmbio e restaurar backup', () => {
  localStorage.clear()
  const scenario = createDefaultScenario('Atual')
  const settings = { autoUpdate: false, currencies: { EUR: { costsPct: 5, manualRate: 8, manualUpdatedAt: '2026-11-09T12:00:00.000Z', reference: { rate: 6.1741, date: '2026-11-09', fetchedAt: '2026-11-09T12:00:00.000Z' } }, USD: { costsPct: 0 } } }
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-11-09T12:00:00.000Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, exchangeSettings: settings,
    investmentHoldings: [{ id: 'h', name: 'Revolut', assetClassId: 'renda-fixa', purpose: 'portfolio', marketValue: 2531.38, fx: { currency: 'EUR', balance: 410, rate: 6.1741 }, transactions: [] }],
    goals: [normalizeGoal({ id: 'florenca', kind: 'funding', currency: 'EUR', targetAmount: 327.89, includes: [{ type: 'holding', id: 'h', amount: 327.84 }] }), normalizeGoal({ id: 'veneza', kind: 'funding', currency: 'EUR', targetAmount: 356.90, includes: [{ type: 'holding', id: 'h', amount: 2203.54 }] })],
  } })
  const app = renderHook(() => useInvestments(0, {}, '2026-11'))
  expect(app.result.current.goals[0].includes?.[0].amount).toBe(327.84)
  act(() => { app.result.current.setGoalHoldingAllocation('florenca', 'h', { foreignAmount: 53.1, foreignCurrency: 'EUR' }) })
  act(() => { app.result.current.setGoalHoldingAllocation('veneza', 'h', { foreignAmount: 356.9, foreignCurrency: 'EUR' }) })
  expect(app.result.current.goals[0].ownedInTargetCurrency).toBeCloseTo(53.1, 8)
  expect(app.result.current.goals[1].ownedInTargetCurrency).toBeCloseTo(356.9, 8)
  act(() => { app.result.current.setGoalHoldingAllocation('florenca', 'h', { foreignAmount: 100, foreignCurrency: 'EUR' }) })
  expect(app.result.current.goals[0].includes?.[0].foreignAmount).toBe(53.1)
  act(() => { app.result.current.setGoalHoldingAllocation('florenca', 'h', { foreignAmount: 53.1, foreignCurrency: 'USD' }) })
  act(() => { app.result.current.setGoalHoldingAllocation('florenca', 'h', 'full') })
  expect(app.result.current.goals[0].includes?.[0].foreignAmount).toBe(53.1)
  const document = readRepositoryDocument()
  act(() => { runRepositoryCommand({ id: 'quote-update', apply: () => ({ ...document, collections: { ...document.collections, exchangeSettings: { ...settings, currencies: { ...settings.currencies, EUR: { ...settings.currencies.EUR, reference: { ...settings.currencies.EUR.reference, rate: 7 } } } } } }) }) })
  expect(app.result.current.goals[0].ownedInTargetCurrency).toBeCloseTo(53.1, 8)
  expect(app.result.current.goals[1].ownedInTargetCurrency).toBeCloseTo(356.9, 8)
  expect(app.result.current.summary.financialAssets).toBe(2870)
  expect(app.result.current.goals[0].holdingAllocations[0].unavailable).toBe(0)
  const backup = JSON.parse(JSON.stringify(repositoryToBackupV9(readRepositoryDocument(), '2026-11-09T12:00:00.000Z')))
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  app.unmount()
  writeRepositoryDocument(backupV9ToRepository(backup))
  const restored = renderHook(() => useInvestments(0, {}, '2026-11'))
  expect(restored.result.current.goals[1].includes?.[0]).toEqual({ type: 'holding', id: 'h', foreignAmount: 356.9, foreignCurrency: 'EUR' })
  expect(restored.result.current.goals[1].ownedInTargetCurrency).toBeCloseTo(356.9, 8)
  restored.unmount()
  const reduced = backupV9ToRepository(backup)
  const holdings = reduced.collections.investmentHoldings as { fx: { balance: number } }[]
  holdings[0].fx.balance = 100
  writeRepositoryDocument(reduced)
  const short = renderHook(() => useInvestments(0, {}, '2026-11'))
  expect(short.result.current.goals[1].holdingAllocations[0].unavailable).toBeGreaterThan(0)
  expect(short.result.current.goals.reduce((sum, goal) => sum + goal.ownedInTargetCurrency, 0)).toBeCloseTo(100, 8)
  short.unmount()
  for (const patch of [{ foreignAmount: 1.001 }, { foreignAmount: -1 }, { foreignCurrency: 'USD' }, { amountCents: 100 }]) {
    const invalid = structuredClone(backup)
    Object.assign(invalid.goals[0].includes[0], patch)
    expect(inspectBackupPayload(invalid).issues.some((issue) => issue.code === 'goal_allocation_currency_invalid')).toBe(true)
  }
})
