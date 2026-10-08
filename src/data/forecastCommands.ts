import type { CreditCardEntry, ExpectedEvent, ExpectedEventTerms, ExpectedOccurrenceOverride, ForecastFactLink, MonthlyActuals } from '../types'
import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'
import { normalizeActuals } from '../lib/actuals'
import { normalizePaidInvoiceSnapshots } from '../lib/cardCycleAccounting'
import { eventTerms, normalizeExpectedEvent, occurrenceFor } from '../lib/forecast'
import { factLinkKey, reconcileOccurrence, type ForecastMovementSource } from '../lib/forecastCoverage'
import { addMonths, localDateKey, uid } from '../lib/shared'
import { normalizeCreditCardEntry, syncGeneratedNextEntries } from '../lib/creditCards'
import { withCardEntrySpendingMonth } from '../lib/cardCycleAccounting'
import { cardDueMonthForOccurrence } from '../lib/forecastCoverage'
import { goalIncomeAllocationError } from '../lib/goalFunding'
import { cardCycleForDueMonth } from '../lib/cardCalendar'
import type { CreditCardAccount } from '../types'

const monthValid = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const moneyValid = (amount: number) => Number.isFinite(amount) && amount > 0 && Number.isSafeInteger(Math.round(amount * 100)) && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001

export function forecastContext(document: RepositoryDocument) {
  const movements: ForecastMovementSource[] = []
  for (const [collection, ownerType] of [['investmentHoldings', 'holding'], ['goals', 'goal'], ['debts', 'debt']] as const) {
    for (const row of document.collections[collection] as { id: string; transactions: ForecastMovementSource['entries'] }[] ?? []) movements.push({ ownerType, ownerId: row.id, entries: row.transactions ?? [] })
  }
  return { actuals: (document.collections.actuals as MonthlyActuals[] ?? []).map(normalizeActuals), cards: document.collections.cardEntries as CreditCardEntry[] ?? [], invoices: normalizePaidInvoiceSnapshots(document.collections.cardPaidInvoices), movements }
}

export function documentOccurrence(document: RepositoryDocument, event: ExpectedEvent, month: string) {
  const occurrence = occurrenceFor(event, month, true)
  if (!occurrence) throw new Error('Ocorrência não encontrada.')
  const context = forecastContext(document)
  return reconcileOccurrence(occurrence, context.actuals, localDateKey(), context.cards, context.invoices, context.movements)
}

function writeEvent(document: RepositoryDocument, event: ExpectedEvent): RepositoryDocument {
  for (const [month, override] of Object.entries(event.occurrenceOverrides ?? {})) {
    if (!override.goalAllocations?.length) continue
    const item = occurrenceFor(event, month, true)
    if (!item) continue
    const error = goalIncomeAllocationError(override.goalAllocations, item.amount * (item.event.savedPct ?? 100) / 100)
    if (error) throw new Error(error + ' Revise a divisão desta entrada em Metas e entradas previstas antes de reduzir o valor ou a parcela guardada.')
  }
  return { ...document, collections: { ...document.collections, forecastEvents: (document.collections.forecastEvents as ExpectedEvent[] ?? []).map((row) => row.id === event.id ? normalizeExpectedEvent(event) : row) } }
}

function findEvent(document: RepositoryDocument, id: string) {
  const event = (document.collections.forecastEvents as ExpectedEvent[] ?? []).find((row) => row.id === id)
  if (!event) throw new Error('Previsão não encontrada.')
  return normalizeExpectedEvent(event)
}

/** Guarda a definição que acompanha fatos; revisões da série não reescrevem o passado. */
export function freezeForecastFacts(document: RepositoryDocument, event: ExpectedEvent): ExpectedEvent {
  const context = forecastContext(document)
  const keys = new Set(Object.keys(event.occurrenceOverrides ?? {}))
  const occurrenceId = (id?: string) => { if (id?.startsWith(event.id + '@')) keys.add(id.slice(event.id.length + 1)) }
  for (const cycle of context.actuals) {
    for (const entry of [...cycle.extraIncome, ...cycle.extraExpenses]) {
      occurrenceId(entry.sourceOccurrenceId)
      if (!entry.sourceOccurrenceId && entry.sourceEventId === event.id) keys.add(cycle.month)
    }
    if (event.planLink && Object.hasOwn(cycle[event.planLink.type === 'cost' ? 'costs' : 'wants'], event.planLink.id)) keys.add(cycle.month)
  }
  for (const entry of context.cards) occurrenceId(entry.sourceForecastOccurrenceId)
  for (const invoice of context.invoices) {
    for (const item of invoice.forecastOccurrences ?? []) occurrenceId(item.id)
    for (const entry of invoice.entries ?? []) occurrenceId(entry.sourceForecastOccurrenceId)
  }
  const overrides = { ...event.occurrenceOverrides }
  for (const original of keys) {
    const occurrence = occurrenceFor(event, original, true)
    if (!occurrence) continue
    const item = reconcileOccurrence(occurrence, context.actuals, localDateKey(), context.cards, context.invoices, context.movements)
    if (item.paidAmount > 0.005 || item.committedAmount > 0.005) overrides[original] = { ...overrides[original], terms: eventTerms(item.event), month: item.month, date: item.date, amount: item.amount }
  }
  return { ...event, occurrenceOverrides: overrides }
}

function validateTerms(terms: ExpectedEventTerms) {
  if (terms.savedPct !== undefined && (!Number.isFinite(terms.savedPct) || terms.savedPct < 0 || terms.savedPct > 100)) throw new Error('A parte guardada deve ficar entre 0% e 100%.')
  if (!terms.name.trim() || !moneyValid(terms.amount) || !monthValid(terms.month) || terms.date && (!dateValid(terms.date) || terms.date.slice(0, 7) !== terms.month) ||
    terms.cashTreatment === 'card' && (!terms.cardDueMonth || !monthValid(terms.cardDueMonth) || terms.cardDueMonth < terms.month)) throw new Error('Confira nome, valor, mês e data da previsão.')
  if (terms.planLink && terms.kind !== 'expense') throw new Error('O vínculo com o plano deve ser uma saída.')
  if (terms.cashTreatment === 'planned' && !terms.planLink) throw new Error('Escolha o item do plano que cobre esta saída.')
}

export function editForecastInDocument(document: RepositoryDocument, id: string, originalMonth: string, terms: ExpectedEventTerms, scope: 'this' | 'following'): RepositoryDocument {
  validateTerms(terms)
  const before = findEvent(document, id)
  if (terms.kind !== before.kind) throw new Error('Preserve o tipo da previsão. Cadastre outra para uma entrada ou saída diferente.')
  const item = documentOccurrence(document, before, originalMonth)
  if (item.cancelled) throw new Error('Reative esta ocorrência antes de editar sua previsão.')
  if (terms.planLink && item.event.occurrenceOverrides?.[originalMonth]?.links?.length) throw new Error('Desvincule os registros desta ocorrência antes de escolher um item do plano.')
  if (item.status === 'settled') throw new Error('Esta ocorrência já foi realizada. Ajuste a próxima pendência ou corrija o fato na origem.')
  if (terms.amount + 0.005 < item.paidAmount + item.committedAmount) throw new Error('O valor previsto não pode ficar abaixo do já pago, recebido ou lançado no cartão.')
  if (item.committedAmount > 0 && (terms.cashTreatment !== item.event.cashTreatment || terms.month !== item.month || terms.date !== item.date || terms.cardDueMonth !== cardDueMonthForOccurrence(item))) throw new Error('A cobrança já está no cartão. Corrija sua data ou fatura em Cartões.')
  const frozen = freezeForecastFacts(document, before)
  const futureChanges = scope === 'following'
    ? { ...Object.fromEntries(Object.entries(frozen.futureChanges ?? {}).filter(([month]) => month < originalMonth)), [originalMonth]: terms }
    : frozen.futureChanges
  const overrides = { ...frozen.occurrenceOverrides }
  if (scope === 'following') for (const original of Object.keys(overrides).filter((month) => month > originalMonth)) {
    const prior = documentOccurrence(document, before, original)
    if (prior.status === 'settled' || prior.cancelled) continue
    if (terms.planLink && overrides[original]?.links?.length) throw new Error('Uma próxima ocorrência tem registros vinculados. Ajuste essa previsão separadamente.')
    const revised = occurrenceFor({ ...frozen, futureChanges, occurrenceOverrides: undefined }, original)!
    if (terms.amount + 0.005 < prior.paidAmount + prior.committedAmount) throw new Error('Uma próxima ocorrência já tem valor realizado ou lançado maior que o novo valor previsto.')
    if (prior.committedAmount > 0 && (terms.cashTreatment !== prior.event.cashTreatment || revised.month !== prior.month || revised.date !== prior.date || cardDueMonthForOccurrence(revised) !== cardDueMonthForOccurrence(prior))) throw new Error('Uma próxima cobrança já está no cartão. Ajuste essa previsão separadamente.')
    overrides[original] = { ...overrides[original], terms, month: revised.month, date: revised.date, amount: terms.amount }
  }
  overrides[originalMonth] = { ...overrides[originalMonth], terms, month: terms.month, date: terms.date, amount: terms.amount }
  const updated = { ...frozen, occurrenceOverrides: overrides, futureChanges }
  return writeEvent(document, updated)
}

export function editOccurrenceInDocument(document: RepositoryDocument, id: string, month: string, patch: ExpectedOccurrenceOverride): RepositoryDocument {
  const event = findEvent(document, id), item = documentOccurrence(document, event, month)
  if (patch.amount !== undefined && (!moneyValid(patch.amount) || patch.amount < item.paidAmount + item.committedAmount - 0.005)) throw new Error('O valor não pode ficar abaixo do já realizado ou lançado.')
  if (patch.month && !monthValid(patch.month) || patch.date && !dateValid(patch.date)) throw new Error('Data ou ciclo inválidos.')
  if (patch.month && patch.date && patch.date.slice(0, 7) !== patch.month) throw new Error('A data prevista deve pertencer ao mês previsto.')
  if (item.committedAmount > 0 && (patch.month !== undefined || patch.date !== undefined)) throw new Error('A cobrança já está no cartão. Corrija sua data ou fatura em Cartões.')
  if (item.status === 'settled' && (patch.amount !== undefined || patch.date !== undefined || patch.month !== undefined)) throw new Error('A ocorrência já foi realizada; seu registro fica preservado.')
  if (patch.realizedAmount !== undefined && (!moneyValid(patch.realizedAmount) || patch.realizedAmount > item.amount)) throw new Error('Valor efetivado inválido.')
  const frozen = freezeForecastFacts(document, event)
  const schedule = patch.month !== undefined && patch.date === undefined ? { date: undefined } : {}
  return writeEvent(document, { ...frozen, occurrenceOverrides: { ...frozen.occurrenceOverrides, [month]: { ...frozen.occurrenceOverrides?.[month], ...schedule, ...patch } } })
}

export function linkForecastFact(document: RepositoryDocument, id: string, month: string, link: ForecastFactLink): RepositoryDocument {
  const event = findEvent(document, id), item = documentOccurrence(document, event, month), context = forecastContext(document)
  if (item.cancelled) throw new Error('Reative a ocorrência antes de vincular um fato.')
  if (item.event.planLink) throw new Error('Esta ocorrência já acompanha o item do plano. Edite a previsão para mudar sua origem.')
  const key = factLinkKey(link)
  const links = event.occurrenceOverrides?.[month]?.links ?? []
  if (links.some((row) => factLinkKey(row) === key)) throw new Error('Este fato já está vinculado.')
  for (const other of document.collections.forecastEvents as ExpectedEvent[] ?? []) for (const [original, override] of Object.entries(other.occurrenceOverrides ?? {})) {
    if ((other.id !== id || original !== month) && override.links?.some((row) => factLinkKey(row) === key)) throw new Error('Este fato já está vinculado a outra ocorrência.')
  }
  let found = false
  if (link.type === 'cost' || link.type === 'want') found = item.event.kind === 'expense' && Object.hasOwn(context.actuals.find((row) => row.month === link.month)?.[link.type === 'cost' ? 'costs' : 'wants'] ?? {}, link.id)
  if (link.type === 'cash') {
    const entry = context.actuals.find((row) => row.month === link.month)?.[item.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'].find((row) => row.id === link.id)
    if (entry?.sourceOccurrenceId && entry.sourceOccurrenceId !== item.id || entry?.sourceEventId && entry.sourceEventId !== id) throw new Error('Este lançamento já pertence a outra previsão.')
    found = Boolean(entry)
  }
  if (link.type === 'card') {
    const entry = [...context.cards, ...context.invoices.flatMap((row) => row.entries ?? [])].find((row) => row.id === link.id)
    if (entry?.sourceForecastOccurrenceId && entry.sourceForecastOccurrenceId !== item.id) throw new Error('A compra já pertence a outra ocorrência.')
    found = item.event.kind === 'expense' && Boolean(entry && !entry.entryType && entry.personalAmount > 0)
  }
  if (link.type === 'movement') {
    const entry = context.movements.find((row) => row.ownerType === link.ownerType && row.ownerId === link.ownerId)?.entries.find((row) => row.id === link.id)
    found = Boolean(entry && (item.event.kind === 'income' ? entry.kind === 'withdrawal' : entry.kind === 'contribution' || entry.kind === 'amortization'))
  }
  if (!found) throw new Error('Escolha um fato compatível com esta entrada ou saída.')
  const frozen = freezeForecastFacts(document, event)
  return writeEvent(document, { ...frozen, occurrenceOverrides: { ...frozen.occurrenceOverrides, [month]: { ...frozen.occurrenceOverrides?.[month], links: [...links, link] } } })
}

export function realizeForecastInDocument(document: RepositoryDocument, id: string, month: string, amount: number, cycle: string, date: string): RepositoryDocument {
  const event = findEvent(document, id), item = documentOccurrence(document, event, month)
  if (!moneyValid(amount) || amount > item.unregisteredAmount + 0.005 || !monthValid(cycle) || !dateValid(date) || item.cancelled) throw new Error('Confira valor restante, data real e ciclo antes de registrar.')
  if (item.event.cashTreatment === 'planned' || item.event.planLink || item.event.occurrenceOverrides?.[month]?.links?.some((link) => link.type !== 'cash')) throw new Error('Esta ocorrência acompanha um registro existente. Atualize o fato na origem; não crie outra saída ou entrada.')
  if (item.event.cashTreatment === 'card') throw new Error('Registre ou vincule a cobrança em Cartões.')
  const frozen = freezeForecastFacts(document, event)
  const field = event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const actuals = (document.collections.actuals as MonthlyActuals[] ?? []).map(normalizeActuals)
  const target = actuals.find((row) => row.month === cycle) ?? normalizeActuals({ month: cycle })
  target[field] = [...target[field], { id: uid(), name: item.event.name, amount, sourceEventId: id, sourceOccurrenceId: item.id, occurredAt: date }]
  const updated = writeEvent(document, { ...frozen, occurrenceOverrides: { ...frozen.occurrenceOverrides, [month]: { ...frozen.occurrenceOverrides?.[month], terms: eventTerms(item.event), month: item.month, date: item.date, amount: item.amount } } })
  return { ...updated, collections: { ...updated.collections, actuals: [...actuals.filter((row) => row.month !== cycle), target].sort((a, b) => a.month.localeCompare(b.month)) } }
}

export function forecastCardInDocument(document: RepositoryDocument, id: string, month: string, input: { accountId: string; amount: number; date: string; budgetArea: CreditCardEntry['budgetArea'] }): RepositoryDocument {
  const event = findEvent(document, id), item = documentOccurrence(document, event, month)
  const account = (document.collections.cardAccounts as CreditCardAccount[] ?? []).find((row) => row.id === input.accountId)
  const dueMonth = cardDueMonthForOccurrence(item)
  if (!account?.currentDueMonth || !dueMonth || ![account.currentDueMonth, addMonths(account.currentDueMonth, 1)].includes(dueMonth) || !dateValid(input.date) ||
    !moneyValid(input.amount) || input.amount > item.unregisteredAmount + 0.005 || item.cancelled || item.event.kind !== 'expense') throw new Error('Confira cartão, fatura, data e valor ainda não lançado.')
  const entry = withCardEntrySpendingMonth(normalizeCreditCardEntry({ id: uid(), accountId: account.id, cardName: account.name, dueMonth,
    spendingMonth: cardCycleForDueMonth(account, dueMonth),
    cycle: dueMonth === account.currentDueMonth ? 'current' : 'next', description: item.event.name, purchaseDate: input.date.split('-').reverse().join('/'),
    amount: input.amount, personalAmount: input.amount, remainingAmount: 0, budgetArea: input.budgetArea, sourceForecastOccurrenceId: item.id }), account.currentDueMonth)
  const frozen = freezeForecastFacts(document, event)
  const updated = writeEvent(document, { ...frozen, occurrenceOverrides: { ...frozen.occurrenceOverrides, [month]: { ...frozen.occurrenceOverrides?.[month], terms: eventTerms(item.event), month: item.month, date: item.date, amount: item.amount } } })
  const entries = document.collections.cardEntries as CreditCardEntry[] ?? []
  const matching = [...entries.filter((row) => row.accountId === account.id), entry]
  return { ...updated, collections: { ...updated.collections, cardEntries: [...entries.filter((row) => row.accountId !== account.id), ...syncGeneratedNextEntries(matching, account.currentDueMonth)] } }
}

export const forecastCommand = (apply: (document: RepositoryDocument) => RepositoryDocument, expectedRevision?: string | null) => runRepositoryCommand({ id: uid(), expectedRevision, apply })
export const addForecast = (input: Omit<ExpectedEvent, 'id' | 'createdAt'>) => forecastCommand((document) => {
  validateTerms(input)
  const event = normalizeExpectedEvent({ ...input, id: uid(), createdAt: new Date().toISOString() })
  return { ...document, collections: { ...document.collections, forecastEvents: [...(document.collections.forecastEvents as ExpectedEvent[] ?? []), event] } }
})
export const cancelForecast = (id: string, cancelled: boolean) => forecastCommand((document) => writeEvent(document, { ...freezeForecastFacts(document, findEvent(document, id)), cancelled }))
