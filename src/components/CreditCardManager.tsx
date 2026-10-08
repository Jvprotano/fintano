import { useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FastForward,
  Filter,
  HandCoins,
  Pencil,
  Repeat,
  Search,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { Card } from './Card'
import { CardImportPanel } from './cards/CardImportPanel'
import { CardAccountsPanel } from './cards/CardAccountsPanel'
import { CardSummaryPanels } from './cards/CardSummaryPanels'
import { CardAreaCell } from './cards/CardAreaCell'
import { CardEntryForm } from './cards/CardEntryForm'
import { InvoiceCreditForm } from './cards/InvoiceCreditForm'
import { InvoicePaymentReview } from './cards/InvoicePaymentReview'
import {
  Meter,
  FormField,
  Panel,
  PanelHeader,
  SecondaryButton,
  SegmentedControl,
  StatTile,
} from './ui'
import { formatCurrency, formatDate, formatMonthLong } from '../lib/format'
import { addMonths, normalizeText } from '../lib/shared'
import {
  buildRemainingAmount,
} from '../lib/cardImport'
import { useCardsStore, useFinancasStore, useMetrics } from '../context/financasStore'
import type { CreditCardCycle, CreditCardEntry } from '../types'
import { BUDGET_AREA_COLORS } from '../types/constants'
import { repositoryRevision } from '../data/repositoryCommand'
import { calculateCreditCardSummary, formatCardDueDate } from '../lib/creditCards'
import { cardEntriesForCycle } from '../lib/cardCycleView'
import { PaidCardEntry } from './cards/PaidCardEntry'

type View = CreditCardCycle | 'import'
type SortKey = 'description' | 'purchaseDate' | 'cardName' | 'amount'
type SortState = { key: SortKey; dir: 'asc' | 'desc' }

const TABLE_COLS =
  'grid-cols-[minmax(140px,1.4fr)_84px_64px_92px_128px_104px_104px_104px_minmax(72px,0.8fr)_56px]'

// Converte "dd/mm" num inteiro comparável (mm*100+dd). Sem data vai para o fim.
function dateSortValue(raw: string) {
  const match = raw.match(/(\d{1,2})\s*\/\s*(\d{1,2})/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[2]) * 100 + Number(match[1])
}

export function CreditCardManager() {
  const {
    entries,
    migrationError,
    entryError,
    accounts,
    settings,
    paidInvoices,
    addEntry,
    updateEntry,
    removeEntry,
    restoreEntry,
    anticipateInstallments,
    payInvoice,
    confirmEmptyInvoice,
    setSettings,
  } = useCardsStore()
  const { availableForBudget, budgetComparison, plannedOnCard } = useMetrics()
  const { activeCycle, cardCycleAccounting } = useFinancasStore()
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(null)
  const [importAccountId, setImportAccountId] = useState('')
  const paymentAccount = accounts.find((account) => account.id === paymentAccountId)
  const importAccount = accounts.find((account) => account.id === importAccountId) ?? accounts[0]
  const currentDueMonth = addMonths(activeCycle.month, 1)
  const nextDueMonth = addMonths(currentDueMonth, 1)
  const paymentDueMonth = paymentAccount?.currentDueMonth ?? currentDueMonth
  const cycleEntries = useMemo(() => cardEntriesForCycle(entries, paidInvoices, accounts, activeCycle.month),
    [entries, paidInvoices, accounts, activeCycle.month])
  const summary = useMemo(() => calculateCreditCardSummary(cycleEntries, settings), [cycleEntries, settings])
  const paymentSummary = useMemo(() => calculateCreditCardSummary(entries.filter((entry) => entry.accountId === paymentAccountId), settings), [entries, paymentAccountId, settings])
  const pendingTotal = calculateCreditCardSummary(cycleEntries.filter((entry) => !entry.paidAt), settings).currentTotal
  const paidCards = accounts.filter((account) => paidInvoices.some((invoice) => invoice.accountId === account.id && invoice.dueMonth === currentDueMonth)).map((account) => account.name)

  const [view, setView] = useState<View>('current')

  const [ownerFilter, setOwnerFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [importText, setImportText] = useState('')
  const [importCycle, setImportCycle] = useState<CreditCardCycle>('current')
  const [replaceOnImport, setReplaceOnImport] = useState(false)

  const [anticipateId, setAnticipateId] = useState<string | null>(null)
  const [anticipateCount, setAnticipateCount] = useState(1)
  const [showPaySummary, setShowPaySummary] = useState(false)
  const [paymentReviewRevision, setPaymentReviewRevision] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [showCreditForm, setShowCreditForm] = useState(false)

  // Exclusão com desfazer: guarda o último lançamento removido por alguns segundos.
  const [pendingUndo, setPendingUndo] = useState<CreditCardEntry | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleCycle: CreditCardCycle = view === 'next' ? 'next' : 'current'
  const normalizedSearch = normalizeText(search)

  const filteredEntries = cycleEntries.filter((entry) => {
    if (entry.cycle !== visibleCycle) return false
    if (
      normalizedSearch &&
      !normalizeText(
        `${entry.description} ${entry.cardName} ${entry.ownerName ?? ''} ${entry.ownerNote ?? ''}`,
      ).includes(normalizedSearch)
    ) {
      return false
    }
    if (ownerFilter === 'all') return true
    if (ownerFilter === 'mine') return entry.personalAmount > 0
    if (ownerFilter === 'third-party') return entry.entryType !== 'invoiceCredit' && entry.amount - entry.personalAmount > 0
    if (ownerFilter === 'prepaid') return entry.isPrepaid === true
    if (ownerFilter === 'unclassified') return entry.entryType !== 'invoiceCredit' && !entry.budgetArea
    return (entry.ownerName || entry.ownerNote || 'Outro') === ownerFilter
  })

  const visibleEntries = sort
    ? [...filteredEntries].sort((a, b) => {
        const dir = sort.dir === 'asc' ? 1 : -1
        if (sort.key === 'amount') return dir * (a.amount - b.amount)
        if (sort.key === 'purchaseDate')
          return dir * (dateSortValue(a.purchaseDate) - dateSortValue(b.purchaseDate))
        return dir * (a[sort.key] || '').localeCompare(b[sort.key] || '', 'pt-BR')
      })
    : filteredEntries
  const filteredTotals = filteredEntries.reduce(
    (totals, entry) => {
      if (entry.entryType === 'invoiceCredit') return totals
      totals.amount += entry.amount
      totals.personal += entry.personalAmount
      totals.thirdParty += Math.max(0, entry.amount - entry.personalAmount)
      return totals
    },
    { amount: 0, personal: 0, thirdParty: 0 },
  )
  const toggleSort = (key: SortKey) =>
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      return prev.dir === 'asc' ? { key, dir: 'desc' } : null
    })

  const handleDelete = (entry: CreditCardEntry) => {
    if (!removeEntry(entry.id)) return
    setPendingUndo(entry)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setPendingUndo(null), 6000)
  }

  const handleUndoDelete = () => {
    if (!pendingUndo) return
    if (!restoreEntry(pendingUndo)) return
    setPendingUndo(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }


  const anticipatingEntry = anticipateId
    ? (entries.find((entry) => entry.id === anticipateId) ?? null)
    : null
  const anticipateMax =
    anticipatingEntry?.installmentCurrent && anticipatingEntry.installmentTotal
      ? anticipatingEntry.installmentTotal - anticipatingEntry.installmentCurrent
      : 0

  const knownCards = accounts.map((account) => account.name)
  const knownOwners = Array.from(
    new Set(
      entries
        .filter((entry) => entry.amount - entry.personalAmount > 0)
        .map((entry) => entry.ownerName || entry.ownerNote || 'Outro'),
    ),
  )

  const personalSpendPct =
    settings.personalSpendingLimit > 0
      ? (summary.currentPersonalTotal / settings.personalSpendingLimit) * 100
      : 0

  const handleImport = () => { setImportText(''); setView(importCycle) }

  const handleInstallmentChange = (
    entry: CreditCardEntry,
    field: 'current' | 'total',
    raw: string,
  ) => {
    const value = Number(raw.replace(/\D/g, '')) || 0
    const installmentCurrent = field === 'current' ? value : (entry.installmentCurrent ?? 0)
    const installmentTotal = field === 'total' ? value : (entry.installmentTotal ?? 0)
    updateEntry(entry.id, {
      installmentCurrent: installmentCurrent || undefined,
      installmentTotal: installmentTotal || undefined,
      remainingAmount: buildRemainingAmount(entry.amount, installmentCurrent, installmentTotal),
    })
  }

  const handleAnticipate = () => {
    if (!anticipatingEntry || anticipateMax < 1) return
    if (!anticipateInstallments(anticipatingEntry.id, Math.min(Math.max(1, anticipateCount), anticipateMax))) return
    setAnticipateId(null)
    setAnticipateCount(1)
  }

  const handlePayInvoice = () => {
    if (!paymentAccount) return
    const result = payInvoice(paymentAccount.id, paymentReviewRevision)
    if (!result.ok) {
      setPaymentError(result.message)
      return
    }
    setPaymentError('')
    setShowPaySummary(false)
    setPaymentAccountId(null)
  }
  const addSelectedEntry = (entry: Omit<CreditCardEntry, 'id'>) => {
    const account = accounts.find((candidate) => candidate.name === entry.cardName)
    if (!account) return false
    const dueMonth = visibleCycle === 'next' || paidCards.includes(account.name) ? nextDueMonth : currentDueMonth
    return addEntry({ ...entry, accountId: account.id, cardName: account.name, dueMonth })
  }

  const renderSortHeader = (
    key: SortKey,
    label: string,
    align: 'left' | 'right' | 'center' = 'left',
  ) => {
    const active = sort?.key === key
    const alignClass =
      align === 'right' ? 'justify-end pr-2' : align === 'center' ? 'justify-center' : 'justify-start'
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`flex items-center gap-1 ${alignClass} font-medium uppercase tracking-wider transition-colors hover:text-dark-text ${
          active ? 'text-dark-text' : ''
        }`}
      >
        {label}
        {active ? (
          sort?.dir === 'asc' ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ArrowUpDown size={11} className="opacity-30" />
        )}
      </button>
    )
  }

  const cellClass =
    'w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-all focus:border-dark-border focus:bg-dark-input'
  const moneyCellClass =
    '!border-transparent !bg-transparent !py-1 !pl-6 !pr-2 text-sm transition-all hover:!bg-white/5 focus:!border-dark-border focus:!bg-dark-input'

  if (migrationError) return <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{migrationError}</p>

  return (
    <div className="space-y-4">
      {accounts.length === 0 && <CardAccountsPanel />}
      {accounts.length > 0 && <Card title="Faturas dos cartões" icon={<CreditCard size={17} />} collapsible storageKey="card-invoices">
        <p className="text-sm text-dark-text-muted">Faturas deste ciclo. Pagar preserva os lançamentos; a consulta avança junto com o ciclo.</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {accounts.map((account) => {
            const dueMonth = currentDueMonth
            const dueDate = formatCardDueDate(dueMonth, account.dueDay)
            const nextDueDate = formatCardDueDate(nextDueMonth, account.dueDay)
            const invoicePaid = paidInvoices.find((invoice) => invoice.accountId === account.id && invoice.dueMonth === dueMonth)
            const openDueMonth = account.currentDueMonth ?? dueMonth
            const previousPending = openDueMonth < dueMonth
            const paymentKnown = entries.some((entry) => entry.accountId === account.id && entry.dueMonth === openDueMonth) || account.confirmedEmptyDueMonths?.includes(openDueMonth) === true
            const accountEntries = cycleEntries.filter((entry) => entry.accountId === account.id)
            const accountSummary = calculateCreditCardSummary(accountEntries, settings)
            const invoiceHasEntries = accountEntries.some((entry) => entry.cycle === 'current')
            const emptyConfirmed = account.confirmedEmptyDueMonths?.includes(dueMonth) === true
            const history = paidInvoices.filter((invoice) => invoice.accountId === account.id)
            return <section key={account.id} className={`rounded-xl border border-dark-border bg-dark-surface/60 p-3 ${paymentAccountId === account.id && showPaySummary ? 'lg:col-span-2' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-dark-text">{account.name}</h3>
                  <p className="mt-1 text-sm tabular-nums text-dark-text-secondary">{dueDate ? `Vencimento ${dueDate}` : 'Vencimento não informado'}</p>
                  {!dueDate && <p className="mt-1 text-xs text-dark-text-muted">Informe o dia em Configurar cartões.</p>}
                  {invoicePaid && nextDueDate && <p className="mt-1 text-xs tabular-nums text-dark-text-secondary">Próximo vencimento {nextDueDate}</p>}
                  <p className="mt-1 text-xs text-dark-text-muted">Ciclo {formatMonthLong(activeCycle.month)} · {accountEntries.filter((entry) => entry.cycle === 'current').length} lançamentos</p>
                </div>
                <div className="text-right"><strong className="block tabular-nums text-dark-text">{invoicePaid ? invoicePaid.total === null ? '—' : formatCurrency(invoicePaid.total) : formatCurrency(accountSummary.currentTotal)}</strong>{invoicePaid && <span className="block text-xs text-primary-400">Paga em {formatDate(invoicePaid.paidAt)}</span>}<span className="block text-xs tabular-nums text-dark-text-secondary">meu: {formatCurrency(invoicePaid?.personalTotal ?? accountSummary.currentPersonalTotal)}</span>{accountSummary.currentThirdPartyTotal > 0 && <span className="block text-xs tabular-nums text-dark-text-muted">não meu: {formatCurrency(accountSummary.currentThirdPartyTotal)}</span>}</div>
              </div>
              {accountSummary.remainingInstallmentsTotal > 0 && <p className="mt-2 text-xs tabular-nums text-dark-text-secondary">Parcelas restantes: {formatCurrency(accountSummary.remainingInstallmentsTotal)} · minha parte {formatCurrency(accountSummary.remainingPersonalInstallmentsTotal)}</p>}
              {!invoicePaid && !invoiceHasEntries && !emptyConfirmed && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-dark-text-secondary"><span>Fatura ainda sem valor informado.</span><SecondaryButton onClick={() => confirmEmptyInvoice(account.id, dueMonth)}>Confirmar sem lançamentos</SecondaryButton></div>}
              {!invoicePaid && !invoiceHasEntries && emptyConfirmed && <p className="mt-2 text-xs text-primary-400">Sem lançamentos confirmados.</p>}
              {previousPending && <p className="mt-2 text-xs text-dark-text-muted">Fatura anterior com vencimento em {formatCardDueDate(openDueMonth, account.dueDay) ?? formatMonthLong(openDueMonth)} ainda pendente. A confirmação individual começa por ela.</p>}
              {previousPending && !paymentKnown && <SecondaryButton onClick={() => confirmEmptyInvoice(account.id, openDueMonth)}>Confirmar anterior sem lançamentos</SecondaryButton>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!invoicePaid && <button type="button" disabled={!paymentKnown || openDueMonth > dueMonth} onClick={() => { setPaymentAccountId(account.id); setPaymentReviewRevision(repositoryRevision()); setPaymentError(''); setShowPaySummary(true) }} className="text-xs font-medium text-primary-400 hover:text-primary-300">{previousPending ? 'Confirmar fatura anterior primeiro' : 'Confirmar pagamento'}</button>}
                {history.length > 0 && <details className="text-xs text-dark-text-secondary"><summary className="cursor-pointer">Faturas pagas ({history.length})</summary><div className="mt-2 space-y-2">{[...history].reverse().map((invoice) => <details key={invoice.id ?? `${invoice.accountId}-${invoice.dueMonth}`} className="rounded-lg border border-dark-border bg-dark-card p-2"><summary className="cursor-pointer">{formatMonthLong(invoice.dueMonth)} · {invoice.total === null ? '—' : formatCurrency(invoice.total)} · paga em {invoice.paidAt.slice(0, 10)}</summary><p className="mt-2">Minha parte: {formatCurrency(invoice.personalTotal)}. {invoice.entries ? `${invoice.entries.length} lançamentos preservados.` : 'Composição legada não disponível.'}</p>{invoice.entries?.map((entry) => <div key={entry.id} className="flex justify-between gap-2 border-t border-dark-border-subtle py-1"><span>{entry.description}</span><span className="tabular-nums">{entry.entryType === 'invoiceCredit' ? '−' : ''}{formatCurrency(entry.amount)}</span></div>)}</details>)}</div></details>}
              </div>
              {showPaySummary && paymentAccountId === account.id && <div className="mt-3">
                <InvoicePaymentReview ownBankPayment={paymentSummary.currentTotal} summary={paymentSummary} currentDueMonth={paymentDueMonth} currentSpendingMonth={addMonths(paymentDueMonth, -1)} nextDueMonth={addMonths(paymentDueMonth, 1)} onConfirm={handlePayInvoice} onCancel={() => { setShowPaySummary(false); setPaymentAccountId(null) }} />
                {paymentError && <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{paymentError}</p>}
              </div>}
            </section>
          })}
        </div>
      </Card>}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Minha parte"
          value={formatCurrency(cardCycleAccounting.invoiceFormedByCycle.personalTotal)}
          detail={
            availableForBudget > 0
              ? `${((summary.currentPersonalTotal / availableForBudget) * 100).toFixed(0)}% da base do orçamento`
              : undefined
          }
          tone={summary.currentPersonalTotal > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Total das faturas deste ciclo"
          value={cardCycleAccounting.invoiceFormedByCycle.amountKnown ? formatCurrency(cardCycleAccounting.invoiceFormedByCycle.total!) : '—'}
          detail={
            `${summary.currentEntriesCount} lançamentos${summary.currentAppliedCreditTotal > 0 ? ` · ${formatCurrency(summary.currentAppliedCreditTotal)} abatidos` : ''}${summary.currentPrepaidTotal > 0 ? ` · ${formatCurrency(summary.currentPrepaidTotal)} pagos por compra` : ''}`
          }
        />
        <StatTile
          label="Ainda a pagar ao banco"
          value={formatCurrency(pendingTotal)}
          detail={`${formatCurrency(summary.currentTotal - pendingTotal)} em faturas pagas`}
        />
        <StatTile
          label={summary.availablePersonalLimit >= 0 ? 'Limite disponível' : 'Acima do limite'}
          value={formatCurrency(Math.abs(summary.availablePersonalLimit))}
          detail={`${personalSpendPct.toFixed(0)}% do teto de ${formatCurrency(settings.personalSpendingLimit)}`}
          tone={summary.availablePersonalLimit >= 0 ? 'neutral' : 'negative'}
        />
      </div>
      {summary.currentUnappliedCreditTotal > 0 && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">
          {formatCurrency(summary.currentUnappliedCreditTotal)} em abatimentos excedem a sua parte devida no cartão correspondente. Ao pagar a fatura, esse saldo passará para a próxima.
        </p>
      )}

      <Panel>
        <PanelHeader
          title="Seu teto de gasto"
          description="Defina seu limite pessoal somando todos os cartões. Cada compra pertence a este ciclo ou ao próximo. Pagamentos não mudam o período consultado."
          className="mb-4"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-dark-text-muted">
              Limite pessoal (somando todos os cartões)
            </span>
            <CurrencyInput
              value={settings.personalSpendingLimit}
              onChange={(value) => setSettings({ ...settings, personalSpendingLimit: value })}
            />
          </label>
          <div className="flex flex-col justify-end">
            <div className="mb-1.5 flex items-end justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">
                Uso do limite
              </span>
              <strong
                className={`text-sm tabular-nums ${
                  summary.availablePersonalLimit >= 0 ? 'text-dark-text' : 'text-rose-400'
                }`}
              >
                {personalSpendPct.toFixed(0)}%
              </strong>
            </div>
            <Meter
              value={summary.currentPersonalTotal}
              max={settings.personalSpendingLimit}
              color={BUDGET_AREA_COLORS.investimentos}
              height={8}
            />
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          className="w-full sm:w-auto sm:min-w-80"
          value={view}
          onChange={setView}
          options={[
            { value: 'current' as View, label: 'Este ciclo' },
            { value: 'next' as View, label: 'Próximo ciclo' },
            { value: 'import' as View, label: 'Importar' },
          ]}
        />

        {view !== 'import' && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button type="button" disabled={accounts.length === 0} onClick={() => setShowCreditForm((value) => !value)} aria-expanded={showCreditForm} className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-2 text-xs font-medium text-dark-text-secondary transition-colors hover:border-primary-500/40 hover:text-dark-text">
              <HandCoins size={14} /> Abatimento avulso
            </button>
          </div>
        )}
        {view === 'next' && (
          <span className="flex items-center gap-1.5 text-xs text-dark-text-muted">
            <Zap size={13} />
            Parcelas e assinaturas são geradas automaticamente
          </span>
        )}
      </div>

      {view !== 'import' ? (
        <Panel padded={false} className="overflow-hidden">
          {showCreditForm && accounts.length > 0 && (
            <InvoiceCreditForm cycle={visibleCycle} cashCycleMonth={activeCycle.month} knownCards={knownCards} paidCards={visibleCycle === 'current' ? paidCards : []} onAdd={addSelectedEntry} onCancel={() => setShowCreditForm(false)} />
          )}
          <p className="border-b border-dark-border-subtle px-4 py-3 text-sm text-dark-text-secondary">{view === 'next' ? `Próximo ciclo · ${formatMonthLong(addMonths(activeCycle.month, 1))}` : `Este ciclo · ${formatMonthLong(activeCycle.month)}`}. Compras em cartões com a fatura deste ciclo paga entram no próximo ciclo.</p>
          <div className="flex flex-wrap items-center gap-2 border-b border-dark-border-subtle p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-dark-text-muted">
              <Filter size={13} />
              Filtrar
            </span>
            {[
              { key: 'all', label: 'Todos' },
              { key: 'mine', label: 'Meus' },
              { key: 'third-party', label: 'Não são meus' },
              ...(summary.unclassifiedPersonal > 0
                ? [{ key: 'unclassified', label: 'Sem área' }]
                : []),
              ...(entries.some((entry) => entry.isPrepaid) ? [{ key: 'prepaid', label: 'Antecipados' }] : []),
              ...knownOwners.map((owner) => ({ key: owner, label: owner })),
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOwnerFilter(item.key)}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  ownerFilter === item.key
                    ? 'border-primary-500/60 bg-primary-500/10 text-primary-200'
                    : 'border-transparent bg-dark-input text-dark-text-muted hover:bg-white/[0.06] hover:text-dark-text'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-text-muted"
              />
              <input
                data-card-search
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar lançamentos"
                className="w-40 rounded-lg border border-dark-border bg-dark-input py-1.5 pl-8 pr-7 text-xs text-dark-text outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-dark-text-muted transition-colors hover:text-dark-text"
                  title="Limpar busca"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {anticipatingEntry && anticipateMax > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
              <FastForward size={15} className="shrink-0 text-amber-300" />
              <div className="text-sm text-dark-text">
                Antecipar parcelas de <strong>{anticipatingEntry.description}</strong>
                <span className="text-dark-text-muted">
                  {' '}
                  ({anticipatingEntry.installmentCurrent}/{anticipatingEntry.installmentTotal} ·{' '}
                  {anticipateMax} restante{anticipateMax > 1 ? 's' : ''})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={anticipateMax}
                  value={anticipateCount}
                  onChange={(event) =>
                    setAnticipateCount(
                      Math.min(anticipateMax, Math.max(1, Number(event.target.value) || 1)),
                    )
                  }
                  aria-label="Quantidade de parcelas"
                  className="w-16 rounded-md border border-dark-border bg-dark-input px-2 py-1.5 text-center text-sm text-dark-text outline-none transition-all focus:border-amber-400"
                />
                <span className="text-xs text-dark-text-muted">
                  parcela{anticipateCount > 1 ? 's' : ''} ·{' '}
                  {formatCurrency(anticipateCount * anticipatingEntry.amount)}
                </span>
                {anticipateMax > 1 && (
                  <button
                    type="button"
                    onClick={() => setAnticipateCount(anticipateMax)}
                    aria-pressed={anticipateCount === anticipateMax}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      anticipateCount === anticipateMax
                        ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
                        : 'border-dark-border bg-dark-surface/70 text-dark-text-muted hover:border-amber-400/30 hover:text-amber-200'
                    }`}
                  >
                    Todas ({anticipateMax})
                  </button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <SecondaryButton onClick={handleAnticipate}>
                  {anticipateCount === anticipateMax && anticipateMax > 1
                    ? 'Antecipar todas'
                    : 'Antecipar'}
                </SecondaryButton>
                <button
                  type="button"
                  onClick={() => setAnticipateId(null)}
                  className="rounded-lg px-3 py-1.5 text-sm text-dark-text-muted transition-colors hover:text-dark-text"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="md:hidden">
            {accounts.length > 0 && <CardEntryForm cycle={visibleCycle} knownCards={knownCards} paidCards={visibleCycle === 'current' ? paidCards : []} onAdd={addSelectedEntry} />}
            <div className="space-y-2 p-3">
              {visibleEntries.length === 0 && (
                <p className="app-inset px-4 py-6 text-center text-sm text-dark-text-secondary">
                  {search || ownerFilter !== 'all' ? 'Nenhum lançamento corresponde ao filtro.' : 'Nenhum lançamento nesta fatura. Adicione uma compra acima.'}
                </p>
              )}
              {visibleEntries.map((entry) => entry.paidAt ? <PaidCardEntry key={entry.id} entry={entry} /> : entry.entryType === 'invoiceCredit' ? (
                <div key={entry.id} className="app-inset flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary-300">Abatimento</span>
                    <strong className="mt-1 block text-sm text-dark-text">{entry.description}</strong>
                    <span className="text-xs text-dark-text-secondary">{entry.cardName} · {entry.purchaseDate}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="block text-sm tabular-nums text-primary-300">− {formatCurrency(entry.amount)}</strong>
                    <button type="button" onClick={() => handleDelete(entry)} aria-label={`Remover abatimento ${entry.description}`} className="app-icon-button ml-auto text-dark-text-muted hover:text-rose-300"><Trash2 size={16} /></button>
                  </div>
                </div>
              ) : (
                <details key={entry.id} className="app-inset group overflow-hidden open:border-dark-text-muted/40">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-3 marker:hidden">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="truncate text-sm font-semibold text-dark-text">{entry.description || 'Compra sem descrição'}</strong>
                      <span className="text-xs text-dark-text-secondary">
                        {entry.cardName} · {entry.purchaseDate}
                        {entry.installmentTotal ? ` · ${entry.installmentCurrent ?? 1}/${entry.installmentTotal}` : entry.isRecurring ? ' · assinatura' : ''}
                        {entry.isPrepaid ? ' · pago' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <strong className={`block text-sm tabular-nums ${entry.isPrepaid ? 'text-primary-300 line-through' : 'text-dark-text'}`}>{formatCurrency(entry.personalAmount)}</strong>
                      {entry.amount !== entry.personalAmount && <span className="text-xs tabular-nums text-dark-text-muted">fatura {formatCurrency(entry.amount)}</span>}
                    </span>
                    <Pencil size={14} className="shrink-0 text-dark-text-muted" />
                  </summary>
                  <div className="grid grid-cols-2 gap-3 border-t border-dark-border-subtle p-3">
                    <FormField label="Descrição" className="col-span-2">
                      <input value={entry.description} onChange={(event) => updateEntry(entry.id, { description: event.target.value })} className="app-field w-full px-3 py-2 text-sm" />
                    </FormField>
                    <FormField label="Data real">
                      <input value={entry.purchaseDate} onChange={(event) => updateEntry(entry.id, { purchaseDate: event.target.value })} className="app-field w-full px-3 py-2 text-sm" />
                    </FormField>
                    <FormField label="Cartão">
                      <select value={entry.accountId ?? ''} onChange={(event) => updateEntry(entry.id, { accountId: event.target.value })} className="app-field w-full px-3 py-2 text-sm">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
                    </FormField>
                    <div className="col-span-2">
                      <span className="app-form-label mb-1.5 block">Área do orçamento</span>
                      <div className="app-field px-2 py-1.5"><CardAreaCell value={entry.budgetArea} onChange={(area) => updateEntry(entry.id, { budgetArea: area })} /></div>
                    </div>
                    <FormField label="Valor da fatura"><CurrencyInput value={entry.amount} onChange={(amount) => updateEntry(entry.id, { amount })} /></FormField>
                    <FormField label="Minha parte"><CurrencyInput value={entry.personalAmount} onChange={(personalAmount) => updateEntry(entry.id, { personalAmount })} /></FormField>
                    <FormField label="Restante"><CurrencyInput value={entry.remainingAmount} onChange={(remainingAmount) => updateEntry(entry.id, { remainingAmount })} /></FormField>
                    <FormField label="Pessoa ou observação"><input value={entry.ownerName || entry.ownerNote || ''} onChange={(event) => updateEntry(entry.id, { ownerNote: event.target.value, ownerName: '' })} className="app-field w-full px-3 py-2 text-sm" /></FormField>
                    <div className="col-span-2 flex flex-wrap items-end gap-2 border-t border-dark-border-subtle pt-3">
                      <button type="button" onClick={() => updateEntry(entry.id, { isRecurring: !entry.isRecurring })} aria-pressed={Boolean(entry.isRecurring)} className="min-h-10 rounded-lg border border-dark-border px-3 text-xs text-dark-text-secondary">{entry.isRecurring ? 'Assinatura ativa' : 'Marcar assinatura'}</button>
                      {!entry.isRecurring && <span className="flex items-end gap-1">
                        <FormField label="Parcela"><input value={entry.installmentCurrent ?? ''} onChange={(event) => handleInstallmentChange(entry, 'current', event.target.value)} inputMode="numeric" className="app-field w-14 px-2 py-2 text-center text-sm" /></FormField>
                        <span className="pb-2 text-dark-text-muted">/</span>
                        <FormField label="Total"><input value={entry.installmentTotal ?? ''} onChange={(event) => handleInstallmentChange(entry, 'total', event.target.value)} inputMode="numeric" className="app-field w-14 px-2 py-2 text-center text-sm" /></FormField>
                      </span>}
                    </div>
                    <div className="col-span-2 flex flex-wrap gap-2 border-t border-dark-border-subtle pt-3">
                      <button type="button" onClick={() => updateEntry(entry.id, { isPrepaid: !entry.isPrepaid })} className="min-h-10 rounded-lg border border-dark-border px-3 text-xs font-medium text-dark-text-secondary"><HandCoins size={14} className="mr-1 inline" />{entry.isPrepaid ? 'Desfazer antecipação' : 'Marcar como pago'}</button>
                      {visibleCycle === 'current' && !entry.isRecurring && (entry.installmentCurrent ?? 0) > 0 && (entry.installmentCurrent ?? 0) < (entry.installmentTotal ?? 0) && <button type="button" onClick={() => { setAnticipateId(entry.id); setAnticipateCount(1) }} className="min-h-10 rounded-lg border border-dark-border px-3 text-xs text-dark-text-secondary"><FastForward size={14} className="mr-1 inline" />Antecipar parcelas</button>}
                      <button type="button" onClick={() => handleDelete(entry)} className="min-h-10 rounded-lg border border-rose-500/25 px-3 text-xs text-rose-300"><Trash2 size={14} className="mr-1 inline" />Remover</button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[960px]">
              <div
                className={`grid ${TABLE_COLS} gap-2 border-b border-dark-border bg-dark-surface/60 px-3 py-2 text-xs font-medium uppercase tracking-wider text-dark-text-muted`}
              >
                {renderSortHeader('description', 'Descrição')}
                <div className="text-center">Parc.</div>
                {renderSortHeader('purchaseDate', 'Data')}
                {renderSortHeader('cardName', 'Cartão')}
                <div>Área</div>
                {renderSortHeader('amount', 'Fatura', 'right')}
                <div className="pr-2 text-right">É meu</div>
                <div className="pr-2 text-right">Restante</div>
                <div>Obs / De</div>
                <div />
              </div>

              {accounts.length > 0 && <CardEntryForm
                cycle={visibleCycle}
                knownCards={knownCards}
                paidCards={visibleCycle === 'current' ? paidCards : []}
                onAdd={addSelectedEntry}
              />}

              <div className="divide-y divide-dark-border/40">
                {visibleEntries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-dark-text-muted">
                    {search || ownerFilter !== 'all'
                      ? 'Nenhum lançamento corresponde ao filtro.'
                      : 'Nenhum lançamento nesta fatura.'}
                  </div>
                ) : (
                  visibleEntries.map((entry) => entry.paidAt ? <PaidCardEntry key={entry.id} entry={entry} columns={TABLE_COLS} /> : entry.entryType === 'invoiceCredit' ? (
                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 bg-primary-500/[0.04] px-4 py-3 text-sm">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="rounded bg-primary-500/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-300">{entry.originCreditId ? 'Saldo transferido' : entry.creditSource === 'reward' ? 'Pontos / crédito' : 'Pago avulso'}</span>
                        <strong className="font-medium text-dark-text">{entry.description}</strong>
                        <span className="text-xs text-dark-text-muted">{entry.cardName} · {entry.purchaseDate}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <strong className="tabular-nums text-primary-300">− {formatCurrency(entry.amount)}</strong>
                        <button type="button" onClick={() => handleDelete(entry)} aria-label={`Remover abatimento ${entry.description}`} className="rounded-md p-1.5 text-dark-text-muted hover:bg-rose-500/15 hover:text-rose-400"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className={`group grid ${TABLE_COLS} items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.03] ${
                        entry.isPrepaid ? 'bg-primary-500/[0.04]' : ''
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {entry.autoGenerated && (
                          <span
                            title="Gerado automaticamente a partir da fatura atual"
                            className="shrink-0 text-dark-text-muted"
                          >
                            <Zap size={12} />
                          </span>
                        )}
                        {entry.isPrepaid && (
                          <span
                            title="Pago antecipadamente — fora do total da fatura"
                            className="shrink-0 rounded bg-primary-500/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-300"
                          >
                            Pago
                          </span>
                        )}
                        <input
                          value={entry.description}
                          onChange={(e) => updateEntry(entry.id, { description: e.target.value })}
                          aria-label="Descrição"
                          className={`${cellClass} font-medium`}
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        {entry.isRecurring ? (
                          <button
                            type="button"
                            onClick={() => updateEntry(entry.id, { isRecurring: false })}
                            title="Assinatura recorrente — repete todo mês. Clique para desmarcar."
                            className="inline-flex items-center gap-1 rounded bg-dark-input px-1.5 py-0.5 text-xs font-semibold text-dark-text-secondary transition-colors hover:text-dark-text"
                          >
                            <Repeat size={11} />
                            Assin.
                          </button>
                        ) : (
                          <>
                            <input
                              value={entry.installmentCurrent ?? ''}
                              onChange={(e) => handleInstallmentChange(entry, 'current', e.target.value)}
                              placeholder="-"
                              inputMode="numeric"
                              aria-label="Parcela atual"
                              className="w-7 rounded border border-transparent bg-transparent px-0.5 py-1 text-center text-xs tabular-nums outline-none transition-all focus:border-dark-border focus:bg-dark-input"
                            />
                            <span className="text-xs text-dark-text-muted/50">/</span>
                            <input
                              value={entry.installmentTotal ?? ''}
                              onChange={(e) => handleInstallmentChange(entry, 'total', e.target.value)}
                              placeholder="-"
                              inputMode="numeric"
                              aria-label="Total de parcelas"
                              className="w-7 rounded border border-transparent bg-transparent px-0.5 py-1 text-center text-xs tabular-nums outline-none transition-all focus:border-dark-border focus:bg-dark-input"
                            />
                            {!entry.installmentTotal && (
                              <button
                                type="button"
                                onClick={() => updateEntry(entry.id, { isRecurring: true })}
                                title="Marcar como assinatura recorrente"
                                className="text-dark-text-muted/40 opacity-100 transition-all hover:text-dark-text [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                              >
                                <Repeat size={12} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <input
                        value={entry.purchaseDate}
                        onChange={(e) => updateEntry(entry.id, { purchaseDate: e.target.value })}
                        aria-label="Data"
                        className={`${cellClass} !px-1 text-center`}
                      />
                      <select value={entry.accountId ?? ''} onChange={(event) => updateEntry(entry.id, { accountId: event.target.value })} aria-label="Cartão" className={`${cellClass} !px-1 text-center`}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
                      <CardAreaCell
                        value={entry.budgetArea}
                        onChange={(area) => updateEntry(entry.id, { budgetArea: area })}
                      />
                      <CurrencyInput
                        value={entry.amount}
                        onChange={(v) => updateEntry(entry.id, { amount: v })}
                        className={`${moneyCellClass} ${entry.isPrepaid ? '!text-primary-400 line-through' : ''}`}
                      />
                      <CurrencyInput
                        value={entry.personalAmount}
                        onChange={(v) => updateEntry(entry.id, { personalAmount: v })}
                        className={`${moneyCellClass} ${entry.isPrepaid ? '!text-primary-400 line-through' : ''}`}
                      />
                      <CurrencyInput
                        value={entry.remainingAmount}
                        onChange={(v) => updateEntry(entry.id, { remainingAmount: v })}
                        className={moneyCellClass}
                      />
                      <input
                        value={entry.ownerName || entry.ownerNote}
                        onChange={(e) =>
                          updateEntry(entry.id, { ownerNote: e.target.value, ownerName: '' })
                        }
                        aria-label="Pessoa ou observação"
                        className={`${cellClass} text-dark-text-secondary`}
                        placeholder="-"
                      />
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => updateEntry(entry.id, { isPrepaid: !entry.isPrepaid })}
                          className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                            entry.isPrepaid
                              ? 'bg-primary-500/15 text-primary-400 hover:bg-primary-500/25'
                              : 'text-dark-text-muted opacity-100 hover:bg-primary-500/15 hover:text-primary-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100'
                          }`}
                          title={
                            entry.isPrepaid
                              ? 'Pago antecipadamente — clique para devolver ao total da fatura'
                              : 'Já paguei antecipado (tira do total da fatura)'
                          }
                        >
                          <HandCoins size={15} />
                        </button>
                        {visibleCycle === 'current' &&
                          !entry.isRecurring &&
                          (entry.installmentCurrent ?? 0) > 0 &&
                          (entry.installmentCurrent ?? 0) < (entry.installmentTotal ?? 0) && (
                            <button
                              onClick={() => {
                                setAnticipateId(entry.id)
                                setAnticipateCount(1)
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-dark-text-muted opacity-100 transition-all hover:bg-amber-500/15 hover:text-amber-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                              title="Antecipar parcelas"
                            >
                              <FastForward size={15} />
                            </button>
                          )}
                        <button
                          onClick={() => handleDelete(entry)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-dark-text-muted opacity-100 transition-all hover:bg-rose-500/15 hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                          title="Remover"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-border-subtle px-4 py-3 text-xs text-dark-text-muted">
            <span>
              {filteredEntries.length} de{' '}
              {visibleCycle === 'current' ? summary.currentEntriesCount : summary.nextEntriesCount}{' '}
              lançamentos · total do filtro:{' '}
              <strong className="font-semibold tabular-nums text-dark-text">
                {formatCurrency(filteredTotals.amount)}
              </strong>{' '}
              · meu: {formatCurrency(filteredTotals.personal)} · não meu:{' '}
              {formatCurrency(filteredTotals.thirdParty)}
              {filteredEntries.some((entry) => entry.entryType === 'invoiceCredit') && ` · abatimentos: ${formatCurrency(filteredEntries.filter((entry) => entry.entryType === 'invoiceCredit').reduce((sum, entry) => sum + entry.amount, 0))}`}
            </span>
            {visibleCycle === 'current' && summary.currentPrepaidTotal > 0 && (
              <span className="flex items-center gap-1.5 text-primary-400">
                <HandCoins size={13} />
                {formatCurrency(summary.currentPrepaidTotal)} pagos antecipadamente, fora do total
              </span>
            )}
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
        <label className="app-form-label block max-w-sm">Importar para o cartão
          <select value={importAccount?.id ?? ''} onChange={(event) => setImportAccountId(event.target.value)} className="app-field mt-1.5 w-full px-3 py-2.5 text-sm">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <CardImportPanel
          key={importAccount?.id}
          account={importAccount}
          entries={entries}
          text={importText}
          onTextChange={setImportText}
          cycle={importCycle}
          onCycleChange={setImportCycle}
          replace={replaceOnImport}
          onReplaceChange={setReplaceOnImport}
          currentDueMonth={currentDueMonth}
          nextDueMonth={nextDueMonth}
          onImport={handleImport}
        />
        </div>
      )}

      {entryError && <p role="alert" className="text-xs text-rose-200">{entryError}</p>}
      <CardSummaryPanels
        summary={summary}
        accounting={cardCycleAccounting}
        activeMonth={activeCycle.month}
        budgetComparison={budgetComparison}
        plannedOnCard={plannedOnCard}
      />

      {accounts.length > 0 && <CardAccountsPanel />}

      {pendingUndo && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-dark-border bg-dark-surface/95 px-4 py-3 shadow-2xl backdrop-blur">
          <Trash2 size={15} className="shrink-0 text-rose-400" />
          <span className="text-sm text-dark-text">
            <strong className="font-semibold">{pendingUndo.description}</strong> removido
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
          >
            <Undo2 size={15} />
            Desfazer
          </button>
          <button
            type="button"
            onClick={() => setPendingUndo(null)}
            className="text-dark-text-muted transition-colors hover:text-dark-text"
            title="Dispensar"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
