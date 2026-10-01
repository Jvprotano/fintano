import { describe, expect, it } from 'vitest'
import { createDefaultScenario } from '../lib/scenario'
import type { RepositoryDocument } from './repository'
import { backupV8ToRepository, inspectBackupPayload, repositoryToBackupV8 } from './backupV7'

describe('backup de cadastros arquivados', () => {
  it('preserva estado, identidade e movimentos de posição e meta', () => {
    const scenario = createDefaultScenario('Atual')
    const archivedAt = '2026-10-01T12:00:00.000Z'
    scenario.costs = [{
      id: 'cost-1', name: 'Internet antiga', value: 100, category: 'contas',
      paidWith: 'account', archivedAt,
    }]
    scenario.wants = [{
      id: 'want-1', name: 'Viagem antiga', plannedAmount: 50,
      paidWith: 'account', archivedAt,
    }]
    const document: RepositoryDocument = {
      schemaVersion: 7, updatedAt: archivedAt,
      collections: {
        activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
        activeScenarioId: scenario.id, scenarios: [scenario],
        investmentHoldings: [{
          id: 'h-1', name: 'CDB antigo', assetClassId: 'renda-fixa', marketValue: 100,
          transactions: [{ id: 'tx-h', amount: 100, cycleMonth: '2026-09', date: archivedAt }],
          archivedAt,
        }],
        goals: [{
          id: 'g-1', name: 'Viagem', targetAmount: 200, color: '#58a', createdAt: archivedAt,
          transactions: [{ id: 'tx-g', amount: 50, cycleMonth: '2026-09', date: archivedAt }],
          archivedAt,
        }],
        debts: [{
          id: 'd-1', name: 'Financiamento antigo', kind: 'financiamento', balance: 0,
          monthlyRatePct: 1, installment: 100, remainingInstallments: 0,
          transactions: [{ id: 'tx-d', amount: -100, cycleMonth: '2026-09', date: archivedAt }],
          createdAt: archivedAt, archivedAt,
        }],
        assets: [{ id: 'a-1', name: 'Casa', kind: 'imovel', value: 200000,
          annualAppreciationPct: 2, createdAt: archivedAt, archivedAt }],
      },
    }

    const backup = repositoryToBackupV8(document, archivedAt)
    expect(backup.investments.holdings[0].archivedAt).toBe(archivedAt)
    expect(backup.goals[0].archivedAt).toBe(archivedAt)
    expect(backup.planning.templates[0].costs[0].archivedAt).toBe(archivedAt)
    expect(backup.planning.templates[0].wants[0].archivedAt).toBe(archivedAt)
    expect(backup.balanceSheet.debts[0].archivedAt).toBe(archivedAt)
    expect(backup.balanceSheet.assets[0].archivedAt).toBe(archivedAt)
    const restored = backupV8ToRepository(backup).collections
    const restoredScenario = (restored.scenarios as Array<typeof scenario>)[0]
    expect(restoredScenario.costs[0].archivedAt).toBe(archivedAt)
    expect(restoredScenario.wants[0].archivedAt).toBe(archivedAt)
    expect((restored.debts as Array<{ id: string; archivedAt: string; transactions: Array<{ id: string }> }>)[0])
      .toMatchObject({ id: 'd-1', archivedAt, transactions: [{ id: 'tx-d' }] })
    expect((restored.assets as Array<{ id: string; archivedAt: string; value: number }>)[0])
      .toMatchObject({ id: 'a-1', archivedAt, value: 200000 })
    expect((restored.investmentHoldings as Array<{ id: string; archivedAt: string; transactions: Array<{ id: string }> }>)[0])
      .toMatchObject({ id: 'h-1', archivedAt, transactions: [{ id: 'tx-h' }] })
    expect((restored.goals as Array<{ id: string; archivedAt: string; transactions: Array<{ id: string }> }>)[0])
      .toMatchObject({ id: 'g-1', archivedAt, transactions: [{ id: 'tx-g' }] })
    backup.goals[0].includes = [{ type: 'holding', id: 'inexistente' }]
    backup.balanceSheet.debts[0].linkedAssetId = 'inexistente'
    expect(inspectBackupPayload(backup).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', code: 'goal_holding_missing', entityId: 'g-1' }),
      expect.objectContaining({ severity: 'warning', code: 'debt_asset_missing', entityId: 'd-1' }),
    ]))
    backup.goals[0].archivedAt = 'data inválida'
    expect(inspectBackupPayload(backup).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', code: 'goal_archive_invalid', entityId: 'g-1' }),
    ]))
  })
})
