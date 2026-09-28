import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRepositoryState } from '../data/repository'
import type {
  CreditCardAccount,
  CreditCardCycle,
  CreditCardEntry,
  CreditCardSettings,
} from '../types'
import {
  advanceCreditCardSettingsCycle,
  buildRemainingInstallmentsAmount,
  calculateCreditCardSummary,
  carryUnappliedCredits,
  describeCardCycles,
  inferDueMonthFromPaymentDate,
  normalizeCreditCardSettings,
  normalizeCardAccount,
  normalizeCreditCardEntry,
  syncGeneratedNextEntries,
  unregisteredCardNames,
} from '../lib/creditCards'
import {
  createPaidInvoiceSnapshot,
  normalizePaidInvoiceSnapshots,
  withCardEntrySpendingMonth,
  type PaidInvoiceSnapshot,
} from '../lib/cardCycleAccounting'
import { addMonths, uid } from '../lib/shared'
const DEFAULT_SETTINGS: CreditCardSettings = { paymentDate: '05/07', personalSpendingLimit: 1500 }

type EntryWithSpendingMonth = CreditCardEntry & { spendingMonth?: string }

function expectedSpendingMonth(entry: CreditCardEntry, currentDueMonth: string) {
  return entry.cycle === 'current' ? addMonths(currentDueMonth, -1) : currentDueMonth
}

function hasExpectedSpendingMonth(entry: CreditCardEntry, currentDueMonth: string) {
  return (entry as EntryWithSpendingMonth).spendingMonth === expectedSpendingMonth(entry, currentDueMonth)
}

function normalizeEntryForDueMonth(entry: CreditCardEntry, currentDueMonth: string): CreditCardEntry {
  const spendingMonth = (entry as EntryWithSpendingMonth).spendingMonth
  const normalized = normalizeCreditCardEntry(entry)
  const withStoredMonth = spendingMonth
    ? ({ ...normalized, spendingMonth } as CreditCardEntry)
    : normalized
  return withCardEntrySpendingMonth(withStoredMonth, currentDueMonth)
}

function normalizeEntriesForDueMonth(entries: CreditCardEntry[], currentDueMonth: string) {
  return entries.map((entry) => normalizeEntryForDueMonth(entry, currentDueMonth))
}

function syncEntriesForDueMonth(entries: CreditCardEntry[], currentDueMonth: string) {
  const normalized = normalizeEntriesForDueMonth(entries, currentDueMonth)
  // A próxima fatura é formada no mês em que a fatura atual vence.
  return normalizeEntriesForDueMonth(
    syncGeneratedNextEntries(normalized, currentDueMonth),
    currentDueMonth,
  )
}

/**
 * Cada cartão passou a ter fechamento e vencimento próprios. Na primeira carga,
 * os cartões que já apareciam nos lançamentos são cadastrados herdando o
 * vencimento global antigo — nada se perde e nada precisa ser redigitado.
 */
export function useCreditCards() {
  const [storedSettings, setSettingsRaw] = useRepositoryState<CreditCardSettings>(
    'cardSettings',
    DEFAULT_SETTINGS,
  )
  const settings = useMemo(() => normalizeCreditCardSettings(storedSettings), [storedSettings])
  const currentDueMonth =
    settings.currentDueMonth ?? inferDueMonthFromPaymentDate(settings.paymentDate)

  const [storedEntries, setEntries] = useRepositoryState<CreditCardEntry[]>('cardEntries', [])
  const entries = useMemo(
    () =>
      Array.isArray(storedEntries)
        ? normalizeEntriesForDueMonth(storedEntries, currentDueMonth)
        : [],
    [currentDueMonth, storedEntries],
  )

  const [storedAccounts, setStoredAccounts] = useRepositoryState<CreditCardAccount[]>(
    'cardAccounts',
    [],
  )
  const accounts = useMemo(
    () => (Array.isArray(storedAccounts) ? storedAccounts.map(normalizeCardAccount) : []),
    [storedAccounts],
  )

  const [storedPaidInvoices, setStoredPaidInvoices] = useRepositoryState<PaidInvoiceSnapshot[]>(
    'cardPaidInvoices',
    [],
  )
  const paidInvoices = useMemo(
    () => normalizePaidInvoiceSnapshots(storedPaidInvoices),
    [storedPaidInvoices],
  )
  const lastPaidInvoice = paidInvoices.length ? paidInvoices[paidInvoices.length - 1] : null

  // Repara backups antigos e também a migração anterior que tentou inferir o mês
  // pela data da compra. A fronteira correta é o bucket da fatura: current = ciclo
  // anterior ao vencimento; next = ciclo do vencimento atual.
  useEffect(() => {
    if (
      !Array.isArray(storedEntries) ||
      storedEntries.every((entry) => hasExpectedSpendingMonth(entry, currentDueMonth))
    ) {
      return
    }
    setEntries((prev) => normalizeEntriesForDueMonth(prev, currentDueMonth))
  }, [currentDueMonth, setEntries, storedEntries])

  // A geração da próxima fatura roda a cada mutação, mas dados que chegam
  // prontos (backup importado, outro dispositivo) nunca passaram por uma.
  const syncedOnMount = useRef(false)
  useEffect(() => {
    if (syncedOnMount.current || entries.length === 0) return
    syncedOnMount.current = true
    setEntries((prev) => syncEntriesForDueMonth(prev, currentDueMonth))
  }, [currentDueMonth, entries.length, setEntries])

  const addEntry = useCallback(
    (entry: Omit<CreditCardEntry, 'id'>) => {
      setEntries((prev) => {
        const nextEntries = [
          ...normalizeEntriesForDueMonth(prev, currentDueMonth),
          normalizeEntryForDueMonth({ ...entry, id: uid() }, currentDueMonth),
        ]
        return entry.cycle === 'current'
          ? syncEntriesForDueMonth(nextEntries, currentDueMonth)
          : nextEntries
      })
    },
    [currentDueMonth, setEntries],
  )

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<CreditCardEntry, 'id'>>) => {
      setEntries((prev) => {
        const normalizedPrev = normalizeEntriesForDueMonth(prev, currentDueMonth)
        const target = normalizedPrev.find((entry) => entry.id === id)
        if (!target) return prev

        // Editar um lançamento gerado automaticamente o torna manual,
        // para a edição não ser descartada na próxima sincronização.
        const effectivePatch =
          target.cycle === 'next' && target.autoGenerated
            ? { ...patch, autoGenerated: false }
            : patch
        const nextEntries = normalizedPrev.map((entry) =>
          entry.id === id
            ? normalizeEntryForDueMonth({ ...entry, ...effectivePatch }, currentDueMonth)
            : entry,
        )

        return target.cycle === 'current'
          ? syncEntriesForDueMonth(nextEntries, currentDueMonth)
          : nextEntries
      })
    },
    [currentDueMonth, setEntries],
  )

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const normalizedPrev = normalizeEntriesForDueMonth(prev, currentDueMonth)
        const target = normalizedPrev.find((entry) => entry.id === id)
        const nextEntries = normalizedPrev.filter((entry) => entry.id !== id)
        return target?.cycle === 'current'
          ? syncEntriesForDueMonth(nextEntries, currentDueMonth)
          : nextEntries
      })
    },
    [currentDueMonth, setEntries],
  )

  const replaceEntries = useCallback(
    (cycle: CreditCardCycle, incoming: Omit<CreditCardEntry, 'id' | 'cycle'>[]) => {
      setEntries((prev) => {
        const nextEntries = [
          ...normalizeEntriesForDueMonth(prev, currentDueMonth).filter(
            (entry) => entry.cycle !== cycle,
          ),
          ...incoming.map((entry) =>
            normalizeEntryForDueMonth({ ...entry, cycle, id: uid() }, currentDueMonth),
          ),
        ]
        return cycle === 'current'
          ? syncEntriesForDueMonth(nextEntries, currentDueMonth)
          : nextEntries
      })
    },
    [currentDueMonth, setEntries],
  )

  const appendEntries = useCallback(
    (cycle: CreditCardCycle, incoming: Omit<CreditCardEntry, 'id' | 'cycle'>[]) => {
      setEntries((prev) => {
        const nextEntries = [
          ...normalizeEntriesForDueMonth(prev, currentDueMonth),
          ...incoming.map((entry) =>
            normalizeEntryForDueMonth({ ...entry, cycle, id: uid() }, currentDueMonth),
          ),
        ]
        return cycle === 'current'
          ? syncEntriesForDueMonth(nextEntries, currentDueMonth)
          : nextEntries
      })
    },
    [currentDueMonth, setEntries],
  )

  const anticipateInstallments = useCallback(
    (id: string, count: number) => {
      setEntries((prev) => {
        const normalizedPrev = normalizeEntriesForDueMonth(prev, currentDueMonth)
        const entry = normalizedPrev.find((item) => item.id === id)
        if (
          !entry ||
          entry.cycle !== 'current' ||
          !entry.installmentCurrent ||
          !entry.installmentTotal
        ) {
          return prev
        }

        const current = entry.installmentCurrent
        const total = entry.installmentTotal
        const quantity = Math.min(Math.max(1, Math.floor(count)), total - current)
        if (quantity < 1) return prev

        // Cada parcela antecipada vira um lançamento próprio na mesma competência.
        const anticipated = Array.from({ length: quantity }, (_, index) => {
          const installment = current + index + 1
          return normalizeEntryForDueMonth(
            {
              ...entry,
              id: uid(),
              installmentCurrent: installment,
              remainingAmount:
                installment === current + quantity
                  ? buildRemainingInstallmentsAmount(entry.amount, installment, total)
                  : 0,
            },
            currentDueMonth,
          )
        })

        return syncEntriesForDueMonth(
          [
            ...normalizedPrev.map((item) =>
              item.id === id ? { ...item, remainingAmount: 0 } : item,
            ),
            ...anticipated,
          ],
          currentDueMonth,
        )
      })
    },
    [currentDueMonth, setEntries],
  )

  const payInvoice = useCallback(() => {
    const paidSummary = calculateCreditCardSummary(entries, settings)
    const snapshot = createPaidInvoiceSnapshot({
      entries,
      currentDueMonth,
      total: paidSummary.currentTotal,
      personalTotal: paidSummary.currentPersonalTotal,
    })
    setStoredPaidInvoices((prev) => {
      const existing = normalizePaidInvoiceSnapshots(prev)
      return [...existing.filter((item) => item.dueMonth !== snapshot.dueMonth), snapshot]
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
        .slice(-24)
    })

    const nextSettings = advanceCreditCardSettingsCycle(settings)
    const nextDueMonth =
      nextSettings.currentDueMonth ?? inferDueMonthFromPaymentDate(nextSettings.paymentDate)

    setEntries((prev) => {
      // Sincroniza antes de virar: assinaturas/parcelas precisam existir na próxima fatura.
      const syncedEntries = syncEntriesForDueMonth(prev, currentDueMonth)
      const carriedCredits = carryUnappliedCredits(syncedEntries).map((credit) =>
        normalizeEntryForDueMonth(credit, nextDueMonth),
      )
      const newCurrentEntries = syncedEntries
        .filter((entry) => entry.cycle === 'next')
        .map((entry) =>
          normalizeEntryForDueMonth(
            {
              ...entry,
              id: uid(),
              cycle: 'current',
              autoGenerated: false,
              sourceEntryId: undefined,
            },
            nextDueMonth,
          ),
        )

      return syncEntriesForDueMonth([...newCurrentEntries, ...carriedCredits], nextDueMonth)
    })
    setSettingsRaw(nextSettings)
  }, [
    currentDueMonth,
    entries,
    setEntries,
    setSettingsRaw,
    setStoredPaidInvoices,
    settings,
  ])

  const setSettings = useCallback(
    (next: CreditCardSettings) => {
      setSettingsRaw(normalizeCreditCardSettings(next))
    },
    [setSettingsRaw],
  )

  const addAccount = useCallback(
    (input: { name: string; closingDay: number; dueDay: number; limit?: number }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return
      setStoredAccounts((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeCardAccount({ ...input, name: trimmed, id: uid() }),
      ])
    },
    [setStoredAccounts],
  )

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<CreditCardAccount, 'id'>>) => {
      setStoredAccounts((prev) =>
        prev.map((account) =>
          account.id === id ? normalizeCardAccount({ ...account, ...patch }) : account,
        ),
      )
    },
    [setStoredAccounts],
  )

  const removeAccount = useCallback(
    (id: string) => setStoredAccounts((prev) => prev.filter((account) => account.id !== id)),
    [setStoredAccounts],
  )

  const summary = useMemo(() => calculateCreditCardSummary(entries, settings), [entries, settings])
  const cycles = useMemo(() => describeCardCycles(accounts, summary), [accounts, summary])
  const unregistered = useMemo(() => unregisteredCardNames(entries, accounts), [entries, accounts])

  return {
    entries,
    settings,
    accounts,
    cycles,
    unregistered,
    summary,
    paidInvoices,
    lastPaidInvoice,
    addAccount,
    updateAccount,
    removeAccount,
    addEntry,
    updateEntry,
    removeEntry,
    replaceEntries,
    appendEntries,
    anticipateInstallments,
    payInvoice,
    setSettings,
  }
}
