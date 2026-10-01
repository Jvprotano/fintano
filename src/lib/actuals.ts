import type {
  ActualsSummary,
  CostCategory,
  CostItem,
  MonthlyActuals,
  WantItem,
} from '../types'
import { personalCostValue } from './scenario'
import { finiteNumber, monthKey, normalizeExtraIncomeEntries } from './shared'

// ---------------------------------------------------------------------------
// Realizado do mês.
//
// A fatura do cartão já traz o realizado de graça: ela lista o que aconteceu.
// O que sai em débito ou boleto não tem essa sorte — a luz orçada em R$ 200 vem
// R$ 260 e o app nunca sabe. Sem isto o "custo médio real" do histórico é só a
// média dos planos, e a meta da reserva de emergência herda o mesmo erro.
//
// O plano pode estimar o restante, mas somente valores informados são realizados.
// ---------------------------------------------------------------------------

export function normalizeActuals(raw: Partial<MonthlyActuals> | undefined): MonthlyActuals {
  const normalizeAmounts = (source: unknown) => {
    const amounts: Record<string, number> = {}
    if (!source || typeof source !== 'object') return amounts
    for (const [id, value] of Object.entries(source)) {
      const amount = finiteNumber(value, -1)
      // Zero é uma informação legítima ("não paguei este mês"); negativo não é.
      if (amount >= 0) amounts[id] = amount
    }
    return amounts
  }

  const costs = normalizeAmounts(raw?.costs)
  const wants = normalizeAmounts(raw?.wants)

  const extraIncome = normalizeExtraIncomeEntries(raw?.extraIncome)
  const extraExpenses = normalizeExtraIncomeEntries(raw?.extraExpenses)

  return {
    month: /^\d{4}-\d{2}$/.test(raw?.month ?? '') ? (raw?.month as string) : monthKey(),
    ...(raw?.paycheck && typeof raw.paycheck === 'object' &&
      Number.isFinite(raw.paycheck.amount) && raw.paycheck.amount >= 0
      ? { paycheck: { amount: raw.paycheck.amount,
        payrollInvestment: Math.max(0, finiteNumber(raw.paycheck.payrollInvestment)),
        employerInvestment: Math.max(0, finiteNumber(raw.paycheck.employerInvestment)) } }
      : {}),
    costs,
    wants,
    extraIncome,
    extraExpenses,
  }
}

export function summarizeActuals(
  costs: CostItem[],
  actuals: Partial<MonthlyActuals> | undefined,
  month = monthKey(),
  wants: WantItem[] = [],
  knownCosts: CostItem[] = costs,
  knownWants: WantItem[] = wants,
): ActualsSummary {
  const informed = actuals?.costs ?? {}
  const byCategory = new Map<CostCategory, number>()

  const accountCosts = costs.filter((cost) => cost.paidWith !== 'card')
  const activeCostIds = new Set(accountCosts.map((cost) => cost.id))
  const knownCostById = new Map(knownCosts.map((cost) => [cost.id, cost]))
  const costRows = [
    ...accountCosts,
    ...Object.keys(informed).filter((id) => !activeCostIds.has(id) &&
      knownCostById.get(id)?.paidWith !== 'card').map((id): CostItem => {
      const known = knownCostById.get(id)
      return known
        ? { ...known, value: 0, sharedAmount: undefined, paidWith: 'account' }
        : { id, name: 'Custo sem cadastro', value: 0, category: 'outros', paidWith: 'account' }
    }),
  ]
  const rows = costRows.map((cost) => {
    const planned = personalCostValue(cost)
    const actual = Object.hasOwn(informed, cost.id) ? informed[cost.id] : null
    const effective = actual ?? planned

    byCategory.set(cost.category, (byCategory.get(cost.category) ?? 0) + effective)

    return { cost, planned, actual, effective, variance: effective - planned }
  })

  const effectiveCosts = rows.reduce((sum, row) => sum + row.effective, 0)
  const confirmedCosts = rows.reduce((sum, row) => sum + (row.actual ?? 0), 0)
  const pendingCosts = rows.reduce((sum, row) => sum + (row.actual === null ? row.planned : 0), 0)
  const plannedCosts = rows.reduce((sum, row) => sum + row.planned, 0)
  const informedWants = actuals?.wants ?? {}
  // O cartão já tem seu realizado na fatura. Esta lista registra somente o que
  // foi destinado fora dele, evitando duas fontes para o mesmo dinheiro.
  const activeWantIds = new Set(wants.map((want) => want.id))
  const knownWantById = new Map(knownWants.map((want) => [want.id, want]))
  const accountWants = [
    ...wants.filter((want) => want.paidWith === 'account'),
    ...Object.keys(informedWants).filter((id) => !activeWantIds.has(id)).map((id): WantItem => ({
      id, name: knownWantById.get(id)?.name ?? 'Desejo sem cadastro',
      plannedAmount: 0, paidWith: 'account', includedInCardPlan: false,
      archivedAt: knownWantById.get(id)?.archivedAt,
    })),
  ]
  const wantRows = accountWants
    .map((want) => {
      const planned = Math.max(0, finiteNumber(want.plannedAmount))
      const actual = Object.hasOwn(informedWants, want.id) ? informedWants[want.id] : null
      const effective = actual ?? planned
      return {
        want,
        planned,
        actual,
        effective,
        variance: effective - planned,
      }
    })
  const effectiveWants = wantRows.reduce((sum, row) => sum + row.effective, 0)
  const confirmedWants = wantRows.reduce((sum, row) => sum + (row.actual ?? 0), 0)
  const pendingWants = wantRows.reduce((sum, row) => sum + (row.actual === null ? row.planned : 0), 0)
  const plannedWants = wantRows.reduce((sum, row) => sum + row.planned, 0)

  return {
    month,
    paycheck: actuals?.paycheck ?? null,
    extraIncome: actuals?.extraIncome ?? [],
    extraIncomeTotal: (actuals?.extraIncome ?? []).reduce((sum, entry) => sum + entry.amount, 0),
    extraExpenses: actuals?.extraExpenses ?? [],
    extraExpenseTotal: (actuals?.extraExpenses ?? []).reduce(
      (sum, entry) => sum + entry.amount,
      0,
    ),
    effectiveCosts,
    confirmedCosts,
    pendingCosts,
    plannedCosts,
    variance: effectiveCosts - plannedCosts,
    informedCount: rows.filter((row) => row.actual !== null).length,
    byCategory,
    rows,
    effectiveWants,
    confirmedWants,
    pendingWants,
    plannedWants,
    wantsVariance: effectiveWants - plannedWants,
    informedWantsCount: wantRows.filter((row) => row.actual !== null).length,
    wantRows,
  }
}
