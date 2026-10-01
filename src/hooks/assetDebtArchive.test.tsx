// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { useAssets } from './useAssets'
import { useDebts } from './useDebts'

describe('referência de dívida ao bem', () => {
  it('arquiva bem vinculado sem alterar patrimônio e impede exclusão física', () => {
    localStorage.clear()
    writeRepositoryDocument({
      schemaVersion: 7, updatedAt: '2026-10-01T12:00:00.000Z',
      collections: {
        assets: [{ id: 'carro', name: 'Carro', kind: 'veiculo', value: 20000,
          annualAppreciationPct: -10, createdAt: '2026-01-01T12:00:00.000Z' }],
        debts: [{ id: 'financiamento', name: 'Financiamento', kind: 'financiamento',
          balance: 5000, monthlyRatePct: 1, installment: 500, remainingInstallments: 10,
          linkedAssetId: 'carro', createdAt: '2026-01-01T12:00:00.000Z',
          transactions: [{ id: 'amortizacao', amount: -100, date: '2026-09-01T12:00:00.000Z' }],
        }],
      },
    })
    const assets = renderHook(() => useAssets())
    const debts = renderHook(() => useDebts())
    act(() => expect(assets.result.current.removeAsset('carro')).toBe(true))
    expect(readRepositoryDocument().collections.assets).toHaveLength(1)
    expect(assets.result.current.assets[0]).toMatchObject({ id: 'carro', value: 20000 })
    expect(assets.result.current.assets[0].archivedAt).toBeTruthy()
    act(() => expect(assets.result.current.deleteEmptyAsset('carro')).toBe(false))
    act(() => expect(debts.result.current.removeDebt('financiamento')).toBe(true))
    expect(debts.result.current.debts[0]).toMatchObject({
      id: 'financiamento', linkedAssetId: 'carro', transactions: [{ id: 'amortizacao' }],
    })
    expect(debts.result.current.debts[0].archivedAt).toBeTruthy()
    act(() => expect(assets.result.current.restoreAsset('carro')).toBe(true))
    expect(assets.result.current.assets[0].archivedAt).toBeUndefined()
    assets.unmount()
    debts.unmount()
  })
})
