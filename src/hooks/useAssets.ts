import { useCallback, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { Asset, AssetKind } from '../types'
import { defaultAppreciationFor, normalizeAsset } from '../lib/assets'
import { finiteNumber, nowIso, uid } from '../lib/shared'

/**
 * Bens. Guarda só a lista — o resumo (equity, juros do mês) depende das
 * dívidas e é montado em `useFinancas`, onde os dois módulos se encontram.
 */
export function useAssets() {
  const [stored, setStored] = useRepositoryState<Asset[]>('assets', [])
  const assets = useMemo(
    () => (Array.isArray(stored) ? stored.map(normalizeAsset) : []),
    [stored],
  )

  const addAsset = useCallback(
    (input: {
      name: string
      kind: AssetKind
      value: number
      annualAppreciationPct?: number
      rentEquivalent?: number
      note?: string
    }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return false
      return setStored((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeAsset({
          ...input,
          name: trimmed,
          annualAppreciationPct:
            input.annualAppreciationPct ?? defaultAppreciationFor(input.kind),
          id: uid(),
          createdAt: nowIso(),
        }),
      ])
    },
    [setStored],
  )

  const updateAsset = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<Asset, 'name' | 'kind' | 'value' | 'annualAppreciationPct' | 'rentEquivalent' | 'note'>
      >,
    ) => {
      setStored((prev) =>
        prev.map((asset) => (asset.id === id ? normalizeAsset({ ...asset, ...patch }) : asset)),
      )
    },
    [setStored],
  )

  const removeAsset = useCallback(
    (id: string) => setStored((prev) => prev.filter((asset) => asset.id !== id)),
    [setStored],
  )

  /** Marcação a mercado: o valor do bem hoje, como você reavaliaria uma posição. */
  const setAssetValue = useCallback(
    (id: string, value: number) => {
      setStored((prev) =>
        prev.map((asset) =>
          asset.id === id ? { ...asset, value: Math.max(0, finiteNumber(value)) } : asset,
        ),
      )
    },
    [setStored],
  )

  return { assets, addAsset, updateAsset, removeAsset, setAssetValue }
}
