import { saveHistoryCorrection } from '../data/historyCorrections'
import { useCallback, useEffect, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { MonthlySnapshot } from '../types'
import {
  averageMonthlyCosts,
  buildHistoryPoints,
  calculateHistoryStats,
  migrateSnapshotInvestmentProjection,
  normalizeSnapshot,
  projectHistoryInvestments,
} from '../lib/history'
import {
  hasInvestmentLedgerActivity,
  type InvestmentLedgerSource,
} from '../lib/investmentActuals'
import { monthKey, nowIso, uid } from '../lib/shared'

export function useHistory(cycleMonth = monthKey(), investmentSource?: InvestmentLedgerSource) {
  const [stored, setStored] = useRepositoryState<MonthlySnapshot[]>('history', [])
  const snapshots = useMemo(
    () => (Array.isArray(stored) ? stored.map(normalizeSnapshot) : []),
    [stored],
  )
  const ledgerHasActivity = useMemo(
    () => (investmentSource ? hasInvestmentLedgerActivity(investmentSource) : false),
    [investmentSource],
  )
  const projectedSnapshots = useMemo(
    () =>
      investmentSource
        ? projectHistoryInvestments(snapshots, investmentSource)
        : snapshots,
    [investmentSource, snapshots],
  )
  const points = useMemo(() => buildHistoryPoints(projectedSnapshots), [projectedSnapshots])
  const stats = useMemo(() => calculateHistoryStats(points), [points])

  // Uma vez que um backup legado prova ter um livro-razão real, grava a marca
  // de migração. Assim, remover o último aporte depois também projeta zero em
  // vez de fazer o snapshot antigo reaparecer.
  useEffect(() => {
    if (
      !investmentSource ||
      !ledgerHasActivity ||
      !snapshots.some((snapshot) => snapshot.investmentProjectionVersion < 1)
    ) {
      return
    }

    setStored((prev) =>
      (Array.isArray(prev) ? prev : []).map((snapshot) =>
        migrateSnapshotInvestmentProjection(normalizeSnapshot(snapshot)),
      ),
    )
  }, [investmentSource, ledgerHasActivity, setStored, snapshots])

  /** Fecha um mês. Refechar o mesmo mês substitui o registro anterior. */
  const closeMonth = useCallback(
    (snapshot: Omit<MonthlySnapshot, 'id' | 'closedAt'>) => {
      return setStored((prev) => {
        const others = (Array.isArray(prev) ? prev : []).filter(
          (item) => item.month !== snapshot.month,
        )
        return [...others, { ...snapshot, id: uid(), closedAt: nowIso() }].sort((a, b) =>
          a.month.localeCompare(b.month),
        )
      })
    },
    [setStored],
  )

  const removeSnapshot = useCallback(
    (id: string) => setStored((prev) => prev.filter((item) => item.id !== id)),
    [setStored],
  )

  const updateSnapshot = saveHistoryCorrection

  const currentMonth = cycleMonth
  const isCurrentMonthClosed = snapshots.some((item) => item.month === currentMonth)
  /** Custo médio real dos últimos meses fechados — base da reserva. */
  const averageCosts = useMemo(() => averageMonthlyCosts(points), [points])

  return {
    snapshots,
    points,
    stats,
    currentMonth,
    isCurrentMonthClosed,
    averageCosts,
    closeMonth,
    removeSnapshot,
    updateSnapshot,
  }
}
