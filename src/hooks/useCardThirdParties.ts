import { useMemo } from 'react'
import { useRepositoryState } from '../data/repository'
import type { CardThirdParty, CreditCardEntry } from '../types'
import type { PaidInvoiceSnapshot } from '../lib/cardCycleAccounting'

export function useCardThirdParties(month: string, entries: CreditCardEntry[], invoices: PaidInvoiceSnapshot[]) {
  const [stored] = useRepositoryState<CardThirdParty[]>('cardThirdParties', [])
  return useMemo(() => {
    const records = Array.isArray(stored) ? stored : []
    const advanced = records.filter((row) => row.fundedBy === 'user' && row.cashMonth === month).reduce((sum, row) => sum + row.amount, 0)
    const received = records.flatMap((row) => row.payments).filter((payment) => payment.cycleMonth === month).reduce((sum, payment) => sum + payment.amount, 0)
    const outstanding = records.filter((row) => row.fundedBy === 'user').reduce((sum, row) => sum + Math.max(0, row.amount - row.payments.reduce((total, payment) => total + payment.amount, 0)), 0)
    const unclassified = [...entries, ...invoices.flatMap((invoice) => (invoice.entries ?? []).map((entry) => ({ ...entry, dueMonth: entry.dueMonth ?? invoice.dueMonth })))].filter((entry) =>
      !entry.entryType && entry.amount > entry.personalAmount && !records.some((row) => row.entryId === entry.id))
    const pendingInMonth = unclassified.filter((entry) => (entry.isPrepaid ? entry.cashCycleMonth ?? entry.dueMonth : entry.dueMonth) === month)
    return { records, advanced, received, outstanding, unclassified, pendingInMonth }
  }, [stored, month, entries, invoices])
}
