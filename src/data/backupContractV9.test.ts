import { describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../lib/scenario'
import { backupFinancialTotals } from '../lib/backup'
import type { InvestmentHolding } from '../types'
import type { RepositoryDocument } from './repository'
import {
  backupV8ToRepository, backupV9ToRepository, inspectBackupPayload,
  repositoryToBackupV8, repositoryToBackupV9,
} from './backupV7'

describe('contrato de backup v9', () => {
  it('conserva avaliações e planos aceitos no v8 ao importar e exportar', () => {
    const scenario = createDefaultScenario('Atual')
    const exportedAt = '2026-10-01T12:00:00.000Z'
    const document: RepositoryDocument = { schemaVersion: 7, updatedAt: exportedAt, collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: scenario.id, scenarios: [scenario],
      investmentHoldings: [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', marketValue: 120,
        transactions: [{ id: 'tx', amount: 100, kind: 'opening_balance', kindSource: 'user',
          cycleMonth: '2026-08', date: '2026-08-01T12:00:00.000Z' }] }],
      assets: [{ id: 'a', name: 'Bicicleta', kind: 'outro', value: 300,
        annualAppreciationPct: 0, createdAt: exportedAt }],
      debts: [{ id: 'd', name: 'Parcela', kind: 'outro', balance: 50, monthlyRatePct: 0,
        installment: 10, remainingInstallments: 5, transactions: [], createdAt: exportedAt }],
      actuals: [{ month: '2026-09', costs: {}, wants: {},
        extraIncome: [{ id: 'in', name: 'Extra', amount: 40 }],
        extraExpenses: [{ id: 'out', name: 'Extra', amount: 20 }] }],
    } }
    const old = repositoryToBackupV8(document, exportedAt)
    old.investments.valuations = [
      { id: 'v1', holdingId: 'h', asOf: '2026-08-01T12:00:00.000Z', valueCents: 10000, source: 'current_position' },
      { id: 'v2', holdingId: 'h', asOf: '2026-09-01T12:00:00.000Z', valueCents: 12000, source: 'current_position' },
    ]
    const totals = { availableForBudgetCents: 20000, costsCents: 5000, wantsCents: 1000,
      personalInvestmentCents: 2000, cardCents: 3000 }
    old.planning.cycles[0] = { ...old.planning.cycles[0], id: 'oct', totals: { ...totals, costsCents: 9000 } }
    old.planning.cycles.push({ id: 'aug', month: '2026-08', planningTemplateId: scenario.id,
      status: 'closed', capturedAt: '2026-08-31T12:00:00.000Z', totals })
    old.planning.cycles.push({ id: 'sep', month: '2026-09', planningTemplateId: scenario.id,
      status: 'open', capturedAt: '2026-09-01T12:00:00.000Z', totals: { ...totals, costsCents: 7000 } })

    const inspected = inspectBackupPayload(old)
    expect(inspected.migratedFromVersion).toBe(8)
    expect(inspected.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(inspected.backup)
    const exported = repositoryToBackupV9(restored, exportedAt)
    expect(exported.investments.valuations).toEqual(old.investments.valuations)
    expect(exported.planning.cycles).toEqual(old.planning.cycles)
    expect(exported.investments.holdings[0].currentValueCents).toBe(12000)
    expect(exported.investments.ledgerEntries[0]).toMatchObject({ id: 'tx', kind: 'opening_balance',
      competenceMonth: '2026-08', amountCents: 10000 })
    expect(backupFinancialTotals(exported)).toEqual(backupFinancialTotals(inspected.backup))

    const changed = backupV8ToRepository(old)
    const holdings = changed.collections.investmentHoldings as InvestmentHolding[]
    changed.collections.investmentHoldings = [{ ...holdings[0], marketValue: 150 }]
    const afterChange = repositoryToBackupV9(changed, '2026-10-02T12:00:00.000Z')
    expect(afterChange.investments.valuations.map((valuation) => valuation.valueCents)).toEqual([10000, 12000, 15000])
    expect(afterChange.investments.holdings[0].currentValueCents).toBe(15000)
    expect(afterChange.planning.cycles.find((plan) => plan.id === 'aug')).toEqual(old.planning.cycles.find((plan) => plan.id === 'aug'))
    const editedScenarios = changed.collections.scenarios as Array<typeof scenario>
    changed.collections.scenarios = [{ ...editedScenarios[0], salaryNet: 9000 }]
    const afterPlanEdit = repositoryToBackupV9(changed, '2026-10-03T12:00:00.000Z')
    expect(afterPlanEdit.planning.cycles.find((plan) => plan.id === 'oct')?.totals)
      .not.toEqual(old.planning.cycles[0].totals)
    expect(afterPlanEdit.planning.cycles.find((plan) => plan.id === 'aug')).toEqual(old.planning.cycles.find((plan) => plan.id === 'aug'))
  })

  it('recusa valor atual inválido e planos duplicados antes da substituição', () => {
    const scenario = createDefaultScenario('Atual')
    const document: RepositoryDocument = { schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z', collections: {
      activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: scenario.id, scenarios: [scenario],
      investmentHoldings: [{ id: 'h', name: 'CDB', assetClassId: 'renda-fixa', marketValue: 100,
        transactions: [] }],
    } }
    const backup = repositoryToBackupV9(document)
    backup.investments.holdings[0].currentValueCents = -1
    backup.planning.cycles.push({ ...backup.planning.cycles[0], id: 'duplicado' })
    const errors = inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')
    expect(errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'holding_current_invalid', 'cycle_plan_month_duplicate',
    ]))
  })
})
