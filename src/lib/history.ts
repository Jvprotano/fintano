import type {
  BudgetArea,
  CostCategory,
  HistoryPoint,
  HistoryStats,
  MonthlySnapshot,
} from '../types'
import { BUDGET_AREAS } from '../types/constants'
import { finiteNumber, monthKey, normalizeExtraIncomeEntries, uid } from './shared'
import {
  calculateMonthlyInvestmentActuals,
  hasInvestmentLedgerActivity,
  type InvestmentLedgerSource,
} from './investmentActuals'

const INVESTMENT_PROJECTION_VERSION = 1

export function normalizeSnapshot(raw: Partial<MonthlySnapshot> | undefined): MonthlySnapshot {
  const categories: Partial<Record<CostCategory, number>> = {}
  if (raw?.costsByCategory && typeof raw.costsByCategory === 'object') {
    for (const [key, value] of Object.entries(raw.costsByCategory)) {
      categories[key as CostCategory] = finiteNumber(value)
    }
  }

  const cardByArea: Partial<Record<BudgetArea, number>> = {}
  if (raw?.cardByArea && typeof raw.cardByArea === 'object') {
    for (const area of BUDGET_AREAS) {
      const value = finiteNumber(raw.cardByArea[area])
      if (value !== 0) cardByArea[area] = value
    }
  }

  const extraIncomeEntries = normalizeExtraIncomeEntries(raw?.extraIncomeEntries)
  const extraExpenseEntries = normalizeExtraIncomeEntries(raw?.extraExpenseEntries)
  const hasWantAllocationBreakdown = Array.isArray(raw?.wantAllocations) && raw.wantAllocations.length > 0
  const wantAllocations = hasWantAllocationBreakdown
    ? (raw?.wantAllocations ?? [])
        .map((allocation) => ({
          id: typeof allocation?.id === 'string' && allocation.id ? allocation.id : uid(),
          name:
            typeof allocation?.name === 'string' && allocation.name.trim()
              ? allocation.name.trim()
              : 'Desejo',
          planned: Math.max(0, finiteNumber(allocation?.planned)),
          actual: Math.max(0, finiteNumber(allocation?.actual)),
          paidWith:
            allocation?.paidWith === 'account' || allocation?.paidWith === 'card'
              ? allocation.paidWith
              : undefined,
          includedInCardPlan: allocation?.includedInCardPlan === true,
        }))
        .filter(
          (allocation) =>
            allocation.paidWith !== 'card' && !allocation.includedInCardPlan,
        )
    : []
  const allocationsActual = wantAllocations
    .filter((allocation) => !allocation.includedInCardPlan)
    .reduce((sum, allocation) => sum + allocation.actual, 0)
  const allocationsPlanned = wantAllocations
    .filter((allocation) => !allocation.includedInCardPlan)
    .reduce((sum, allocation) => sum + allocation.planned, 0)
  const availableForBudget = finiteNumber(raw?.availableForBudget)
  const paycheckInAccount = finiteNumber(raw?.paycheckInAccount)
  const invested = finiteNumber(raw?.invested)
  // Em ambos os modos salariais, a diferença entre a base e o valor que cai na
  // conta é a previdência do usuário. Isso migra snapshots anteriores sem
  // consultar o cenário atual e reescrever a folha do passado.
  const payrollInvested = finiteNumber(
    raw?.payrollInvested,
    Math.max(0, availableForBudget - paycheckInAccount),
  )
  const investmentPlanCaptured =
    typeof raw?.investmentPlanCaptured === 'boolean'
      ? raw.investmentPlanCaptured
      : typeof raw?.investedPlanned === 'number' && Number.isFinite(raw.investedPlanned)

  return {
    id: raw?.id || uid(),
    month: /^\d{4}-\d{2}$/.test(raw?.month ?? '') ? (raw?.month as string) : monthKey(),
    closedAt: raw?.closedAt || new Date().toISOString(),
    scenarioId: raw?.scenarioId || '',
    scenarioName: raw?.scenarioName || 'Cenário',
    availableForBudget,
    paycheckInAccount,
    extraIncome: Math.max(
      0,
      finiteNumber(
        raw?.extraIncome,
        extraIncomeEntries.reduce((sum, entry) => sum + entry.amount, 0),
      ),
    ),
    extraIncomeEntries,
    thirdPartyAdvanced: finiteNumber(raw?.thirdPartyAdvanced),
    reimbursementsReceived: finiteNumber(raw?.reimbursementsReceived),
    extraExpense: Math.max(
      0,
      finiteNumber(
        raw?.extraExpense,
        extraExpenseEntries.reduce((sum, entry) => sum + entry.amount, 0),
      ),
    ),
    extraExpenseEntries,
    costs: finiteNumber(raw?.costs),
    // Snapshots antigos não separavam plano de realizado: eram a mesma coisa.
    costsPlanned: finiteNumber(raw?.costsPlanned, finiteNumber(raw?.costs)),
    // Havendo detalhamento, ele é autoritativo e remove valores do cartão
    // gravados pela primeira versão do realizado de Desejos.
    wants: hasWantAllocationBreakdown ? allocationsActual : finiteNumber(raw?.wants),
    // Snapshots antigos guardavam somente um total, que era o próprio plano.
    wantsPlanned: hasWantAllocationBreakdown
      ? allocationsPlanned
      : finiteNumber(raw?.wantsPlanned, finiteNumber(raw?.wants)),
    wantAllocations,
    payrollInvested,
    employerInvested: Math.max(0, finiteNumber(raw?.employerInvested)),
    employerInvestmentKnown:
      raw?.employerInvestmentKnown === false
        ? false
        : raw?.employerInvestmentKnown === true || typeof raw?.employerInvested === 'number',
    directInvestedAtClose: finiteNumber(raw?.directInvestedAtClose, invested - payrollInvested),
    openingBalance: Math.max(0, finiteNumber(raw?.openingBalance)),
    investmentProjectionVersion:
      finiteNumber(raw?.investmentProjectionVersion) >= INVESTMENT_PROJECTION_VERSION
        ? INVESTMENT_PROJECTION_VERSION
        : 0,
    invested,
    investmentPlanCaptured,
    // Snapshots antigos não preservavam as metas de investimento e cartão.
    // Igualar ao realizado mantém o passado neutro em vez de inventar desvios.
    investedPlanned: finiteNumber(raw?.investedPlanned, finiteNumber(raw?.invested)),
    balance: finiteNumber(raw?.balance),
    savingsRate: finiteNumber(raw?.savingsRate),
    costsByCategory: categories,
    // Antes das dívidas existirem, o patrimônio gravado *era* o total de ativos.
    grossAssets: finiteNumber(raw?.grossAssets, finiteNumber(raw?.netWorth)),
    // Snapshots anteriores aos bens não tinham imóvel nenhum registrado.
    physicalAssets: finiteNumber(raw?.physicalAssets),
    liabilities: finiteNumber(raw?.liabilities),
    securedLiabilities: finiteNumber(raw?.securedLiabilities),
    netWorth: finiteNumber(raw?.netWorth),
    emergencyFund: finiteNumber(raw?.emergencyFund),
    cardPersonalTotal: finiteNumber(raw?.cardPersonalTotal),
    cardPlanned: finiteNumber(raw?.cardPlanned, finiteNumber(raw?.cardPersonalTotal)),
    cardByArea,
    cashLeftover: finiteNumber(raw?.cashLeftover),
    note: raw?.note?.trim() || undefined,
    corrections: raw?.corrections,
    planEstimated: raw?.planEstimated ?? (typeof raw?.costsPlanned !== 'number' || typeof raw?.wantsPlanned !== 'number'),
  }
}

/** Marca um snapshot legado como apto a acompanhar o livro-razão. */
export function migrateSnapshotInvestmentProjection(snapshot: MonthlySnapshot): MonthlySnapshot {
  return {
    ...snapshot,
    investmentProjectionVersion: INVESTMENT_PROJECTION_VERSION,
  }
}

/**
 * Projeção híbrida do Histórico:
 * - plano, patrimônio, fatura e demais fatos continuam congelados;
 * - aportes/resgates diretos acompanham a competência atual do livro-razão;
 * - previdência em folha permanece a que foi registrada no fechamento.
 *
 * Snapshots legados só passam a usar a projeção quando existe atividade real
 * no livro-razão. Depois de migrados, continuam projetados mesmo se todas as
 * movimentações forem removidas, para que zero também seja um resultado válido.
 */
export function projectHistoryInvestments(
  snapshots: MonthlySnapshot[],
  source: InvestmentLedgerSource,
): MonthlySnapshot[] {
  const ledgerIsAuthoritative =
    hasInvestmentLedgerActivity(source) ||
    snapshots.some(
      (snapshot) => snapshot.investmentProjectionVersion >= INVESTMENT_PROJECTION_VERSION,
    )

  if (!ledgerIsAuthoritative) return snapshots

  return snapshots.map((snapshot) => {
    const directInvested = calculateMonthlyInvestmentActuals({
      ...source,
      month: snapshot.month,
    })
    const invested = snapshot.payrollInvested + directInvested.directNet
    const incomeBase = snapshot.availableForBudget + snapshot.extraIncome

    return {
      ...snapshot,
      invested,
      directInvestedAtClose: directInvested.directNet,
      openingBalance: directInvested.openingBalance,
      investedPlanned: snapshot.investmentPlanCaptured ? snapshot.investedPlanned : invested,
      savingsRate: incomeBase > 0 ? (invested / incomeBase) * 100 : 0,
      balance:
        snapshot.paycheckInAccount +
        snapshot.extraIncome + (snapshot.reimbursementsReceived ?? 0) - (snapshot.thirdPartyAdvanced ?? 0) -
        snapshot.extraExpense -
        snapshot.costs -
        snapshot.wants -
        directInvested.directNet,
    }
  })
}

export interface NetWorthComposition {
  financialAssets: number
  unsecuredLiabilities: number
  financialNetWorth: number
  physicalAssets: number
  securedLiabilities: number
  propertyEquity: number
  liabilities: number
  netWorth: number
}

export interface NetWorthChangeBreakdown {
  financialAssetsChange: number
  physicalAssetsChange: number
  debtEffect: number
  netWorthChange: number
}

/**
 * Reconcilia o patrimônio a partir das fontes congeladas no fechamento.
 * `grossAssets` é um nome legado: ele guarda apenas reserva, carteira e metas.
 */
export function calculateNetWorthComposition(
  snapshot: MonthlySnapshot,
): NetWorthComposition {
  const financialAssets = Math.max(0, snapshot.grossAssets)
  const physicalAssets = Math.max(0, snapshot.physicalAssets)
  const liabilities = Math.max(0, snapshot.liabilities)
  const securedLiabilities = Math.min(
    Math.max(0, liabilities),
    Math.max(0, snapshot.securedLiabilities),
  )
  const unsecuredLiabilities = liabilities - securedLiabilities
  const financialNetWorth = financialAssets - unsecuredLiabilities
  const propertyEquity = physicalAssets - securedLiabilities

  return {
    financialAssets,
    unsecuredLiabilities,
    financialNetWorth,
    physicalAssets,
    securedLiabilities,
    propertyEquity,
    liabilities,
    netWorth: financialNetWorth + propertyEquity,
  }
}

/**
 * Explica a mudança do patrimônio entre dois fechamentos. Reduzir uma dívida
 * é efeito positivo; aumentar o saldo devedor é efeito negativo.
 */
export function calculateNetWorthChange(
  previous: MonthlySnapshot,
  latest: MonthlySnapshot,
): NetWorthChangeBreakdown {
  const previousComposition = calculateNetWorthComposition(previous)
  const latestComposition = calculateNetWorthComposition(latest)
  const financialAssetsChange =
    latestComposition.financialAssets - previousComposition.financialAssets
  const physicalAssetsChange = latestComposition.physicalAssets - previousComposition.physicalAssets
  const debtEffect = previousComposition.liabilities - latestComposition.liabilities

  return {
    financialAssetsChange,
    physicalAssetsChange,
    debtEffect,
    netWorthChange: latestComposition.netWorth - previousComposition.netWorth,
  }
}

/** Ordem cronológica, com as variações em relação ao mês fechado anterior. */
export function buildHistoryPoints(snapshots: MonthlySnapshot[]): HistoryPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))

  return ordered.map((snapshot, index) => {
    const previous = index > 0 ? ordered[index - 1] : null
    const composition = calculateNetWorthComposition(snapshot)
    const previousComposition = previous ? calculateNetWorthComposition(previous) : null
    return {
      ...snapshot,
      // O Histórico exibe a equação das fontes, não um total redundante que
      // possa ter ficado obsoleto em snapshots antigos.
      netWorth: composition.netWorth,
      financialAssets: composition.financialAssets,
      unsecuredLiabilities: composition.unsecuredLiabilities,
      financialNetWorth: composition.financialNetWorth,
      propertyEquity: composition.propertyEquity,
      netWorthDelta: previousComposition
        ? composition.netWorth - previousComposition.netWorth
        : null,
      costsDelta: previous ? snapshot.costs - previous.costs : null,
      wantsDelta: previous ? snapshot.wants - previous.wants : null,
      investedDelta: previous ? snapshot.invested - previous.invested : null,
      cardDelta: previous ? snapshot.cardPersonalTotal - previous.cardPersonalTotal : null,
    }
  })
}

export function calculateHistoryStats(points: HistoryPoint[]): HistoryStats {
  if (points.length === 0) {
    return {
      months: 0,
      averageCosts: 0,
      averageWants: 0,
      averageInvested: 0,
      averageSavingsRate: 0,
      averageCardPersonal: 0,
      netWorthGrowth: 0,
      netWorthGrowthPct: 0,
      bestSavingsMonth: null,
    }
  }

  const mean = (pick: (point: HistoryPoint) => number) =>
    points.reduce((sum, point) => sum + pick(point), 0) / points.length

  const first = points[0]
  const last = points[points.length - 1]
  const netWorthGrowth = last.netWorth - first.netWorth
  const best = points.reduce((top, point) => (point.savingsRate > top.savingsRate ? point : top), points[0])

  return {
    months: points.length,
    averageCosts: mean((p) => p.costs),
    averageWants: mean((p) => p.wants),
    averageInvested: mean((p) => p.invested),
    averageSavingsRate: mean((p) => p.savingsRate),
    averageCardPersonal: mean((p) => p.cardPersonalTotal),
    netWorthGrowth,
    netWorthGrowthPct: first.netWorth > 0 ? (netWorthGrowth / first.netWorth) * 100 : 0,
    bestSavingsMonth: best,
  }
}

/**
 * Custo médio por mês fechado, para a reserva deixar de depender do custo do
 * cenário aberto. Sem histórico suficiente devolve null e a reserva volta a usar
 * o custo planejado.
 */
export function averageMonthlyCosts(points: HistoryPoint[], months = 6): number | null {
  const recent = points.slice(-months)
  if (recent.length < 2) return null
  // Sem classificação completa da parte pessoal, não presume custo zero no cartão.
  if (recent.some((point) => Math.abs(point.cardPersonalTotal - Object.values(point.cardByArea).reduce((sum, value) => sum + (value ?? 0), 0)) > 0.005)) return null
  return recent.reduce((sum, point) => sum + point.costs + (point.cardByArea.necessidades ?? 0), 0) / recent.length
}
