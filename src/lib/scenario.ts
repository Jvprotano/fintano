import type {
  BudgetArea,
  BudgetBucket,
  CostCategory,
  CostItem,
  DeductionItem,
  DiversificationSlice,
  EmergencyFundState,
  FinanceScenario,
  FinanceScenarioData,
  SalaryInputMode,
  WantItem,
} from '../types'
import { BUDGET_MODELS, DEFAULT_DIVERSIFICATION, INVESTMENT_DEDUCTION_TYPES } from '../types/constants'
import { finiteNumber, nowIso, normalizeText, uid } from './shared'

const EMPTY_REALIZED: Record<BudgetArea, number> = { necessidades: 0, desejos: 0, investimentos: 0 }

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Parte do custo que sai do seu bolso (o rateio com terceiros fica de fora). */
export function personalCostValue(cost: CostItem): number {
  const shared = Math.max(0, Math.min(finiteNumber(cost.sharedAmount), cost.value))
  return Math.max(0, cost.value - shared)
}

export function isCardEnvelopeWant(want: WantItem): boolean {
  if (want.paidWith === 'account') return false
  const name = normalizeText(want.name)
  return name === 'cartao' || name === 'cartao de credito' || name === 'cartoes'
}

export function isWantIncludedInCardPlan(want: WantItem, wants: WantItem[]): boolean {
  if (want.paidWith === 'account' || isCardEnvelopeWant(want)) return false
  if (!wants.some(isCardEnvelopeWant)) return false
  return want.includedInCardPlan !== false
}

/**
 * Mantém o envelope Cartão como item de primeiro nível e coloca seus detalhes
 * imediatamente abaixo. A ordem relativa de cada nível continua sendo a ordem
 * escolhida pela pessoa.
 */
export function orderWantsForPlanning(wants: WantItem[]): WantItem[] {
  if (!wants.some(isCardEnvelopeWant)) return wants

  const included = wants.filter((want) => isWantIncludedInCardPlan(want, wants))
  const topLevel = wants.filter((want) => !isWantIncludedInCardPlan(want, wants))
  const envelopeIndex = topLevel.findIndex(isCardEnvelopeWant)

  return [
    ...topLevel.slice(0, envelopeIndex + 1),
    ...included,
    ...topLevel.slice(envelopeIndex + 1),
  ]
}

/** Reordena dentro do mesmo nível: o Cartão se move com seus filhos. */
export function moveWantInPlanningOrder(
  wants: WantItem[],
  id: string,
  direction: -1 | 1,
): WantItem[] {
  const ordered = orderWantsForPlanning(wants)
  const target = ordered.find((want) => want.id === id)
  if (!target) return wants

  const targetIsIncluded = isWantIncludedInCardPlan(target, ordered)
  const sameLevel = ordered.filter(
    (want) => isWantIncludedInCardPlan(want, ordered) === targetIsIncluded,
  )
  const currentIndex = sameLevel.findIndex((want) => want.id === id)
  const nextIndex = currentIndex + direction
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sameLevel.length) return ordered

  const reorderedLevel = [...sameLevel]
  ;[reorderedLevel[currentIndex], reorderedLevel[nextIndex]] = [
    reorderedLevel[nextIndex],
    reorderedLevel[currentIndex],
  ]

  const otherLevel = ordered.filter(
    (want) => isWantIncludedInCardPlan(want, ordered) !== targetIsIncluded,
  )
  const included = targetIsIncluded ? reorderedLevel : otherLevel
  const topLevel = targetIsIncluded ? otherLevel : reorderedLevel
  const envelopeIndex = topLevel.findIndex(isCardEnvelopeWant)

  if (envelopeIndex < 0) return topLevel
  return [
    ...topLevel.slice(0, envelopeIndex + 1),
    ...included,
    ...topLevel.slice(envelopeIndex + 1),
  ]
}

function normalizeCost(raw: Partial<CostItem> | undefined): CostItem {
  const value = Math.max(0, finiteNumber(raw?.value))
  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Custo',
    value,
    category: (raw?.category as CostCategory) || 'outros',
    sharedAmount: raw?.sharedAmount ? Math.max(0, Math.min(finiteNumber(raw.sharedAmount), value)) : undefined,
    sharedWith: raw?.sharedWith?.trim() || undefined,
    // Contas fixas costumam ser débito/boleto; quem paga no cartão marca o item.
    paidWith: raw?.paidWith === 'card' ? 'card' : 'account',
    archivedAt: raw?.archivedAt && Number.isFinite(Date.parse(raw.archivedAt))
      ? raw.archivedAt : undefined,
  }
}

export function normalizeScenario(scenario: FinanceScenario): FinanceScenario {
  // Cenários antigos podem trazer cartões/reserva embutidos: hoje são módulos
  // globais e o campo é descartado na normalização.
  const rest = { ...scenario } as Partial<
    Record<'creditCardEntries' | 'creditCardSettings' | 'emergencyFund', unknown>
  > &
    FinanceScenario
  delete rest.creditCardEntries
  delete rest.creditCardSettings
  delete rest.emergencyFund

  return {
    ...rest,
    salaryNet: finiteNumber(scenario.salaryNet),
    salaryInputMode:
      scenario.salaryInputMode === 'take_home' ? 'take_home' : 'before_payroll_deductions',
    costs: Array.isArray(scenario.costs) ? scenario.costs.map(normalizeCost) : [],
    wants: Array.isArray(scenario.wants)
      ? scenario.wants.map((want) => ({
          id: want.id || uid(),
          name: want.name || 'Desejo',
          plannedAmount: Math.max(0, finiteNumber(want.plannedAmount)),
          // Desejo é o caixa do cartão: comer fora, viagem, assinatura.
          paidWith: want.paidWith === 'account' ? ('account' as const) : ('card' as const),
          includedInCardPlan:
            want.includedInCardPlan === true
              ? true
              : want.includedInCardPlan === false
                ? false
                : undefined,
          archivedAt: want.archivedAt && Number.isFinite(Date.parse(want.archivedAt))
            ? want.archivedAt : undefined,
        }))
      : [],
    deductions: Array.isArray(scenario.deductions)
      ? scenario.deductions.map((deduction) => ({
          ...deduction,
          value: finiteNumber(deduction.value),
          employerContribution: finiteNumber(deduction.employerContribution),
          linkedHoldingId:
            typeof deduction.linkedHoldingId === 'string' && deduction.linkedHoldingId.trim()
              ? deduction.linkedHoldingId
              : undefined,
        }))
      : [],
    selectedModelId: BUDGET_MODELS.some((m) => m.id === scenario.selectedModelId)
      ? scenario.selectedModelId
      : '50-30-20',
    diversification: Array.isArray(scenario.diversification)
      ? scenario.diversification
      : DEFAULT_DIVERSIFICATION,
    customModel: scenario.customModel ?? { n: 50, d: 30, i: 20 },
  }
}

export function createDefaultScenario(name = 'Atual'): FinanceScenario {
  const timestamp = nowIso()

  return {
    id: uid(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    salaryNet: 0,
    salaryInputMode: 'before_payroll_deductions',
    costs: [],
    wants: [],
    deductions: [],
    selectedModelId: '50-30-20',
    diversification: DEFAULT_DIVERSIFICATION,
    customModel: { n: 50, d: 30, i: 20 },
  }
}

export function cloneScenario(source: FinanceScenario, name: string): FinanceScenario {
  const timestamp = nowIso()
  return { ...structuredClone(source), id: uid(), name, createdAt: timestamp, updatedAt: timestamp }
}

// ---------------------------------------------------------------------------
// Migração do formato v2
// ---------------------------------------------------------------------------

interface LegacyWantItem {
  id: string
  name: string
  mode?: 'percentage' | 'fixed'
  percentage?: number
  fixedAmount?: number
}

interface LegacyAllocationTransfer {
  from: BudgetArea
  to: BudgetArea
  amount: number
}

export interface LegacyScenario {
  id?: string
  name?: string
  createdAt?: string
  updatedAt?: string
  salaryNet?: number
  salaryInputMode?: SalaryInputMode
  costs?: CostItem[]
  wants?: LegacyWantItem[]
  deductions?: DeductionItem[]
  selectedModelId?: string
  diversification?: DiversificationSlice[]
  customModel?: { n: number; d: number; i: number }
  allocationTransfers?: LegacyAllocationTransfer[]
  emergencyFundCurrent?: number
}

function resolveModelPercentages(
  selectedModelId?: string,
  customModel?: { n: number; d: number; i: number },
) {
  const model = BUDGET_MODELS.find((m) => m.id === selectedModelId) ?? BUDGET_MODELS[0]
  if (model.id === 'custom' && customModel) {
    return { necessidades: customModel.n, desejos: customModel.d, investimentos: customModel.i }
  }
  return {
    necessidades: model.necessidades,
    desejos: model.desejos,
    investimentos: model.investimentos,
  }
}

/**
 * Converte um cenário v2 para o v3. Desejos percentuais viram valores planejados
 * equivalentes ao que a fórmula antiga exibia (incluindo o efeito das
 * transferências de meta, que deixam de existir no v3).
 */
export function convertLegacyScenario(legacy: LegacyScenario): FinanceScenario {
  const timestamp = nowIso()
  const salaryNet = finiteNumber(legacy.salaryNet)
  const salaryInputMode: SalaryInputMode =
    legacy.salaryInputMode === 'take_home' ? 'take_home' : 'before_payroll_deductions'
  const deductions = Array.isArray(legacy.deductions) ? legacy.deductions : []
  const totalDeductions = deductions.reduce((sum, d) => sum + finiteNumber(d.value), 0)
  const investmentDeductions = deductions
    .filter((d) => INVESTMENT_DEDUCTION_TYPES.includes(d.type))
    .reduce((sum, d) => sum + finiteNumber(d.value), 0)
  const benefitDeductions = totalDeductions - investmentDeductions
  const availableForBudget =
    salaryInputMode === 'before_payroll_deductions'
      ? Math.max(0, salaryNet - benefitDeductions)
      : salaryNet + investmentDeductions

  const model = resolveModelPercentages(legacy.selectedModelId, legacy.customModel)
  const allocation: Record<BudgetArea, number> = {
    necessidades: (availableForBudget * model.necessidades) / 100,
    desejos: (availableForBudget * model.desejos) / 100,
    investimentos: (availableForBudget * model.investimentos) / 100,
  }

  for (const transfer of legacy.allocationTransfers ?? []) {
    if (!transfer || transfer.from === transfer.to) continue
    const amount = Math.min(finiteNumber(transfer.amount), allocation[transfer.from] ?? 0)
    if (amount <= 0) continue
    allocation[transfer.from] -= amount
    allocation[transfer.to] += amount
  }

  const legacyWants = Array.isArray(legacy.wants) ? legacy.wants : []
  const fixedWantsAmount = legacyWants
    .filter((w) => w.mode === 'fixed')
    .reduce((sum, w) => sum + finiteNumber(w.fixedAmount), 0)
  const variableWantsBase = Math.max(0, allocation.desejos - fixedWantsAmount)

  const wants: WantItem[] = legacyWants.map((want) => ({
    id: want.id || uid(),
    name: want.name || 'Desejo',
    plannedAmount:
      want.mode === 'fixed'
        ? Math.max(0, finiteNumber(want.fixedAmount))
        : Math.round(variableWantsBase * finiteNumber(want.percentage)) / 100,
  }))

  return normalizeScenario({
    id: legacy.id || uid(),
    name: legacy.name || 'Atual',
    createdAt: legacy.createdAt || timestamp,
    updatedAt: timestamp,
    salaryNet,
    salaryInputMode,
    costs: Array.isArray(legacy.costs) ? legacy.costs : [],
    wants,
    deductions,
    selectedModelId: legacy.selectedModelId || '50-30-20',
    diversification: Array.isArray(legacy.diversification)
      ? legacy.diversification
      : DEFAULT_DIVERSIFICATION,
    customModel: legacy.customModel ?? { n: 50, d: 30, i: 20 },
  })
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function getSelectedModel(state: FinanceScenarioData) {
  const model = BUDGET_MODELS.find((m) => m.id === state.selectedModelId) ?? BUDGET_MODELS[0]
  if (model.id === 'custom') {
    return {
      ...model,
      necessidades: state.customModel.n,
      desejos: state.customModel.d,
      investimentos: state.customModel.i,
    }
  }
  return model
}

function isFixedIncomeSlice(name: string) {
  const normalized = normalizeText(name)
  return (
    normalized.includes('renda fixa') ||
    normalized.includes('tesouro') ||
    normalized.includes('selic') ||
    normalized.includes('cdb') ||
    normalized.includes('poupanca') ||
    normalized.includes('liquidez')
  )
}

function buildBucket(target: number, actual: number, realized: number): BudgetBucket {
  return {
    target,
    actual,
    realized,
    diff: target - actual,
    percentage: target > 0 ? (actual / target) * 100 : 0,
  }
}

export type ScenarioMetrics = ReturnType<typeof calculateScenario>

export function calculateScenario(
  state: FinanceScenario,
  emergencyFund: EmergencyFundState,
  /** Gasto pessoal já realizado no cartão, por área do orçamento. */
  realizedByArea: Record<BudgetArea, number> = EMPTY_REALIZED,
  /** Custo médio dos meses fechados; quando existe, é a base da reserva. */
  averageMonthlyCosts: number | null = null,
) {
  const activeCosts = state.costs.filter((cost) => !cost.archivedAt)
  const activeWants = state.wants.filter((want) => !want.archivedAt)
  const selectedModel = getSelectedModel(state)

  // Custos: o orçamento enxerga apenas a sua parte; o valor cheio fica visível
  // para você saber o tamanho real da conta e o quanto tem a receber.
  const totalCostsGross = activeCosts.reduce((sum, c) => sum + c.value, 0)
  const totalCosts = activeCosts.reduce((sum, c) => sum + personalCostValue(c), 0)
  const totalCostsShared = totalCostsGross - totalCosts

  // Forma de pagamento: o mesmo gasto, visto pelo caixa. O que passa no cartão
  // só deixa a conta quando a fatura vence — e é o que deve reaparecer, sem
  // virar gasto novo, na aba de cartões marcado com a área do orçamento.
  const costsOnCard = activeCosts
    .filter((c) => c.paidWith === 'card')
    .reduce((sum, c) => sum + personalCostValue(c), 0)
  const costsOnAccount = totalCosts - costsOnCard

  const totalDeductions = state.deductions.reduce((sum, d) => sum + d.value, 0)
  const investmentDeductions = state.deductions
    .filter((d) => INVESTMENT_DEDUCTION_TYPES.includes(d.type))
    .reduce((sum, d) => sum + d.value, 0)
  const employerInvestmentContributions = state.deductions
    .filter((d) => INVESTMENT_DEDUCTION_TYPES.includes(d.type))
    .reduce((sum, d) => sum + (d.employerContribution ?? 0), 0)
  const benefitDeductions = totalDeductions - investmentDeductions

  // "Cai na conta": o que sobra do salário depois de toda a folha.
  const paycheckInAccount =
    state.salaryInputMode === 'before_payroll_deductions'
      ? Math.max(0, state.salaryNet - totalDeductions)
      : state.salaryNet

  // Base do orçamento: benefícios (VA, plano etc.) ficam fora porque não são
  // dinheiro livre; previdência descontada em folha continua contando, porque
  // é investimento seu.
  const availableForBudget =
    state.salaryInputMode === 'before_payroll_deductions'
      ? Math.max(0, state.salaryNet - benefitDeductions)
      : state.salaryNet + investmentDeductions

  const budgetAllocation: Record<BudgetArea, number> = {
    necessidades: (availableForBudget * selectedModel.necessidades) / 100,
    desejos: (availableForBudget * selectedModel.desejos) / 100,
    investimentos: (availableForBudget * selectedModel.investimentos) / 100,
  }

  const standaloneWants = activeWants.filter((w) => !isWantIncludedInCardPlan(w, activeWants))
  const cardIncludedWantsAmount = activeWants
    .filter((w) => isWantIncludedInCardPlan(w, activeWants))
    .reduce((sum, w) => sum + w.plannedAmount, 0)
  const totalWantsAmount = standaloneWants.reduce((sum, w) => sum + w.plannedAmount, 0)
  const wantsOnCard = standaloneWants
    .filter((w) => w.paidWith !== 'account')
    .reduce((sum, w) => sum + w.plannedAmount, 0)
  const wantsOnAccount = totalWantsAmount - wantsOnCard
  /** O que o plano inteiro espera ver na fatura deste ciclo. */
  const plannedOnCard = costsOnCard + wantsOnCard

  // Quanto ainda precisa ser aportado pela conta, além do que já sai em folha.
  const directInvestmentTarget = Math.max(0, budgetAllocation.investimentos - investmentDeductions)
  const totalPlannedInvestment = investmentDeductions + directInvestmentTarget
  const savingsRate =
    availableForBudget > 0 ? (totalPlannedInvestment / availableForBudget) * 100 : 0

  // Saldo se o plano inteiro for executado: custos pagos, desejos gastos e
  // aporte direto feito por completo.
  const balanceAfterPlan =
    paycheckInAccount - totalCosts - totalWantsAmount - directInvestmentTarget

  const budgetComparison: Record<BudgetArea, BudgetBucket> = {
    necessidades: buildBucket(
      budgetAllocation.necessidades,
      totalCosts,
      realizedByArea.necessidades,
    ),
    desejos: buildBucket(budgetAllocation.desejos, totalWantsAmount, realizedByArea.desejos),
    investimentos: buildBucket(
      budgetAllocation.investimentos,
      totalPlannedInvestment,
      realizedByArea.investimentos,
    ),
  }

  const totalDiversificationPercentage = state.diversification.reduce(
    (sum, slice) => sum + slice.percentage,
    0,
  )
  const investmentAllocation = state.diversification.map((slice) => ({
    ...slice,
    amount: (directInvestmentTarget * slice.percentage) / 100,
  }))
  const fixedIncomeMonthlyAllocation = investmentAllocation
    .filter((slice) => isFixedIncomeSlice(slice.name))
    .reduce((sum, slice) => sum + slice.amount, 0)

  const costsByCategory = new Map<CostCategory, number>()
  for (const cost of activeCosts) {
    costsByCategory.set(cost.category, (costsByCategory.get(cost.category) || 0) + personalCostValue(cost))
  }

  // A reserva cobre o custo de viver, não o custo que você *planejou*. Havendo
  // meses fechados, a média real é a base; sem eles, cai no plano.
  const emergencyFundUsesHistory = averageMonthlyCosts !== null && averageMonthlyCosts > 0
  const emergencyFundBaseCosts = emergencyFundUsesHistory ? averageMonthlyCosts : totalCosts
  const emergencyFundTarget = emergencyFundBaseCosts * emergencyFund.targetMonths
  const emergencyFundRemaining = Math.max(0, emergencyFundTarget - emergencyFund.current)
  const emergencyFundProgress =
    emergencyFundTarget > 0 ? Math.min(100, (emergencyFund.current / emergencyFundTarget) * 100) : 0
  const emergencyFundMonthsToGoal =
    emergencyFundRemaining > 0 && fixedIncomeMonthlyAllocation > 0
      ? Math.ceil(emergencyFundRemaining / fixedIncomeMonthlyAllocation)
      : 0

  return {
    selectedModel,
    totalCosts,
    totalCostsGross,
    totalCostsShared,
    costsOnCard,
    costsOnAccount,
    wantsOnCard,
    wantsOnAccount,
    cardIncludedWantsAmount,
    plannedOnCard,
    totalDeductions,
    investmentDeductions,
    employerInvestmentContributions,
    benefitDeductions,
    paycheckInAccount,
    availableForBudget,
    budgetAllocation,
    totalWantsAmount,
    directInvestmentTarget,
    totalPlannedInvestment,
    savingsRate,
    balanceAfterPlan,
    budgetComparison,
    totalDiversificationPercentage,
    investmentAllocation,
    fixedIncomeMonthlyAllocation,
    costsByCategory,
    emergencyFundTarget,
    emergencyFundBaseCosts,
    emergencyFundUsesHistory,
    emergencyFundRemaining,
    emergencyFundProgress,
    emergencyFundMonthsToGoal,
  }
}
