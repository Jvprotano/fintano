import type {
  FinancialGoal,
  GoalHoldingAllocationSummary,
  GoalInclusion,
  GoalInclusionType,
  GoalSummary,
} from '../types'
import { GOAL_PRESET_COLORS } from '../types/constants'
import { finiteNumber, ledgerBalance, monthKey, monthsBetween, normalizeLedger, nowIso, uid } from './shared'

// ---------------------------------------------------------------------------
// Metas.
//
// Uma meta pode ser de duas naturezas, e a diferença importa para o patrimônio
// não ser contado duas vezes:
//
//  · **meta de poupança** — junta dinheiro próprio num livro-razão ("Viagem
//    Japão"). Esse saldo é dinheiro novo e soma ao patrimônio.
//  · **meta de patrimônio** — mede saldos que já existem em outros módulos
//    ("9 mil até dezembro", contando reserva e investimentos). Aqui a meta não
//    guarda nada: ela *engloba*. Some ao patrimônio seria duplicar.
//
// Por isso `ownBalance` (o que a própria meta guarda) e `includedBalance` (o que
// ela apenas observa) andam separados: só o primeiro entra no patrimônio.
// ---------------------------------------------------------------------------

const INCLUSION_TYPES: GoalInclusionType[] = [
  'reserve',
  'investments',
  'goals',
  'class',
  'holding',
  'debts',
  'assets',
]

export const INCLUSION_LABELS: Record<Exclude<GoalInclusionType, 'class' | 'holding'>, string> = {
  reserve: 'Reserva de emergência',
  investments: 'Investimentos',
  goals: 'Outras metas',
  assets: 'Bens',
  debts: '− Dívidas',
}

/** Tudo que já está cadastrado e pode ser englobado por uma meta. */
export interface GoalContext {
  reserveBalance: number
  investmentsBalance: number
  classBalances: { id: string; name: string; marketValue: number }[]
  holdings: {
    id: string
    name: string
    institution?: string
    marketValue: number
  }[]
  /** Saldo do livro-razão de cada meta, indexado por id. */
  goalOwnBalances: Record<string, number>
  /** Valor de mercado dos bens — imóvel, veículo. */
  assetsBalance: number
  /** Saldo devedor total — entra na meta com sinal negativo. */
  debtBalance: number
}

export const EMPTY_GOAL_CONTEXT: GoalContext = {
  reserveBalance: 0,
  investmentsBalance: 0,
  classBalances: [],
  holdings: [],
  goalOwnBalances: {},
  assetsBalance: 0,
  debtBalance: 0,
}

function normalizeInclusions(raw: unknown): GoalInclusion[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const inclusions: GoalInclusion[] = []

  for (const item of raw as Partial<GoalInclusion>[]) {
    if (!item || !INCLUSION_TYPES.includes(item.type as GoalInclusionType)) continue
    const type = item.type as GoalInclusionType
    const id = type === 'class' || type === 'holding' ? item.id : undefined
    if ((type === 'class' || type === 'holding') && !id) continue
    const key = `${type}:${id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    inclusions.push(
      id
        ? {
            type,
            id,
            ...(type === 'holding' && finiteNumber(item.amount) > 0
              ? { amount: finiteNumber(item.amount) }
              : {}),
          }
        : { type },
    )
  }

  // "Investimentos" já cobre qualquer classe: manter as duas confundiria a conta.
  return inclusions.some((item) => item.type === 'investments')
    ? inclusions.filter((item) => item.type !== 'class')
    : inclusions
}

export function normalizeGoal(raw: Partial<FinancialGoal> | undefined, index = 0): FinancialGoal {
  const normalizedIncludes = normalizeInclusions(raw?.includes)
  const inferredKind = normalizedIncludes.some((item) => item.type !== 'holding')
    ? 'tracking'
    : 'funding'
  const kind = raw?.kind === 'funding' || raw?.kind === 'tracking' ? raw.kind : inferredKind
  const includes = normalizedIncludes.filter((item) =>
    kind === 'funding' ? item.type === 'holding' : item.type !== 'holding',
  )

  return {
    id: raw?.id || uid(),
    name: raw?.name?.trim() || 'Meta',
    targetAmount: Math.max(0, finiteNumber(raw?.targetAmount)),
    targetMonth: /^\d{4}-\d{2}$/.test(raw?.targetMonth ?? '') ? raw?.targetMonth : undefined,
    color: raw?.color || GOAL_PRESET_COLORS[index % GOAL_PRESET_COLORS.length],
    transactions: normalizeLedger(raw?.transactions),
    createdAt: raw?.createdAt || nowIso(),
    completedAt: raw?.completedAt || undefined,
    kind,
    includes: includes.length ? includes : undefined,
    archivedAt: raw?.archivedAt && Number.isFinite(Date.parse(raw.archivedAt))
      ? raw.archivedAt : undefined,
  }
}

/** Saldo e rótulo de cada fonte englobada por uma meta. */
function resolveTrackingInclusions(goal: FinancialGoal, context: GoalContext) {
  let balance = 0
  const labels: string[] = []

  for (const inclusion of goal.includes ?? []) {
    if (inclusion.type === 'reserve') {
      balance += context.reserveBalance
      labels.push(INCLUSION_LABELS.reserve)
    } else if (inclusion.type === 'investments') {
      balance += context.investmentsBalance
      labels.push(INCLUSION_LABELS.investments)
    } else if (inclusion.type === 'goals') {
      // Só o saldo próprio das outras metas — o que elas englobam já foi somado
      // aqui pelas inclusões desta meta, ou não pertence a ela.
      for (const [id, own] of Object.entries(context.goalOwnBalances)) {
        if (id !== goal.id) balance += own
      }
      labels.push(INCLUSION_LABELS.goals)
    } else if (inclusion.type === 'assets') {
      balance += context.assetsBalance
      labels.push(INCLUSION_LABELS.assets)
    } else if (inclusion.type === 'debts') {
      // Uma meta de patrimônio *líquido* desconta o que você deve. Junto com
      // "Bens", vira o balanço completo; sozinha, mede só o dinheiro.
      balance -= context.debtBalance
      labels.push(INCLUSION_LABELS.debts)
    } else if (inclusion.type === 'class') {
      const assetClass = context.classBalances.find((item) => item.id === inclusion.id)
      if (!assetClass) continue
      balance += assetClass.marketValue
      labels.push(assetClass.name)
    }
  }

  return { balance, labels }
}

function resolveHoldingAllocations(
  goal: FinancialGoal,
  context: GoalContext,
  remainingByHolding: Map<string, number>,
) {
  const allocations: GoalHoldingAllocationSummary[] = []

  for (const inclusion of goal.includes ?? []) {
    if (inclusion.type !== 'holding' || !inclusion.id) continue
    const holding = context.holdings.find((item) => item.id === inclusion.id)
    if (!holding) continue

    const requested = Math.max(0, finiteNumber(inclusion.amount, holding.marketValue))
    const available = Math.max(0, remainingByHolding.get(holding.id) ?? holding.marketValue)
    const allocated = Math.min(requested, available, holding.marketValue)
    remainingByHolding.set(holding.id, Math.max(0, available - allocated))
    allocations.push({
      holdingId: holding.id,
      holdingName: holding.name,
      institution: holding.institution,
      requested,
      allocated,
      unavailable: Math.max(0, requested - allocated),
    })
  }

  return allocations
}

export function summarizeGoals(
  goals: FinancialGoal[],
  context: GoalContext = EMPTY_GOAL_CONTEXT,
): GoalSummary[] {
  const currentMonth = monthKey()
  const remainingByHolding = new Map(
    context.holdings.map((holding) => [holding.id, Math.max(0, holding.marketValue)]),
  )

  return goals.map((goal) => {
    const ownBalance = Math.max(0, ledgerBalance(goal.transactions))
    const holdingAllocations =
      !goal.archivedAt && goal.kind === 'funding'
        ? resolveHoldingAllocations(goal, context, remainingByHolding)
        : []
    const allocatedBalance = holdingAllocations.reduce(
      (sum, allocation) => sum + allocation.allocated,
      0,
    )
    const tracked =
      !goal.archivedAt && goal.kind === 'tracking'
        ? resolveTrackingInclusions(goal, context)
        : { balance: 0, labels: [] }
    const includedBalance = allocatedBalance + tracked.balance
    const includedLabels = [
      ...holdingAllocations.map((allocation) => allocation.holdingName),
      ...tracked.labels,
    ]
    // Pode ficar negativo: uma meta de patrimônio líquido com mais dívida que ativo.
    const current = ownBalance + includedBalance
    const remaining = Math.max(0, goal.targetAmount - current)
    const monthsLeft = goal.targetMonth ? monthsBetween(currentMonth, goal.targetMonth) : null
    // O mês corrente ainda conta como uma chance de aportar.
    const monthsAvailable = monthsLeft === null ? 0 : Math.max(1, monthsLeft + 1)

    return {
      ...goal,
      ownBalance,
      includedBalance,
      includedLabels,
      holdingAllocations,
      allocatedBalance,
      trackingBalance: tracked.balance,
      current,
      remaining,
      progress:
        goal.targetAmount > 0
          ? Math.max(0, Math.min(100, (current / goal.targetAmount) * 100))
          : 0,
      monthsLeft,
      suggestedMonthly: monthsAvailable > 0 ? remaining / monthsAvailable : 0,
      isComplete: goal.targetAmount > 0 && current >= goal.targetAmount,
    }
  })
}
