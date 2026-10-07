import { useCallback, useEffect, useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import { recordAssetMove, changeLinkedMovementCycle, removeLinkedMovement } from '../data/financialMovement'
import { deleteUnusedCatalog } from '../data/catalogDeletion'
import { runRepositoryCommand } from '../data/repositoryCommand'
import { resolveLegacyLedgerKind } from '../data/ledgerClassification'
import type {
  EmergencyFundState,
  FinancialGoal,
  GoalInclusion,
  GoalKind,
  InvestmentAssetClass,
  LedgerEntry,
  LedgerEntryKind,
} from '../types'
import { DEFAULT_INVESTMENT_CLASSES, GOAL_PRESET_COLORS } from '../types/constants'
import {
  calculateInvestmentsSummary,
  holdingPurpose,
  normalizeAssetClass,
  normalizeEmergencyFund,
  normalizeHolding,
  usableHoldingValue,
  type FinancialHolding,
  type InvestmentPurpose,
} from '../lib/investments'
import { normalizeGoal, summarizeGoals, type GoalContext } from '../lib/goals'
import { finiteNumber, ledgerBalance, ledgerOperationDates, monthKey, nowIso, uid } from '../lib/shared'
const DEFAULT_EMERGENCY_FUND: EmergencyFundState = {
  current: 0,
  targetMonths: 6,
  transactions: [],
}

function loadInitialClasses(): InvestmentAssetClass[] {
  return DEFAULT_INVESTMENT_CLASSES
}

function validCycleMonth(value: string, fallback: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback
}

/** Aplica um aporte/retirada a um livro-razão, limitando a saída ao saldo. */
function applyLedgerMove(
  transactions: LedgerEntry[],
  amount: number,
  note: string | undefined,
  cycleMonth: string,
  occurredOn?: string,
) {
  const balance = ledgerBalance(transactions)
  const delta = amount < 0 ? -Math.min(-amount, balance) : amount
  if (delta === 0) return null
  return [
    ...transactions,
    {
      id: uid(),
      amount: delta,
      kind: delta > 0 ? 'contribution' as const : 'withdrawal' as const,
      kindSource: 'user' as const,
      cycleMonth,
      ...ledgerOperationDates(occurredOn),
      note: note?.trim() || undefined,
    },
  ]
}

/**
 * `liabilities` vem do módulo de dívidas e `physicalAssets` do de bens: juntos
 * fecham o balanço. `securedLiabilities` é a fatia da dívida que tem bem do
 * outro lado — é ela que separa "quanto dinheiro eu tenho" de "quanto eu valho".
 */
export function useInvestments(
  liabilities = 0,
  { securedLiabilities = 0, physicalAssets = 0 } = {},
  activeCycleMonth = monthKey(),
  pensionHoldingIds: string[] = [],
) {
  const [storedFund, setStoredFund] = useRepositoryState<EmergencyFundState>(
    'emergencyFund',
    DEFAULT_EMERGENCY_FUND,
  )
  const legacyEmergencyFund = useMemo(
    () => normalizeEmergencyFund(storedFund),
    [storedFund],
  )

  const [storedHoldings, setHoldings] = useRepositoryState<FinancialHolding[]>(
    'investmentHoldings',
    [],
  )
  const holdings = useMemo(
    () => (Array.isArray(storedHoldings) ? storedHoldings.map((raw) => {
      const holding = normalizeHolding(raw)
      return pensionHoldingIds.includes(holding.id) && !holding.pension ? { ...holding, pension: {} } : holding
    }) : []),
    [storedHoldings, pensionHoldingIds],
  )

  const [storedClasses, setClasses] = useRepositoryState<InvestmentAssetClass[]>(
    'investmentClasses',
    loadInitialClasses,
  )
  const investmentClasses = useMemo(
    () =>
      Array.isArray(storedClasses) && storedClasses.length
        ? storedClasses.map((item, index) => normalizeAssetClass(item, index))
        : DEFAULT_INVESTMENT_CLASSES,
    [storedClasses],
  )

  const [storedGoals, setGoals] = useRepositoryState<FinancialGoal[]>('goals', [])
  const goals = useMemo(
    () => (Array.isArray(storedGoals) ? storedGoals.map((item, i) => normalizeGoal(item, i)) : []),
    [storedGoals],
  )

  const reserveHoldings = useMemo(
    () => holdings.filter((holding) => holdingPurpose(holding) === 'emergency_fund'),
    [holdings],
  )
  const portfolioHoldings = useMemo(
    () => holdings.filter((holding) => holdingPurpose(holding) === 'portfolio'),
    [holdings],
  )

  /**
   * Migração v1 -> posições:
   * - uma base antiga tinha um único bucket com saldo/transações;
   * - criamos uma posição de Renda Fixa com a mesma trilha, sem inventar
   *   instituição, produto, benchmark ou liquidez;
   * - depois esvaziamos apenas o bucket antigo, preservando `targetMonths`.
   *
   * Enquanto o effect ainda não rodou, os cálculos usam o saldo legado como
   * fallback. Quando a posição aparece, o fallback deixa de somar — sem frame de
   * patrimônio duplicado.
   */
  useEffect(() => {
    if (reserveHoldings.length > 0 || legacyEmergencyFund.current <= 0) return

    setHoldings((prev) => {
      const normalized = Array.isArray(prev) ? prev.map(normalizeHolding) : []
      if (normalized.some((holding) => holdingPurpose(holding) === 'emergency_fund')) {
        return normalized
      }
      return [
        ...normalized,
        normalizeHolding({
          id: uid(),
          name: 'Reserva migrada',
          assetClassId: 'renda-fixa',
          purpose: 'emergency_fund',
          marketValue: legacyEmergencyFund.current,
          transactions: legacyEmergencyFund.transactions,
        }),
      ]
    })

    setStoredFund((prev) => {
      const normalized = normalizeEmergencyFund(prev)
      return { current: 0, targetMonths: normalized.targetMonths, transactions: [] }
    })
  }, [legacyEmergencyFund, reserveHoldings.length, setHoldings, setStoredFund])

  // Só o livro-razão das metas soma ao patrimônio. O que uma meta *engloba* já
  // está contado na reserva ou nas posições — somar de novo duplicaria.
  const goalOwnBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    for (const goal of goals) balances[goal.id] = Math.max(0, ledgerBalance(goal.transactions))
    return balances
  }, [goals])
  const goalsBalance = useMemo(
    () => Object.values(goalOwnBalances).reduce((sum, value) => sum + value, 0),
    [goalOwnBalances],
  )

  // Posições -----------------------------------------------------------------

  const addHolding = useCallback(
    (input: {
      name: string
      assetClassId: string
      institution?: string
      initialAmount?: number
      initialKind?: 'opening_balance' | 'contribution'
      initialCycleMonth?: string
      occurredOn?: string
      note?: string
      purpose?: InvestmentPurpose
      benchmark?: string
      liquidity?: string
    }) => {
      const initial = Math.max(0, finiteNumber(input.initialAmount))
      return setHoldings((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeHolding({
          id: uid(),
          name: input.name,
          assetClassId: input.assetClassId,
          institution: input.institution,
          purpose: input.purpose ?? 'portfolio',
          benchmark: input.benchmark,
          liquidity: input.liquidity,
          marketValue: initial,
          transactions:
            initial > 0
              ? [
                  {
                    id: uid(),
                    amount: initial,
                    ...ledgerOperationDates(input.occurredOn),
                    kind: input.initialKind ?? 'opening_balance',
                    kindSource: 'user',
                    cycleMonth: validCycleMonth(input.initialCycleMonth ?? activeCycleMonth, activeCycleMonth),
                    note: input.note?.trim() || undefined,
                  },
                ]
              : [],
        }),
      ])
    },
    [activeCycleMonth, setHoldings],
  )

  const updateHolding = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          FinancialHolding,
          | 'name'
          | 'assetClassId'
          | 'institution'
          | 'marketValue'
          | 'purpose'
          | 'benchmark'
          | 'liquidity'
          | 'pension'
        >
      >,
      expectedRevision?: string | null,
    ) => {
      const current = holdings.find((holding) => holding.id === id)
      if (!current) return false
      const candidate = { ...current, ...patch }
      const pension = candidate.pension
      if (!Number.isFinite(candidate.marketValue) || candidate.marketValue < 0 || pension && (candidate.purpose === 'emergency_fund' ||
        [pension.employerBalance, pension.employerRestrictedBalance].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)) ||
        pension.employerBalance !== undefined && pension.employerBalance > candidate.marketValue ||
        pension.employerRestrictedBalance !== undefined && (pension.employerBalance === undefined || pension.employerRestrictedBalance > pension.employerBalance))) return false
      if (expectedRevision !== undefined) return runRepositoryCommand({ id: uid(), expectedRevision, apply: (document) => ({
        ...document, collections: { ...document.collections, investmentHoldings:
          (document.collections.investmentHoldings as FinancialHolding[] ?? []).map((holding) => holding.id === id ? normalizeHolding({ ...holding, ...patch }) : holding),
        },
      }) }).ok
      return setHoldings((prev) =>
        (Array.isArray(prev) ? prev : []).map((holding) =>
          holding.id === id ? normalizeHolding({ ...holding, ...patch }) : normalizeHolding(holding),
        ),
      )
    },
    [holdings, setHoldings],
  )

  const removeHolding = useCallback(
    (id: string) => {
      return setHoldings((prev) =>
        (Array.isArray(prev) ? prev : []).map((holding) =>
          holding.id === id ? { ...holding, archivedAt: nowIso() } : holding,
        ),
      )
    },
    [setHoldings],
  )

  const restoreHolding = useCallback(
    (id: string) => setHoldings((prev) =>
      (Array.isArray(prev) ? prev : []).map((holding) =>
        holding.id === id ? { ...holding, archivedAt: undefined } : holding,
      ),
    ),
    [setHoldings],
  )
  const deleteEmptyHolding = useCallback((id: string) => deleteUnusedCatalog('holding', id), [])
  const resolveHoldingKind = useCallback((holdingId: string, entryId: string, kind: LedgerEntryKind) =>
    resolveLegacyLedgerKind('holding', holdingId, entryId, kind), [])

  const addHoldingTransaction = useCallback(
    (holdingId: string, amount: number, note?: string, cycleMonth = activeCycleMonth, occurredOn?: string) =>
      recordAssetMove('holding', holdingId, amount, cycleMonth, occurredOn, note), [activeCycleMonth])

  const setHoldingTransactionCycle = useCallback((holdingId: string, transactionId: string, month: string) => {
    if (holdings.find((row) => row.id === holdingId)?.transactions.find((tx) => tx.id === transactionId)?.payrollMonth) return false
    const linked = changeLinkedMovementCycle('holding', holdingId, transactionId, month)
    if (linked !== null) return linked
    return setHoldings((prev) => prev.map((raw) => raw.id === holdingId ? { ...raw,
      transactions: raw.transactions.map((tx) => tx.id === transactionId ? { ...tx, cycleMonth: validCycleMonth(month, activeCycleMonth) } : tx),
    } : raw))
  }, [activeCycleMonth, holdings, setHoldings])

  const removeHoldingTransaction = useCallback((holdingId: string, transactionId: string) => {
    if (holdings.find((row) => row.id === holdingId)?.transactions.find((tx) => tx.id === transactionId)?.payrollMonth) return false
    const current = holdings.find((row) => row.id === holdingId)
    const entry = current?.transactions.find((tx) => tx.id === transactionId)
    if (current?.pension && !entry?.operationId && current.marketValue - (entry?.amount ?? 0) < (current.pension.employerBalance ?? current.marketValue)) return false
    const linked = removeLinkedMovement('holding', holdingId, transactionId)
    if (linked !== null) return linked
    return setHoldings((prev) => prev.map((raw) => {
      const holding = normalizeHolding(raw)
      if (holding.id !== holdingId) return holding
      const removed = holding.transactions.find((tx) => tx.id === transactionId)
      if (!removed || holding.marketValue - removed.amount < -0.005) return holding
      return { ...holding, transactions: holding.transactions.filter((tx) => tx.id !== transactionId), marketValue: holding.marketValue - removed.amount }
    }))
  }, [holdings, setHoldings])

  // Marcação a mercado: define o saldo atual sem registrar aporte/retirada.
  const setMarketValue = useCallback(
    (holdingId: string, value: number) => {
      setHoldings((prev) =>
        (Array.isArray(prev) ? prev : []).map((raw) => {
          const holding = normalizeHolding(raw)
          return holding.id === holdingId
            ? { ...holding, marketValue: Math.max(0, value) }
            : holding
        }),
      )
    },
    [setHoldings],
  )

  // Reserva de emergência ----------------------------------------------------

  const reserveBalance =
    reserveHoldings.length > 0
      ? reserveHoldings.reduce((sum, holding) => sum + holding.marketValue, 0)
      : legacyEmergencyFund.current

  const emergencyFund = useMemo<EmergencyFundState>(
    () => ({
      current: reserveBalance,
      targetMonths: legacyEmergencyFund.targetMonths,
      transactions:
        reserveHoldings.length > 0
          ? reserveHoldings.flatMap((holding) => holding.transactions)
          : legacyEmergencyFund.transactions,
    }),
    [legacyEmergencyFund.targetMonths, legacyEmergencyFund.transactions, reserveBalance, reserveHoldings],
  )

  const setEmergencyFundTargetMonths = useCallback(
    (months: number) => {
      setStoredFund((prev) => {
        const normalized = normalizeEmergencyFund(prev)
        return {
          current: 0,
          targetMonths: Math.max(1, Math.round(months)),
          transactions: [],
          ...(reserveHoldings.length === 0 && normalized.current > 0
            ? { current: normalized.current, transactions: normalized.transactions }
            : {}),
        }
      })
    },
    [reserveHoldings.length, setStoredFund],
  )

  /**
   * Compatibilidade com componentes/integrações antigas: se já há posição de
   * reserva, a movimentação vai para a primeira; se ainda não houve migração,
   * continua no bucket legado e será migrada logo depois.
   */
  const addEmergencyFundTransaction = useCallback(
    (amount: number, note?: string, cycleMonth = activeCycleMonth, occurredOn?: string) => {
      const competence = validCycleMonth(cycleMonth, activeCycleMonth)
      const firstReserve = reserveHoldings[0]
      if (firstReserve) {
        return addHoldingTransaction(firstReserve.id, amount, note, competence, occurredOn)
      }
      return setStoredFund((prev) => {
        const fund = normalizeEmergencyFund(prev)
        const transactions = applyLedgerMove(fund.transactions, amount, note, competence, occurredOn)
        if (!transactions) return fund
        return { ...fund, transactions, current: ledgerBalance(transactions) }
      })
    },
    [activeCycleMonth, addHoldingTransaction, reserveHoldings, setStoredFund],
  )

  const setEmergencyFundTransactionCycle = useCallback(
    (id: string, cycleMonth: string) => {
      const reserve = reserveHoldings.find((holding) =>
        holding.transactions.some((transaction) => transaction.id === id),
      )
      if (reserve) {
        setHoldingTransactionCycle(reserve.id, id, cycleMonth)
        return
      }
      const competence = validCycleMonth(cycleMonth, activeCycleMonth)
      setStoredFund((prev) => {
        const fund = normalizeEmergencyFund(prev)
        return {
          ...fund,
          transactions: fund.transactions.map((transaction) =>
            transaction.id === id
              ? { ...transaction, cycleMonth: competence }
              : transaction,
          ),
        }
      })
    },
    [activeCycleMonth, reserveHoldings, setHoldingTransactionCycle, setStoredFund],
  )

  const removeEmergencyFundTransaction = useCallback(
    (id: string) => {
      const reserve = reserveHoldings.find((holding) =>
        holding.transactions.some((transaction) => transaction.id === id),
      )
      if (reserve) {
        removeHoldingTransaction(reserve.id, id)
        return
      }
      setStoredFund((prev) => {
        const fund = normalizeEmergencyFund(prev)
        const transactions = fund.transactions.filter((tx) => tx.id !== id)
        return { ...fund, transactions, current: Math.max(0, ledgerBalance(transactions)) }
      })
    },
    [removeHoldingTransaction, reserveHoldings, setStoredFund],
  )

  // Classes ------------------------------------------------------------------

  const addClass = useCallback(
    (name: string, color: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return setClasses((prev) => {
        const list = Array.isArray(prev) && prev.length ? prev : DEFAULT_INVESTMENT_CLASSES
        return [...list, { id: uid(), name: trimmed, color }]
      })
    },
    [setClasses],
  )

  const renameClass = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setClasses((prev) =>
        (Array.isArray(prev) ? prev : DEFAULT_INVESTMENT_CLASSES).map((item) =>
          item.id === id ? { ...item, name: trimmed } : item,
        ),
      )
    },
    [setClasses],
  )

  const removeClass = useCallback(
    (id: string) => {
      // Reserva também usa classe real; uma classe só pode sair se nenhuma
      // posição — de qualquer finalidade — depender dela.
      if (holdings.some((holding) => holding.assetClassId === id) ||
        goals.some((goal) => goal.includes?.some((item) => item.type === 'class' && item.id === id))) return false
      return setClasses((prev) =>
        (Array.isArray(prev) ? prev : DEFAULT_INVESTMENT_CLASSES).filter((item) => item.id !== id),
      )
    },
    [goals, holdings, setClasses],
  )

  // Metas --------------------------------------------------------------------

  const addGoal = useCallback(
    (input: {
      name: string
      targetAmount: number
      targetMonth?: string
      initialAmount?: number
      kind?: GoalKind
      includes?: GoalInclusion[]
    }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return false
      const initial = Math.max(0, finiteNumber(input.initialAmount))
      return setGoals((prev) => [
        ...prev,
        normalizeGoal(
          {
            id: uid(),
            name: trimmed,
            targetAmount: Math.max(0, input.targetAmount),
            targetMonth: input.targetMonth,
            color: GOAL_PRESET_COLORS[prev.length % GOAL_PRESET_COLORS.length],
            createdAt: nowIso(),
            kind: input.kind,
            transactions:
              initial > 0
                ? [{ id: uid(), amount: initial, ...ledgerOperationDates(),
                  kind: 'opening_balance', kindSource: 'user', cycleMonth: activeCycleMonth }]
                : [],
            includes: input.includes,
          },
          prev.length,
        ),
      ])
    },
    [activeCycleMonth, setGoals],
  )

  const toggleGoalInclusion = useCallback(
    (id: string, inclusion: GoalInclusion) => {
      setGoals((prev) =>
        prev.map((goal, index) => {
          if (goal.id !== id) return goal
          const current = goal.includes ?? []
          const matches = (item: GoalInclusion) =>
            item.type === inclusion.type && (item.id ?? '') === (inclusion.id ?? '')
          const includes = current.some(matches)
            ? current.filter((item) => !matches(item))
            : [...current, inclusion]
          return normalizeGoal({ ...goal, includes }, index)
        }),
      )
    },
    [setGoals],
  )

  const updateGoal = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<FinancialGoal, 'name' | 'targetAmount' | 'targetMonth' | 'kind' | 'includes'>
      >,
    ) => {
      setGoals((prev) =>
        prev.map((goal, index) =>
          goal.id === id ? normalizeGoal({ ...goal, ...patch }, index) : goal,
        ),
      )
    },
    [setGoals],
  )

  const setGoalHoldingAllocation = useCallback(
    (goalId: string, holdingId: string, amount: number) => {
      const holding = portfolioHoldings.find((item) => item.id === holdingId)
      if (!holding) return

      setGoals((prev) => {
        const normalized = prev.map((goal, index) => normalizeGoal(goal, index))
        const claimedByOthers = normalized
          .filter((goal) => goal.id !== goalId && goal.kind === 'funding')
          .flatMap((goal) => goal.includes ?? [])
          .filter((inclusion) => inclusion.type === 'holding' && inclusion.id === holdingId)
          .reduce(
            (sum, inclusion) =>
              sum + Math.max(0, finiteNumber(inclusion.amount, holding.marketValue)),
            0,
          )
        const maximum = Math.max(0, holding.marketValue - claimedByOthers)
        const nextAmount = Math.min(Math.max(0, finiteNumber(amount)), maximum)

        return normalized.map((goal, index) => {
          if (goal.id !== goalId) return goal
          const withoutHolding = (goal.includes ?? []).filter(
            (inclusion) => inclusion.type !== 'holding' || inclusion.id !== holdingId,
          )
          return normalizeGoal(
            {
              ...goal,
              kind: 'funding',
              includes:
                nextAmount > 0
                  ? [...withoutHolding, { type: 'holding', id: holdingId, amount: nextAmount }]
                  : withoutHolding,
            },
            index,
          )
        })
      })
    },
    [portfolioHoldings, setGoals],
  )

  const removeGoal = useCallback(
    (id: string) => setGoals((prev) => prev.map((goal) =>
      goal.id === id ? { ...goal, archivedAt: nowIso() } : goal,
    )),
    [setGoals],
  )

  const restoreGoal = useCallback(
    (id: string) => setGoals((prev) => prev.map((goal) =>
      goal.id === id ? { ...goal, archivedAt: undefined } : goal,
    )),
    [setGoals],
  )

  const addGoalTransaction = useCallback(
    (goalId: string, amount: number, note?: string, cycleMonth = activeCycleMonth, occurredOn?: string) =>
      recordAssetMove('goal', goalId, amount, cycleMonth, occurredOn, note), [activeCycleMonth])
  const deleteEmptyGoal = useCallback((id: string) => deleteUnusedCatalog('goal', id), [])
  const resolveGoalKind = useCallback((goalId: string, entryId: string, kind: LedgerEntryKind) =>
    resolveLegacyLedgerKind('goal', goalId, entryId, kind), [])

  const setGoalTransactionCycle = useCallback(
    (goalId: string, transactionId: string, cycleMonth: string) => {
      const competence = validCycleMonth(cycleMonth, activeCycleMonth)
      const linked = changeLinkedMovementCycle('goal', goalId, transactionId, competence)
      if (linked !== null) return linked
      return setGoals((prev) =>
        prev.map((goal) =>
          goal.id === goalId
            ? {
                ...goal,
                transactions: goal.transactions.map((transaction) =>
                  transaction.id === transactionId
                    ? { ...transaction, cycleMonth: competence }
                    : transaction,
                ),
              }
            : goal,
        ),
      )
    },
    [activeCycleMonth, setGoals],
  )

  const removeGoalTransaction = useCallback(
    (goalId: string, transactionId: string) => {
      const linked = removeLinkedMovement('goal', goalId, transactionId)
      if (linked !== null) return linked
      return setGoals((prev) =>
        prev.map((goal) =>
          goal.id === goalId
            ? { ...goal, transactions: goal.transactions.filter((tx) => tx.id !== transactionId) }
            : goal,
        ),
      )
    },
    [setGoals],
  )

  const summary = useMemo(
    () =>
      calculateInvestmentsSummary(
        holdings,
        investmentClasses,
        reserveHoldings.length > 0 ? 0 : legacyEmergencyFund.current,
        goalsBalance,
        liabilities,
        { securedLiabilities, physicalAssets },
      ),
    [
      holdings,
      investmentClasses,
      reserveHoldings.length,
      legacyEmergencyFund,
      goalsBalance,
      liabilities,
      securedLiabilities,
      physicalAssets,
    ],
  )

  // As metas leem os saldos já consolidados — por isso vêm depois do resumo.
  const goalContext = useMemo<GoalContext>(
    () => ({
      reserveBalance: summary.reserveBalance,
      investmentsBalance: summary.allHoldings.filter((holding) => holdingPurpose(holding) === 'portfolio').reduce((sum, holding) => sum + usableHoldingValue(holding), 0),
      classBalances: summary.classes.map((item) => ({
        id: item.id,
        name: item.name,
        marketValue: item.holdings.reduce((sum, holding) => sum + usableHoldingValue(holding), 0),
      })),
      holdings: summary.allHoldings
        .filter((holding) => holdingPurpose(holding) === 'portfolio')
        .map((holding) => ({
          id: holding.id,
          name: holding.name,
          institution: holding.institution,
          marketValue: usableHoldingValue(holding),
        })),
      goalOwnBalances,
      assetsBalance: physicalAssets,
      debtBalance: liabilities,
    }),
    [
      summary.reserveBalance,
      summary.classes,
      summary.allHoldings,
      goalOwnBalances,
      physicalAssets,
      liabilities,
    ],
  )
  const goalSummaries = useMemo(() => summarizeGoals(goals, goalContext), [goals, goalContext])

  return {
    emergencyFund,
    reserveHoldings,
    portfolioHoldings,
    addEmergencyFundTransaction,
    removeEmergencyFundTransaction,
    setEmergencyFundTransactionCycle,
    setEmergencyFundTargetMonths,

    holdings,
    investmentClasses,
    summary,
    addHolding,
    updateHolding,
    removeHolding,
    restoreHolding,
    deleteEmptyHolding,
    resolveHoldingKind,
    addHoldingTransaction,
    removeHoldingTransaction,
    setHoldingTransactionCycle,
    setMarketValue,
    addClass,
    renameClass,
    removeClass,

    goals: goalSummaries,
    goalsBalance,
    addGoal,
    updateGoal,
    toggleGoalInclusion,
    setGoalHoldingAllocation,
    removeGoal,
    restoreGoal,
    deleteEmptyGoal,
    resolveGoalKind,
    addGoalTransaction,
    removeGoalTransaction,
    setGoalTransactionCycle,
  }
}
