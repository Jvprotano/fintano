import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readRepositoryDocument, useRepositoryState, type RepositoryDocument } from '../data/repository'
import { runRepositoryCommand, type CommandResult } from '../data/repositoryCommand'
import { reconcileThirdParties, thirdPartiesForEntries, withThirdParties } from '../data/cardThirdParties'
import type {
  CreditCardAccount,
  CardThirdParty,
  CreditCardEntry,
  CreditCardSettings,
} from '../types'
import {
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
  summarizeInvoiceEntries,
  withCardEntrySpendingMonth,
  type PaidInvoiceSnapshot,
} from '../lib/cardCycleAccounting'
import { addMonths, monthKey, uid } from '../lib/shared'
import { normalizeActiveCycle } from '../lib/activeCycle'
import { createAutoBackupNow } from '../lib/backup'
import { normalizeText } from '../lib/shared'

function defaultSettingsForCycle(month: string, dueDay = 5): CreditCardSettings {
  const currentDueMonth = month
  return { paymentDate: `${String(dueDay).padStart(2, '0')}/${currentDueMonth.slice(5)}`,
    currentDueMonth, personalSpendingLimit: 1500 }
}

type EntryWithSpendingMonth = CreditCardEntry & { spendingMonth?: string }

function expectedSpendingMonth(entry: CreditCardEntry, currentDueMonth: string) {
  return addMonths(entry.dueMonth ?? (entry.cycle === 'current' ? currentDueMonth : addMonths(currentDueMonth, 1)), -1)
}

function hasExpectedSpendingMonth(entry: CreditCardEntry, currentDueMonth: string) {
  return (entry as EntryWithSpendingMonth).spendingMonth === expectedSpendingMonth(entry, currentDueMonth)
}

function normalizeEntryForDueMonth(entry: CreditCardEntry, currentDueMonth: string): CreditCardEntry {
  const spendingMonth = (entry as EntryWithSpendingMonth).spendingMonth
  const normalized = normalizeCreditCardEntry(entry)
  const withStoredMonth = { ...normalized,
    dueMonth: normalized.dueMonth ?? (normalized.cycle === 'current' ? currentDueMonth : addMonths(currentDueMonth, 1)),
    ...(spendingMonth ? { spendingMonth } : {}),
  }
  return withCardEntrySpendingMonth(withStoredMonth, currentDueMonth)
}

export function migrateCardIdentityInDocument(document: RepositoryDocument): RepositoryDocument {
  const active = normalizeActiveCycle(document.collections.activeCycle as Parameters<typeof normalizeActiveCycle>[0])
  const settings = normalizeCreditCardSettings((document.collections.cardSettings as CreditCardSettings | undefined) ??
    defaultSettingsForCycle(active.month, active.cardDueHintDay))
  const dueMonth = settings.currentDueMonth ?? active.month
  const entries = Array.isArray(document.collections.cardEntries) ? document.collections.cardEntries as CreditCardEntry[] : []
  const stored = Array.isArray(document.collections.cardAccounts) ? document.collections.cardAccounts as CreditCardAccount[] : []
  const accounts: CreditCardAccount[] = stored.map((account) => ({ ...normalizeCardAccount(account),
    currentDueMonth: account.currentDueMonth ?? dueMonth }))
  const byName = new Map(accounts.map((account) => [normalizeText(account.name), account]))
  const migrated = entries.map((entry) => {
    let account = accounts.find((item) => item.id === entry.accountId)
    if (!account) account = byName.get(normalizeText(entry.cardName))
    if (!account) {
      const name = entry.cardName?.trim() || 'Cartão'
      const created = normalizeCardAccount({ id: uid(), name, closingDay: 30,
        dueDay: Number(settings.paymentDate.slice(0, 2)) || 5, limit: 0, currentDueMonth: dueMonth })
      account = created
      accounts.push(created)
      byName.set(normalizeText(name), created)
    }
    return normalizeEntryForDueMonth({ ...entry, accountId: account.id,
      dueMonth: entry.dueMonth ?? (entry.cycle === 'current' ? account.currentDueMonth ?? dueMonth : addMonths(account.currentDueMonth ?? dueMonth, 1)) }, dueMonth)
  })
  return { ...document, collections: { ...document.collections,
    cardAccounts: accounts, cardEntries: migrated } }
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

export function payInvoiceInDocument(
  document: RepositoryDocument,
  expectedDueMonth: string,
  accountId?: string,
): RepositoryDocument | null {
  const migrated = migrateCardIdentityInDocument(document)
  const accounts = migrated.collections.cardAccounts as CreditCardAccount[]
  const account = accountId ? accounts.find((item) => item.id === accountId) : accounts.length === 1 ? accounts[0] : undefined
  if (!account || account.currentDueMonth !== expectedDueMonth) return null
  const accountEntries = migrated.collections.cardEntries as CreditCardEntry[]
  const matching = accountEntries.filter((entry) => entry.accountId === account.id)
  const current = matching.filter((entry) => entry.dueMonth === expectedDueMonth)
  if (!current.length && !account.confirmedEmptyDueMonths?.includes(expectedDueMonth)) return null
  const existing = normalizePaidInvoiceSnapshots(migrated.collections.cardPaidInvoices)
  if (existing.some((item) => item.accountId === account.id && item.dueMonth === expectedDueMonth)) return null
  const totals = summarizeInvoiceEntries(current)
  const snapshot = createPaidInvoiceSnapshot({ entries: current.map((entry) => ({ ...entry, cycle: 'current' })),
    currentDueMonth: expectedDueMonth, accountId: account.id,
    total: totals.total, personalTotal: totals.personalTotal })
  const nextDueMonth = addMonths(expectedDueMonth, 1)
  const normalized = syncEntriesForDueMonth(matching.map((entry) => ({ ...entry,
    cycle: entry.dueMonth === expectedDueMonth ? 'current' : 'next' })), expectedDueMonth)
  const next = normalized.filter((entry) => entry.dueMonth === nextDueMonth).map((entry) =>
    normalizeEntryForDueMonth({ ...entry, cycle: 'current',
      autoGenerated: false, sourceEntryId: undefined }, nextDueMonth))
  const carried = carryUnappliedCredits(normalized.filter((entry) => entry.dueMonth === expectedDueMonth))
    .map((entry) => normalizeEntryForDueMonth({ ...entry, accountId: account.id, dueMonth: nextDueMonth }, nextDueMonth))
  return withThirdParties({ ...migrated, collections: { ...migrated.collections,
    cardAccounts: accounts.map((item) => item.id === account.id ? { ...item, currentDueMonth: nextDueMonth } : item),
    cardEntries: [...accountEntries.filter((entry) => entry.accountId !== account.id ||
      entry.dueMonth !== expectedDueMonth && entry.dueMonth !== nextDueMonth), ...next, ...carried],
    cardPaidInvoices: [...existing, snapshot].sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
  } }, thirdPartiesForEntries(migrated.collections.cardThirdParties as CardThirdParty[] ?? [], current))
}

export function useCreditCards(activeCycleMonth = monthKey(), cardDueHintDay = 5) {
  const [migrationError, setMigrationError] = useState('')
  const [entryError, setEntryError] = useState('')
  const [storedSettings, setSettingsRaw] = useRepositoryState<CreditCardSettings>(
    'cardSettings',
    () => defaultSettingsForCycle(activeCycleMonth, cardDueHintDay),
  )
  const settings = useMemo(() => normalizeCreditCardSettings(storedSettings), [storedSettings])
  useEffect(() => {
    if (readRepositoryDocument().collections.cardSettings === undefined) {
      setSettingsRaw(defaultSettingsForCycle(activeCycleMonth, cardDueHintDay))
    }
  }, [activeCycleMonth, cardDueHintDay, setSettingsRaw])
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

  /* eslint-disable react-hooks/set-state-in-effect -- Esta sincronização migra o armazenamento externo e relata falhas de backup/gravação; não deriva valores financeiros do estado. */
  useEffect(() => {
    const document = readRepositoryDocument()
    const rawAccounts = Array.isArray(document.collections.cardAccounts) ? document.collections.cardAccounts as CreditCardAccount[] : []
    const rawEntries = Array.isArray(document.collections.cardEntries) ? document.collections.cardEntries as CreditCardEntry[] : []
    if (!rawAccounts.some((account) => !account.currentDueMonth) &&
      !rawEntries.some((entry) => !entry.accountId || !entry.dueMonth)) {
      setMigrationError('')
      return
    }
    if (!createAutoBackupNow(window.localStorage)) {
      setMigrationError('Não foi possível guardar a cópia anterior dos cartões. Nenhuma migração foi aplicada; exporte um backup antes de continuar.')
      return
    }
    const result = runRepositoryCommand({ id: 'card-identity-v2', apply: migrateCardIdentityInDocument })
    if (!result.ok) setMigrationError(result.message)
  }, [storedAccounts, storedEntries])

  /* eslint-enable react-hooks/set-state-in-effect */

  const [storedPaidInvoices] = useRepositoryState<PaidInvoiceSnapshot[]>(
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
    if (!Array.isArray(storedEntries) || storedEntries.some((entry) => !entry.accountId || !entry.dueMonth) ||
      storedEntries.every((entry) => hasExpectedSpendingMonth(entry, currentDueMonth))) {
      return
    }
    setEntries((prev) => normalizeEntriesForDueMonth(prev, currentDueMonth))
  }, [currentDueMonth, setEntries, storedEntries])

  // A geração da próxima fatura roda a cada mutação, mas dados que chegam
  // prontos (backup importado, outro dispositivo) nunca passaram por uma.
  const syncedOnMount = useRef(false)
  useEffect(() => {
    if (syncedOnMount.current || entries.length === 0 || entries.some((entry) => !entry.accountId)) return
    syncedOnMount.current = true
    setEntries((prev) => syncEntriesForDueMonth(prev, currentDueMonth))
  }, [currentDueMonth, entries, setEntries])

  const addEntry = useCallback((entry: Omit<CreditCardEntry, 'id'>) => {
    const result = runRepositoryCommand({ id: uid(), apply: (source) => {
      const document = migrateCardIdentityInDocument(source)
      const rawAccounts = document.collections.cardAccounts as CreditCardAccount[]
      const account = rawAccounts.find((item) => item.id === entry.accountId) ??
        rawAccounts.find((item) => normalizeText(item.name) === normalizeText(entry.cardName))
      if (!account) return null
      const dueMonth = entry.dueMonth ?? (entry.cycle === 'current' ?
        account.currentDueMonth ?? currentDueMonth : addMonths(account.currentDueMonth ?? currentDueMonth, 1))
      if (normalizePaidInvoiceSnapshots(document.collections.cardPaidInvoices)
        .some((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)) {
        throw new Error('Esta fatura já foi paga. Registre a compra no próximo ciclo.')
      }
      const cycle = dueMonth === account.currentDueMonth ? 'current' : 'next'
      const next = [...normalizeEntriesForDueMonth(document.collections.cardEntries as CreditCardEntry[], currentDueMonth),
        normalizeEntryForDueMonth({ ...entry, cycle, id: uid(), accountId: account.id, cardName: account.name, dueMonth }, currentDueMonth)]
      return { ...document, collections: { ...document.collections,
        cardEntries: cycle === 'current' ? syncEntriesForDueMonth(next, currentDueMonth) : next,
      } }
    } })
    setEntryError(result.ok ? '' : result.message)
    return result.ok
  }, [currentDueMonth])

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<CreditCardEntry, 'id'>>) => {
      const result = runRepositoryCommand({ id: uid(), apply: (document) => {
        const prev = document.collections.cardEntries as CreditCardEntry[] ?? []
        const normalizedPrev = normalizeEntriesForDueMonth(prev, currentDueMonth)
        const target = normalizedPrev.find((entry) => entry.id === id)
        if (!target) return null

        // Editar um lançamento gerado automaticamente o torna manual,
        // para a edição não ser descartada na próxima sincronização.
        const effectivePatch =
          target.cycle === 'next' && target.autoGenerated
            ? { ...patch, autoGenerated: false }
            : patch
        const nextEntries = normalizedPrev.map((entry) => {
          if (entry.id !== id) return entry
          const chosen = effectivePatch.accountId
            ? accounts.find((item) => item.id === effectivePatch.accountId)
            : effectivePatch.cardName && effectivePatch.cardName !== entry.cardName
              ? accounts.find((item) => normalizeText(item.name) === normalizeText(effectivePatch.cardName ?? ''))
              : accounts.find((item) => item.id === entry.accountId)
          if (chosen?.id !== entry.accountId && normalizePaidInvoiceSnapshots(document.collections.cardPaidInvoices)
            .some((invoice) => invoice.accountId === chosen?.id && invoice.dueMonth === entry.dueMonth)) {
            throw new Error('A fatura de destino já foi paga. Escolha outro cartão ou o próximo ciclo.')
          }
          return normalizeEntryForDueMonth({ ...entry, ...effectivePatch,
            accountId: chosen?.id ?? entry.accountId,
            cardName: chosen?.name ?? entry.cardName,
            cycle: entry.dueMonth === chosen?.currentDueMonth ? 'current' : 'next',
            dueMonth: entry.dueMonth }, currentDueMonth)
        })

        const synced = target.cycle === 'current' ? syncEntriesForDueMonth(nextEntries, currentDueMonth) : nextEntries
        return withThirdParties({ ...document, collections: { ...document.collections, cardEntries: synced } },
          reconcileThirdParties(document.collections.cardThirdParties as CardThirdParty[] ?? [], synced))
      } })
      setEntryError(result.ok ? '' : result.message)
      return result.ok
    },
    [accounts, currentDueMonth],
  )

  const removeEntry = useCallback(
    (id: string) => {
      return setEntries((prev) => {
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

  const restoreEntry = useCallback((entry: CreditCardEntry) => runRepositoryCommand({ id: uid(), apply: (document) => {
    const entries = document.collections.cardEntries as CreditCardEntry[] ?? []
    if (entries.some((row) => row.id === entry.id)) return null
    const account = (document.collections.cardAccounts as CreditCardAccount[] ?? []).find((row) => row.id === entry.accountId)
    if (!account || entry.dueMonth !== account.currentDueMonth && entry.dueMonth !== addMonths(account.currentDueMonth!, 1)) return null
    const next = [...entries, entry]
    return { ...document, collections: { ...document.collections, cardEntries: entry.cycle === 'current'
      ? syncEntriesForDueMonth(next, currentDueMonth) : next } }
  } }).ok, [currentDueMonth])

  const anticipateInstallments = useCallback(
    (id: string, count: number) => {
      return setEntries((prev) => {
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

  const payInvoice = useCallback((accountId?: string, expectedRevision?: string | null): CommandResult => {
    const account = accountId ? accounts.find((item) => item.id === accountId) : accounts.length === 1 ? accounts[0] : undefined
    if (!account) return { ok: false, reason: 'rejected', message: 'Escolha um cartão para pagar.' }
    const dueMonth = account.currentDueMonth ?? currentDueMonth
    return runRepositoryCommand({
      id: `pay-invoice:${account.id}:${dueMonth}`,
      expectedRevision,
      apply: (document) => payInvoiceInDocument(document, dueMonth, account.id),
    })
  }, [
    accounts, currentDueMonth,
  ])

  const confirmEmptyInvoice = useCallback((accountId: string, dueMonth: string): CommandResult =>
    runRepositoryCommand({ id: `confirm-empty-invoice:${accountId}:${dueMonth}`, apply: (document) => {
      const migrated = migrateCardIdentityInDocument(document)
      const rawAccounts = migrated.collections.cardAccounts as CreditCardAccount[]
      const account = rawAccounts.find((item) => item.id === accountId)
      if (!account || (dueMonth !== account.currentDueMonth && dueMonth !== addMonths(account.currentDueMonth!, 1))) return null
      const rawEntries = migrated.collections.cardEntries as CreditCardEntry[]
      if (rawEntries.some((entry) => entry.accountId === accountId && entry.dueMonth === dueMonth)) return null
      return { ...migrated, collections: { ...migrated.collections,
        cardAccounts: rawAccounts.map((item) => item.id === accountId
          ? { ...item, confirmedEmptyDueMonths: [...new Set([...(item.confirmedEmptyDueMonths ?? []), dueMonth])] }
          : item),
      } }
    } }), [])

  const setSettings = useCallback(
    (next: CreditCardSettings) => {
      return setSettingsRaw(normalizeCreditCardSettings(next))
    },
    [setSettingsRaw],
  )

  const setDueMonth = useCallback((month: string, accountId: string, expectedRevision?: string | null) =>
    runRepositoryCommand({ id: uid(), expectedRevision, apply: (document) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
      const migrated = migrateCardIdentityInDocument(document)
      const rawAccounts = migrated.collections.cardAccounts as CreditCardAccount[]
      const account = rawAccounts.find((item) => item.id === accountId)
      if (!account) return null
      if (normalizePaidInvoiceSnapshots(migrated.collections.cardPaidInvoices)
        .some((invoice) => invoice.accountId === accountId && invoice.dueMonth === month)) return null
      const entries = migrated.collections.cardEntries as CreditCardEntry[]
      return { ...migrated, collections: { ...migrated.collections,
        cardEntries: entries.map((entry) => entry.accountId === accountId
          ? normalizeEntryForDueMonth({ ...entry,
              dueMonth: entry.cycle === 'current' ? month : addMonths(month, 1) }, month)
          : entry),
        cardAccounts: rawAccounts.map((item) => item.id === accountId
          ? { ...item, currentDueMonth: month } : item),
      } }
    } }).ok,
  [])

  const addAccount = useCallback(
    (input: { name: string; closingDay: number; dueDay: number; limit?: number }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return false
      return setStoredAccounts((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        normalizeCardAccount({ ...input, name: trimmed, id: uid(), currentDueMonth: addMonths(activeCycleMonth, 1),
          confirmedEmptyDueMonths: [activeCycleMonth] }),
      ])
    },
    [activeCycleMonth, setStoredAccounts],
  )

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<CreditCardAccount, 'id'>>) => {
      runRepositoryCommand({ id: uid(), apply: (document) => {
        const rawAccounts = Array.isArray(document.collections.cardAccounts) ? document.collections.cardAccounts as CreditCardAccount[] : []
        const account = rawAccounts.find((item) => item.id === id)
        if (!account) return null
        const updated = normalizeCardAccount({ ...account, ...patch })
        const rawEntries = Array.isArray(document.collections.cardEntries) ? document.collections.cardEntries as CreditCardEntry[] : []
        return { ...document, collections: { ...document.collections,
          cardAccounts: rawAccounts.map((item) => item.id === id ? updated : item),
          cardEntries: rawEntries.map((entry) => entry.accountId === id ? { ...entry, cardName: updated.name } : entry),
        } }
      } })
    },
    [],
  )

  const removeAccount = useCallback(
    (id: string) => {
      const thirds = readRepositoryDocument().collections.cardThirdParties as CardThirdParty[] ?? []
      if (entries.some((entry) => entry.accountId === id) || paidInvoices.some((invoice) => invoice.accountId === id) || thirds.some((row) => row.accountId === id)) return false
      return setStoredAccounts((prev) => prev.filter((account) => account.id !== id))
    },
    [entries, paidInvoices, setStoredAccounts],
  )

  const summary = useMemo(() => calculateCreditCardSummary(entries, settings), [entries, settings])
  const cycles = useMemo(() => describeCardCycles(accounts, summary), [accounts, summary])
  const unregistered = useMemo(() => unregisteredCardNames(entries, accounts), [entries, accounts])

  return {
    entries,
    migrationError,
    entryError,
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
    restoreEntry,
    anticipateInstallments,
    payInvoice,
    confirmEmptyInvoice,
    setSettings,
    setDueMonth,
  }
}
