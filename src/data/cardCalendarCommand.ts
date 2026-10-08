import type { CreditCardAccount, CreditCardEntry, MonthlySnapshot, HistoryCorrection } from '../types'
import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'
import { addMonths, nowIso, uid } from '../lib/shared'
import { cardCycleForDueMonth, cardDueMonthOffset, cardDueMonthForCycle } from '../lib/cardCalendar'
import { legacyInvoiceCash, normalizePaidInvoiceSnapshots, summarizeInvoiceEntries, type PaidInvoiceSnapshot } from '../lib/cardCycleAccounting'
import { formatCurrency, formatMonthLong } from '../lib/format'
import { BUDGET_AREAS } from '../types/constants'

export interface CardCalendarDraft {
  accountId: string
  openDueMonth: string
  dueMonthOffset: 0 | 1
  includePaidInvoices: boolean
  reason: string
}

const monthValid = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
const monthNumber = (month: string) => { const [year, value] = month.split('-').map(Number); return year * 12 + value }
const money = (value: number) => Math.round(value * 100) / 100

/** Uma revisão move o calendário inteiro do cartão; nunca renumera parcelas ou refaz pagamentos. */
export function reviewCardCalendar(document: RepositoryDocument, draft: CardCalendarDraft) {
  const accounts = document.collections.cardAccounts as CreditCardAccount[] ?? []
  const account = accounts.find((row) => row.id === draft.accountId)
  if (!account?.currentDueMonth || !monthValid(draft.openDueMonth) || ![0, 1].includes(draft.dueMonthOffset)) throw new Error('Informe o mês da fatura aberta e seu calendário.')
  if (!draft.reason.trim()) throw new Error('Informe o motivo da correção.')
  const delta = monthNumber(draft.openDueMonth) - monthNumber(account.currentDueMonth)
  const oldOffset = cardDueMonthOffset(account)
  if (!delta && oldOffset === draft.dueMonthOffset) throw new Error('Nenhuma alteração de calendário para salvar.')
  const entries = document.collections.cardEntries as CreditCardEntry[] ?? []
  const paid = normalizePaidInvoiceSnapshots(document.collections.cardPaidInvoices)
  const revisedAccount: CreditCardAccount = { ...account, currentDueMonth: draft.openDueMonth, dueMonthOffset: draft.dueMonthOffset,
    confirmedEmptyDueMonths: account.confirmedEmptyDueMonths?.map((month) => addMonths(month, delta)) }
  const moveEntry = (entry: CreditCardEntry): CreditCardEntry => {
    if (!entry.dueMonth) throw new Error('Há um lançamento sem mês de vencimento. Confira o cadastro antes de corrigir.')
    const dueMonth = addMonths(entry.dueMonth, delta)
    return { ...entry, dueMonth, spendingMonth: cardCycleForDueMonth(revisedAccount, dueMonth) }
  }
  const revisedEntries = entries.map((entry) => entry.accountId === account.id ? moveEntry(entry) : entry)
  const revisedPaid = paid.map((invoice) => invoice.accountId !== account.id || !draft.includePaidInvoices ? invoice : {
    ...invoice, dueMonth: addMonths(invoice.dueMonth, delta), entries: invoice.entries?.map(moveEntry),
    spending: invoice.spending.map((row) => ({ ...row, spendingMonth: addMonths(row.spendingMonth, delta + oldOffset - draft.dueMonthOffset) })),
  })
  const ownPaid = revisedPaid.filter((invoice) => invoice.accountId === account.id)
  if (new Set(ownPaid.map((invoice) => invoice.dueMonth)).size !== ownPaid.length || ownPaid.some((invoice) => invoice.dueMonth === draft.openDueMonth ||
    revisedEntries.some((entry) => entry.accountId === account.id && entry.dueMonth === invoice.dueMonth))) {
    throw new Error('O calendário colide com uma fatura paga. Inclua as faturas pagas nesta correção para mover a sequência inteira.')
  }
  const changes: HistoryCorrection['changes'] = []
  for (const dueMonth of [...new Set(entries.filter((entry) => entry.accountId === account.id).map((entry) => entry.dueMonth!))].sort()) {
    changes.push({ label: 'Fatura aberta · ' + account.name, before: formatMonthLong(dueMonth), after: formatMonthLong(addMonths(dueMonth, delta)), source: 'Compras, parcelas e abatimentos preservados' })
  }
  if (draft.includePaidInvoices) for (const invoice of paid.filter((invoice) => invoice.accountId === account.id)) {
    changes.push({ label: 'Fatura paga · ' + account.name, before: formatMonthLong(invoice.dueMonth), after: formatMonthLong(addMonths(invoice.dueMonth, delta)), source: 'Valor e data do pagamento preservados' })
  }
  changes.push({ label: 'Fatura aberta', before: formatMonthLong(account.currentDueMonth), after: formatMonthLong(draft.openDueMonth), source: account.name })
  changes.push({ label: 'Vencimento em relação ao ciclo', before: oldOffset === 0 ? 'No mesmo mês' : 'No mês seguinte', after: draft.dueMonthOffset === 0 ? 'No mesmo mês' : 'No mês seguinte', source: account.name })
  const invoicePersonal = (rows: CreditCardEntry[], snapshots: PaidInvoiceSnapshot[], dueMonth: string) => {
    const snapshot = snapshots.find((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)
    return snapshot?.personalTotal ?? summarizeInvoiceEntries(rows.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)).personalTotal
  }
  const invoiceArea = (rows: CreditCardEntry[], snapshots: PaidInvoiceSnapshot[], dueMonth: string, area: typeof BUDGET_AREAS[number]) => {
    const snapshot = snapshots.find((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)
    return snapshot ? snapshot.spending.reduce((total, row) => total + row.personalByArea[area], 0)
      : rows.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth && entry.budgetArea === area && !entry.entryType && !entry.isPrepaid).reduce((total, entry) => total + entry.personalAmount, 0)
  }
  const correctionId = uid(), correctedAt = nowIso()
  const invoiceTotal = (rows: CreditCardEntry[], snapshots: PaidInvoiceSnapshot[], dueMonth: string) => {
    const snapshot = snapshots.find((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)
    if (snapshot?.total === null) throw new Error('Há uma fatura paga com total desconhecido. Confira sua composição antes de deslocar o calendário.')
    return snapshot?.total ?? summarizeInvoiceEntries(rows.filter((entry) => entry.accountId === account.id && entry.dueMonth === dueMonth)).total
  }
  const paidWithCashAdjustments = revisedPaid.map((invoice) => {
    if (invoice.accountId) return invoice
    const referencePersonalTotal = invoicePersonal(revisedEntries, revisedPaid, invoice.dueMonth)
    const referenceTotal = invoiceTotal(revisedEntries, revisedPaid, invoice.dueMonth)
    const oldPersonal = invoicePersonal(entries, paid, invoice.dueMonth), oldTotal = invoiceTotal(entries, paid, invoice.dueMonth)
    if (!money(referencePersonalTotal - oldPersonal) && !money(referenceTotal - oldTotal)) return invoice
    const prior = [...invoice.calendarAdjustments ?? []].reverse().find((row) => row.accountId === account.id)
    const personalDelta = money(referencePersonalTotal - (prior?.referencePersonalTotal ?? oldPersonal))
    const totalDelta = money(referenceTotal - (prior?.referenceTotal ?? oldTotal))
    const candidate = { ...invoice, calendarAdjustments: [...invoice.calendarAdjustments ?? [], { id: correctionId, accountId: account.id, correctedAt, reason: draft.reason.trim(), personalDelta, totalDelta, referenceTotal, referencePersonalTotal }] }
    const beforeCash = legacyInvoiceCash(invoice, entries, paid), afterCash = legacyInvoiceCash(candidate, revisedEntries, revisedPaid)
    if (afterCash.personalTotal < 0 || afterCash.total !== null && afterCash.total < 0) throw new Error('A diferença de calendário conflita com o agregado antigo. Confira as faturas antes de salvar.')
    changes.push({ label: 'Caixa · fatura antiga de ' + formatMonthLong(invoice.dueMonth), before: formatCurrency(beforeCash.personalTotal), after: formatCurrency(afterCash.personalTotal), source: 'Diferença explícita; pagamento agregado original preservado' })
    return candidate
  })
  const revisedMonths = new Set<string>()
  const history = (document.collections.history as MonthlySnapshot[] ?? []).map((snapshot) => {
    const cardDelta = money(invoicePersonal(revisedEntries, revisedPaid, cardDueMonthForCycle(revisedAccount, snapshot.month)) - invoicePersonal(entries, paid, cardDueMonthForCycle(account, snapshot.month)))
    const cashDelta = money(invoicePersonal(revisedEntries, revisedPaid, snapshot.month) - invoicePersonal(entries, paid, snapshot.month))
    if (!cardDelta && !cashDelta) return snapshot
    const cardPersonalTotal = money(snapshot.cardPersonalTotal + cardDelta)
    if (cardPersonalTotal < 0) throw new Error('A correção conflita com o total preservado de um fechamento. Confira os registros desse ciclo.')
    revisedMonths.add(snapshot.month)
    changes.push({ label: 'Cartão pessoal · ' + formatMonthLong(snapshot.month), before: formatCurrency(snapshot.cardPersonalTotal), after: formatCurrency(cardPersonalTotal), source: 'Correção explícita do calendário de ' + account.name })
    if (cashDelta) changes.push({ label: 'Caixa restante · ' + formatMonthLong(snapshot.month), before: formatCurrency(snapshot.cashLeftover), after: formatCurrency(money(snapshot.cashLeftover - cashDelta)), source: 'Diferença das faturas com vencimento neste mês' })
    const cardByArea = { ...snapshot.cardByArea }
    for (const area of BUDGET_AREAS) {
      const areaDelta = money(invoiceArea(revisedEntries, revisedPaid, cardDueMonthForCycle(revisedAccount, snapshot.month), area) - invoiceArea(entries, paid, cardDueMonthForCycle(account, snapshot.month), area))
      if (areaDelta) cardByArea[area] = Math.max(0, money((cardByArea[area] ?? 0) + areaDelta))
    }
    return { ...snapshot, cardPersonalTotal, cardByArea, cashLeftover: money(snapshot.cashLeftover - cashDelta) }
  })
  const correction: HistoryCorrection = { id: correctionId, correctedAt, reason: draft.reason.trim(), revisedMonths: [...revisedMonths].sort(), changes }
  revisedAccount.calendarCorrections = [...account.calendarCorrections ?? [], {
    id: correctionId, correctedAt, reason: draft.reason.trim(), beforeDueMonth: account.currentDueMonth,
    afterDueMonth: draft.openDueMonth, beforeOffset: oldOffset, afterOffset: draft.dueMonthOffset, includedPaidInvoices: draft.includePaidInvoices,
  }]
  // As chaves de repetição acompanham o mês corrigido: a antiga paga de novembro
  // não pode fazer o novo pagamento de novembro parecer já executado.
  const appliedOperations = document.appliedOperations?.map((id) => {
    for (const prefix of [`confirm-empty-invoice:${account.id}:`, ...(draft.includePaidInvoices ? [`pay-invoice:${account.id}:`] : [])]) {
      if (id.startsWith(prefix) && monthValid(id.slice(prefix.length))) return prefix + addMonths(id.slice(prefix.length), delta)
    }
    return id
  })
  const next: RepositoryDocument = { ...document, appliedOperations, collections: { ...document.collections,
    cardAccounts: accounts.map((row) => row.id === account.id ? revisedAccount : row), cardEntries: revisedEntries, cardPaidInvoices: paidWithCashAdjustments,
    history: history.map((snapshot) => revisedMonths.has(snapshot.month) ? { ...snapshot, corrections: [...snapshot.corrections ?? [], correction] } : snapshot),
  } }
  return { document: next, changes }
}

export const saveCardCalendar = (draft: CardCalendarDraft, expectedRevision: string | null) => runRepositoryCommand({
  id: uid(), expectedRevision, apply: (document) => reviewCardCalendar(document, draft).document,
})
