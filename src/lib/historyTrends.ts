import type { HistoryPoint } from '../types'
import { addMonths, monthsBetween } from './shared'

export type HistoryTrendPeriod = 6 | 12 | 'all'

export interface HistoryTrendPoint {
  month: string
  invested: number | null
  employerInvested: number | null
  creditedInvested: number | null
  costs: number | null
  card: number | null
  wants: number | null
  cumulativeInvested: number | null
  cumulativeCredited: number | null
  savingsRate: number | null
}

/** O período representa meses de calendário, sempre terminando no último fechamento. */
export function selectHistoryPeriod(points: HistoryPoint[], period: HistoryTrendPeriod): HistoryPoint[] {
  const ordered = [...points].sort((a, b) => a.month.localeCompare(b.month))
  const latest = ordered.at(-1)
  return period === 'all' || !latest ? ordered : ordered.filter((point) => point.month >= addMonths(latest.month, 1 - period))
}

export function historyMissingMonths(points: HistoryPoint[], period: HistoryTrendPeriod = 'all'): string[] {
  if (!points.length) return []
  const known = new Set(points.map((point) => point.month))
  const latest = points.at(-1)!.month
  const first = period === 'all' ? points[0].month : [points[0].month, addMonths(latest, 1 - period)].sort().at(-1)!
  return Array.from({ length: Math.max(0, monthsBetween(first, latest)) + 1 }, (_, index) => addMonths(first, index)).filter((month) => !known.has(month))
}

/**
 * Prepara séries de tendência sem reclassificar nenhum fato financeiro:
 * aportes já chegam projetados pelo livro-razão; os demais valores continuam
 * sendo o realizado de cada fechamento.
 */
export function buildHistoryTrendPoints(
  points: HistoryPoint[],
  period: HistoryTrendPeriod,
): HistoryTrendPoint[] {
  let cumulativeInvested = 0
  let cumulativeCredited = 0
  let creditedKnown = true
  const ordered = [...points].sort((a, b) => a.month.localeCompare(b.month))
  let previousMonth: string | undefined
  let continuous = true
  const allPoints: HistoryTrendPoint[] = ordered.flatMap((point) => {
    const missing: HistoryTrendPoint[] = []
    if (previousMonth) for (let month = addMonths(previousMonth, 1); month < point.month; month = addMonths(month, 1)) {
      continuous = false
      missing.push({ month, invested: null, employerInvested: null, creditedInvested: null, costs: null, card: null, wants: null, cumulativeInvested: null, cumulativeCredited: null, savingsRate: null })
    }
    previousMonth = point.month
    cumulativeInvested += point.invested
    const employerInvested = point.employerInvestmentKnown ? point.employerInvested : null
    const creditedInvested = employerInvested === null ? null : point.invested + employerInvested
    if (creditedInvested === null) creditedKnown = false
    else cumulativeCredited += creditedInvested
    return [...missing, {
      month: point.month,
      invested: point.invested,
      employerInvested,
      creditedInvested,
      costs: point.costs,
      card: point.cardPersonalTotal,
      wants: point.wants,
      cumulativeInvested: continuous ? cumulativeInvested : null,
      cumulativeCredited: creditedKnown && continuous ? cumulativeCredited : null,
      savingsRate: point.savingsRate,
    }]
  })

  return period === 'all' ? allPoints : allPoints.slice(-period)
}
