import type { CostCategory, FinanceScenario, HistoryCorrection, LedgerEntry, MonthlyActuals, MonthlySnapshot, SnapshotPatch } from '../types'
import type { RepositoryDocument } from './repository'
import { runRepositoryCommand } from './repositoryCommand'
import { normalizeActuals } from '../lib/actuals'
import { normalizeSnapshot, projectHistoryInvestments } from '../lib/history'
import type { MonthlyPlan } from '../lib/monthlyPlans'
import { addMonths, ledgerEntryCycleMonth, nowIso, uid } from '../lib/shared'
import { formatCurrency } from '../lib/format'
import { refreshMovementHistory, type MovementOwner } from './financialMovement'
import type { InvestmentLedgerSource } from '../lib/investmentActuals'

export interface CorrectionRow {
  key: string
  label: string
  amount: number
  source: 'extraIncome' | 'extraExpenses' | 'costs' | 'wants' | 'aggregate'
  id?: string
  field?: keyof SnapshotPatch
  category?: CostCategory
  context: string
  unknown?: boolean
}
export interface CorrectionMovement {
  key: string
  label: string
  owner: MovementOwner
  ownerId: string
  id: string
  month: string
  date: string
  amount: number
  locked: boolean
}

const money = (value: number) => Math.round(value * 100) / 100
const snapshotsOf = (doc: RepositoryDocument) => (doc.collections.history as MonthlySnapshot[] ?? []).map(normalizeSnapshot)
const ownersOf = (doc: RepositoryDocument) => [
  ...(['investmentHoldings', 'goals', 'debts'] as const).flatMap((collection) =>
    (doc.collections[collection] as { id: string; name: string; transactions: LedgerEntry[] }[] ?? []).map((row) => ({
      ...row, owner: (collection === 'investmentHoldings' ? 'holding' : collection === 'goals' ? 'goal' : 'debt') as MovementOwner,
    }))),
  ...(doc.collections.emergencyFund ? [{ id: 'reserve', name: 'Reserva', owner: 'reserve' as const,
    transactions: (doc.collections.emergencyFund as { transactions: LedgerEntry[] }).transactions ?? [] }] : []),
]

/** Apresenta a origem existente; agregados só ficam editáveis quando não há um fato detalhado. */
export function historyCorrectionRows(doc: RepositoryDocument, id: string): CorrectionRow[] {
  const snapshot = snapshotsOf(doc).find((row) => row.id === id)
  if (!snapshot) throw new Error('Fechamento não encontrado.')
  const actual = normalizeActuals((doc.collections.actuals as MonthlyActuals[] ?? []).find((row) => row.month === snapshot.month) ?? { month: snapshot.month })
  const plan = (doc.collections.monthlyPlans as MonthlyPlan[] ?? []).find((row) => row.month === snapshot.month)
  const scenario = (doc.collections.scenarios as FinanceScenario[] ?? []).find((row) => row.id === snapshot.scenarioId)
  const rows: CorrectionRow[] = []
  const aggregate = (field: keyof SnapshotPatch, label: string, amount: number, context = 'Ajuste explícito do agregado preservado no fechamento') => rows.push({ key: field, field, label, amount, source: 'aggregate', context })
  aggregate('paycheckInAccount', 'Salário na conta', snapshot.paycheckInAccount, actual.paycheck ? 'Folha confirmada na origem' : undefined)
  aggregate('payrollInvested', 'Previdência em folha', snapshot.payrollInvested, actual.paycheck ? 'Folha confirmada na origem' : undefined)
  aggregate('employerInvested', 'Contrapartida da empresa', snapshot.employerInvested, snapshot.employerInvestmentKnown ? 'Folha do fechamento' : 'Não informada; alterar confirma o valor')
  rows.at(-1)!.unknown = !snapshot.employerInvestmentKnown
  if (!actual.paycheck) aggregate('availableForBudget', 'Base do orçamento', snapshot.availableForBudget)
  for (const [source, field, entries, label] of [
    ['extraIncome', 'extraIncome', snapshot.extraIncomeEntries, 'Entrada extra'],
    ['extraExpenses', 'extraExpense', snapshot.extraExpenseEntries, 'Saída extraordinária'],
  ] as const) {
    const debtIds = new Set(ownersOf(doc).filter((row) => row.owner === 'debt').flatMap((row) => row.transactions.map((tx) => tx.id)))
    const detailed = [...actual[source], ...entries.filter((row) => !actual[source].some((item) => item.id === row.id))]
    for (const entry of detailed) {
      if (debtIds.has(entry.id)) continue
      rows.push({ key: `${source}:${entry.id}`, id: entry.id, label: `${label} · ${entry.name}`, amount: entry.amount, source,
        context: `${entry.occurredAt ?? 'Data real não registrada'}${entry.sourceEventId ? ' · vinculado à agenda' : ''}` })
    }
    if (!detailed.length) aggregate(field, label, snapshot[field])
  }
  for (const [source, label, field] of [['costs', 'Custo', 'costs'], ['wants', 'Desejo fora do cartão', 'wants']] as const) {
    const definitions = plan?.[source] ?? scenario?.[source] ?? []
    const facts = Object.entries(actual[source]).filter(([id]) => definitions.find((row) => row.id === id)?.paidWith !== 'card')
    if (!facts.length && source === 'wants' && snapshot.wantAllocations.length) {
      for (const allocation of snapshot.wantAllocations) rows.push({ key: `wants:${allocation.id}`, id: allocation.id,
        label: `${label} · ${allocation.name}`, amount: allocation.actual, source, context: 'Destinação preservada no fechamento' })
    } else for (const [id, amount] of facts) {
      const definition = definitions.find((row) => row.id === id)
      rows.push({ key: `${source}:${id}`, id, label: `${label} · ${definition?.name ?? id}`, amount, source,
        category: source === 'costs' ? (definition as { category?: CostCategory } | undefined)?.category : undefined,
        context: 'Pagamento confirmado na origem' })
    }
    if (!facts.length && !(source === 'wants' && snapshot.wantAllocations.length)) aggregate(field, label, snapshot[field])
  }
  // A fatura preservada é um pagamento ao banco. Corrigir apenas o total quebraria sua composição.
  const invoices = doc.collections.cardPaidInvoices as { dueMonth: string }[] ?? []
  if (!invoices.some((row) => row.dueMonth === addMonths(snapshot.month, 1))) aggregate('cardPersonalTotal', 'Fatura pessoal sem composição', snapshot.cardPersonalTotal)
  for (const [field, label] of [['grossAssets', 'Ativos financeiros na data do fechamento'], ['physicalAssets', 'Bens na data do fechamento'], ['liabilities', 'Dívidas na data do fechamento'], ['securedLiabilities', 'Dívida com bem na data do fechamento']] as const) aggregate(field, label, snapshot[field])
  return rows
}

export function historyCorrectionMovements(doc: RepositoryDocument, month: string): CorrectionMovement[] {
  const seen = new Set<string>()
  return ownersOf(doc).flatMap((row) => row.transactions.filter((tx) => ledgerEntryCycleMonth(tx) === month).flatMap((tx) => {
    const key = tx.operationId ?? `${row.owner}:${row.id}:${tx.id}`
    if (seen.has(key)) return []
    seen.add(key)
    const labels = { contribution: 'Aporte', withdrawal: 'Resgate', transfer_in: 'Transferência recebida', transfer_out: 'Transferência enviada', amortization: 'Amortização', opening_balance: 'Saldo anterior', adjustment: 'Ajuste de saldo', balance_increase: 'Aumento da dívida' }
    return [{ key, owner: row.owner, ownerId: row.id, id: tx.id, label: `${row.name} · ${tx.note ?? (tx.kind ? labels[tx.kind] : 'Movimento')}`,
      month, date: tx.date, amount: tx.amount,
      locked: ownersOf(doc).some((owner) => owner.transactions.some((entry) => (tx.operationId ? entry.operationId === tx.operationId : entry.id === tx.id) && entry.cashTreatment === 'planned_cost')) }]
  }))
}

export function investmentSourceOf(doc: RepositoryDocument): InvestmentLedgerSource {
  return { holdings: doc.collections.investmentHoldings as InvestmentLedgerSource['holdings'] ?? [],
    goals: doc.collections.goals as InvestmentLedgerSource['goals'] ?? [],
    emergencyFund: doc.collections.emergencyFund as InvestmentLedgerSource['emergencyFund'] ?? { current: 0, targetMonths: 6, transactions: [] } }
}

function moveCycle(doc: RepositoryDocument, movement: CorrectionMovement, month: string): RepositoryDocument {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || movement.locked) throw new Error('Ciclo inválido ou amortização vinculada ao ciclo da parcela paga.')
  const entry = ownersOf(doc).find((row) => row.owner === movement.owner && row.id === movement.ownerId)?.transactions.find((row) => row.id === movement.id)
  if (!entry) throw new Error('Movimento não encontrado.')
  const next = structuredClone(doc)
  const matches = (tx: LedgerEntry, owner: MovementOwner, id: string) => entry.operationId ? tx.operationId === entry.operationId : owner === movement.owner && id === movement.ownerId && tx.id === entry.id
  for (const collection of ['investmentHoldings', 'goals', 'debts'] as const) {
    const owner = collection === 'investmentHoldings' ? 'holding' : collection === 'goals' ? 'goal' : 'debt'
    if (next.collections[collection]) next.collections[collection] = (next.collections[collection] as { id: string; transactions: LedgerEntry[] }[]).map((row) => ({ ...row, transactions: row.transactions.map((tx) => matches(tx, owner, row.id) ? { ...tx, cycleMonth: month } : tx) }))
  }
  if (next.collections.emergencyFund) {
    const fund = next.collections.emergencyFund as { transactions: LedgerEntry[] }
    fund.transactions = fund.transactions.map((tx) => matches(tx, 'reserve', 'reserve') ? { ...tx, cycleMonth: month } : tx)
  }
  return refreshMovementHistory(doc, next)
}

export interface HistoryDraft {
  amounts: Record<string, number | null>
  months: Record<string, string>
  note: string
  reason: string
}

export function correctHistoryInDocument(document: RepositoryDocument, id: string, draft: HistoryDraft): RepositoryDocument {
  if (!draft.reason.trim()) throw new Error('Informe o motivo da correção.')
  const original = snapshotsOf(document).find((row) => row.id === id)
  if (!original) throw new Error('Fechamento não encontrado.')
  let next = structuredClone(document)
  const snapshot = snapshotsOf(next).find((row) => row.id === id)!
  const changes: HistoryCorrection['changes'] = []
  const months = new Set([snapshot.month])
  const actuals = (next.collections.actuals as MonthlyActuals[] ?? []).map(normalizeActuals)
  const actual = actuals.find((row) => row.month === snapshot.month) ?? normalizeActuals({ month: snapshot.month })
  let actualChanged = false
  for (const row of historyCorrectionRows(document, id)) {
    const value = draft.amounts[row.key]
    if (value === undefined || row.unknown && value === null || !row.unknown && value === row.amount) continue
    if (value === null || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error(`Informe um valor válido para ${row.label}; zero precisa ser explícito.`)
    const delta = money(value - row.amount)
    changes.push({ label: row.label, before: row.unknown ? 'Não informada' : formatCurrency(row.amount), after: formatCurrency(value), source: row.context })
    if (row.source === 'aggregate' && row.field) {
      Object.assign(snapshot, { [row.field]: value })
      if (row.field === 'costs') snapshot.costsByCategory = {}
      if (row.field === 'cardPersonalTotal') snapshot.cardByArea = {}
      if (row.field === 'wants') snapshot.wantAllocations = []
      if (row.field === 'employerInvested') snapshot.employerInvestmentKnown = true
      if (actual.paycheck && ['paycheckInAccount', 'payrollInvested', 'employerInvested'].includes(row.field)) {
        actual.paycheck = { ...actual.paycheck, origin: 'manual',
          [row.field === 'paycheckInAccount' ? 'amount' : row.field === 'payrollInvested' ? 'payrollInvestment' : 'employerInvestment']: value }
        actualChanged = true
      }
    } else if (row.source === 'extraIncome' || row.source === 'extraExpenses') {
      const detailField = row.source === 'extraIncome' ? 'extraIncomeEntries' : 'extraExpenseEntries'
      const totalField = row.source === 'extraIncome' ? 'extraIncome' : 'extraExpense'
      const entry = actual[row.source].find((entry) => entry.id === row.id) ?? snapshot[detailField].find((entry) => entry.id === row.id)
      if (!entry) throw new Error('Lançamento de origem não encontrado.')
      const updated = { ...entry, amount: value }
      // Zero desfaz o valor realizado; a previsão continua vinculada pelo mesmo ID quando houver valor.
      actual[row.source] = [...actual[row.source].filter((entry) => entry.id !== row.id), ...(value > 0 ? [updated] : [])]
      snapshot[detailField] = [...snapshot[detailField].filter((entry) => entry.id !== row.id), ...(value > 0 ? [updated] : [])]
      snapshot[totalField] = money(snapshot[totalField] + delta)
      actualChanged = true
    } else if (row.source === 'costs' || row.source === 'wants') {
      actual[row.source][row.id!] = value
      if (row.source === 'costs') {
        const principal = ownersOf(next).filter((owner) => owner.owner === 'debt').flatMap((owner) => owner.transactions).filter((tx) => tx.linkedCostId === row.id && ledgerEntryCycleMonth(tx) === snapshot.month && tx.cashTreatment === 'planned_cost').reduce((total, tx) => total - tx.amount, 0)
        if (value < principal - 0.005) throw new Error('Reverta a amortização vinculada antes de reduzir a parcela abaixo do principal pago.')
        actual.costOrigins = { ...actual.costOrigins, [row.id!]: 'manual' }
        snapshot.costs = money(snapshot.costs + delta)
        if (row.category) snapshot.costsByCategory[row.category] = money((snapshot.costsByCategory[row.category] ?? 0) + delta)
        else snapshot.costsByCategory = {}
      } else {
        actual.wantOrigins = { ...actual.wantOrigins, [row.id!]: 'manual' }
        snapshot.wants = money(snapshot.wants + delta)
        snapshot.wantAllocations = snapshot.wantAllocations.map((entry) => entry.id === row.id ? { ...entry, actual: value } : entry)
      }
      actualChanged = true
    }
  }
  if (actualChanged) next.collections.actuals = [...actuals.filter((row) => row.month !== actual.month), actual].sort((a, b) => a.month.localeCompare(b.month))
  if (actual.paycheck && changes.some((row) => ['Salário na conta', 'Previdência em folha'].includes(row.label))) snapshot.availableForBudget = money(snapshot.paycheckInAccount + snapshot.payrollInvested)
  if (draft.note.trim() !== (snapshot.note ?? '')) changes.push({ label: 'Nota', before: snapshot.note ?? '', after: draft.note.trim(), source: 'Fechamento' })
  snapshot.note = draft.note.trim() || undefined
  snapshot.invested = money(snapshot.payrollInvested + snapshot.directInvestedAtClose)
  snapshot.savingsRate = snapshot.availableForBudget + snapshot.extraIncome > 0 ? snapshot.invested / (snapshot.availableForBudget + snapshot.extraIncome) * 100 : 0
  snapshot.netWorth = money(snapshot.grossAssets + snapshot.physicalAssets - snapshot.liabilities)
  if (snapshot.securedLiabilities > snapshot.liabilities + 0.005) throw new Error('A dívida vinculada a bens não pode superar o total de dívidas do fechamento.')
  const cashDelta = money(snapshot.paycheckInAccount - original.paycheckInAccount + snapshot.extraIncome - original.extraIncome - snapshot.extraExpense + original.extraExpense - snapshot.costs + original.costs - snapshot.wants + original.wants)
  snapshot.balance = money(original.balance + cashDelta)
  snapshot.cashLeftover = money(original.cashLeftover + cashDelta)
  next.collections.history = snapshotsOf(next).map((row) => row.id === id ? snapshot : row)
  for (const movement of historyCorrectionMovements(document, original.month)) {
    const month = draft.months[movement.key]
    if (month === undefined || month === movement.month) continue
    next = moveCycle(next, movement, month)
    months.add(month)
    changes.push({ label: movement.label, before: movement.month, after: month, source: `Livro de movimentos · data real preservada: ${movement.date.slice(0, 10)}` })
  }
  if (!changes.length) throw new Error('Nenhuma alteração para salvar.')
  // Legados sem operationId também precisam rever o caixa dos dois ciclos.
  const beforeProjected = projectHistoryInvestments(snapshotsOf(document), investmentSourceOf(document))
  const afterProjected = projectHistoryInvestments(snapshotsOf(next), investmentSourceOf(next))
  const correction: HistoryCorrection = { id: uid(), correctedAt: nowIso(), reason: draft.reason.trim(), revisedMonths: [...months].sort(), changes }
  next.collections.history = snapshotsOf(next).map((row) => {
    if (!months.has(row.month)) return row
    const before = beforeProjected.find((item) => item.id === row.id)!, after = afterProjected.find((item) => item.id === row.id)!
    const deltaDirect = money(after.directInvestedAtClose - before.directInvestedAtClose)
    const alreadyAdjusted = money(row.directInvestedAtClose - (row.id === id ? snapshot.directInvestedAtClose : snapshotsOf(document).find((item) => item.id === row.id)!.directInvestedAtClose))
    const remainingDelta = money(deltaDirect - alreadyAdjusted)
    return { ...row, directInvestedAtClose: after.directInvestedAtClose, invested: after.invested, savingsRate: after.savingsRate,
      balance: money(row.balance - remainingDelta), cashLeftover: money(row.cashLeftover - remainingDelta),
      corrections: [...row.corrections ?? [], correction] }
  })
  return next
}

export const saveHistoryCorrection = (id: string, draft: HistoryDraft, expectedRevision: string | null) => runRepositoryCommand({
  id: uid(), expectedRevision, apply: (document) => correctHistoryInDocument(document, id, draft),
})
