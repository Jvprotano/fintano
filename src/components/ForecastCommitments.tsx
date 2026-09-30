import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'
import { PrimaryButton, SecondaryButton } from './ui'
import { useFinancasStore } from '../context/financasStore'
import { cardDueMonthForOccurrence, upcomingOccurrences } from '../lib/forecastCoverage'
import { formatCurrency, formatMonthKey, inputClass } from '../lib/format'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import type { BudgetArea, CreditCardAccount, CreditCardEntry, ExpectedEvent } from '../types'
import { addMonths } from '../lib/shared'
import { inferDueMonthFromPaymentDate } from '../lib/creditCards'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function OccurrenceAdjustment({ item, onSave, onCancel }: {
  item: ReconciledOccurrence
  onSave: (date: string, month: string, amount: number) => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(item.date ?? '')
  const [month, setMonth] = useState(item.month)
  const [amount, setAmount] = useState(item.amount)
  if (item.status === 'settled' || item.status === 'scheduled') return null
  return <div className="mt-1">
    <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs text-primary-400 hover:text-primary-300">
      {open ? 'Fechar ajuste' : 'Alterar esta data ou valor'}
    </button>
    {open && <div className="mt-2 grid gap-2 rounded-lg border border-dark-border bg-dark-card p-3 sm:grid-cols-3">
      <label><span className="app-form-label mb-1 block">Mês</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setDate('') }} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Dia (opcional)</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (event.target.value) setMonth(event.target.value.slice(0, 7)) }} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Valor</span><CurrencyInput value={amount} onChange={setAmount} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <PrimaryButton disabled={!month || amount <= 0} onClick={() => { onSave(date, month, amount); setOpen(false) }}>Salvar</PrimaryButton>
        <SecondaryButton tone="danger" onClick={onCancel}>Cancelar ocorrência</SecondaryButton>
      </div>
    </div>}
  </div>
}

function CardOccurrenceAction({ item, accounts, currentDueMonth, onAdd }: {
  item: ReconciledOccurrence
  accounts: CreditCardAccount[]
  currentDueMonth: string
  onAdd: (entry: Omit<CreditCardEntry, 'id'>) => void
}) {
  const dueMonth = cardDueMonthForOccurrence(item)
  const cycle = dueMonth === currentDueMonth ? 'current' as const :
    dueMonth === addMonths(currentDueMonth, 1) ? 'next' as const : null
  const [cardName, setCardName] = useState(accounts[0]?.name ?? '')
  const [budgetArea, setBudgetArea] = useState<BudgetArea>('desejos')
  const [purchaseDate, setPurchaseDate] = useState(todayKey)
  if (item.event.cashTreatment !== 'card' || item.status === 'scheduled' || item.status === 'settled' || !cycle || accounts.length === 0) return null
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-primary-400 marker:text-dark-text-muted">Cobrança apareceu no cartão? Registrar</summary>
    <div className="mt-2 grid gap-2 rounded-lg border border-dark-border bg-dark-card p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label><span className="app-form-label mb-1 block">Cartão</span><select value={cardName} onChange={(event) => setCardName(event.target.value)} className={inputClass}>
        {accounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
      </select></label>
      <label><span className="app-form-label mb-1 block">Data real</span><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Área</span><select value={budgetArea} onChange={(event) => setBudgetArea(event.target.value as BudgetArea)} className={inputClass}>
        <option value="desejos">Desejos</option><option value="necessidades">Necessidades</option><option value="investimentos">Investimentos</option>
      </select></label>
      <SecondaryButton disabled={!cardName || !purchaseDate} onClick={() => onAdd({
        cycle, description: item.event.name, purchaseDate: purchaseDate.split('-').reverse().join('/'),
        cardName, amount: item.remainingAmount, personalAmount: item.remainingAmount,
        remainingAmount: 0, budgetArea, sourceForecastOccurrenceId: item.id,
      })}>Lançar no cartão</SecondaryButton>
    </div>
  </details>
}

function OccurrenceRealization({ item }: { item: ReconciledOccurrence }) {
  const { forecast, actuals } = useFinancasStore()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(item.remainingAmount)
  const [date, setDate] = useState(todayKey)
  const [cycle, setCycle] = useState(forecast.currentMonth)
  const planned = item.event.cashTreatment === 'planned' && item.event.kind === 'expense'
  if (item.event.cashTreatment === 'card') return null

  const field = item.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const linked = actuals.months.flatMap((month) => month[field]
    .filter((entry) => entry.sourceOccurrenceId === item.id ||
      (!entry.sourceOccurrenceId && entry.sourceEventId === item.event.id && month.month === item.originalMonth))
    .map((entry) => ({ ...entry, cycle: month.month })))
  const marked = item.event.occurrenceOverrides?.[item.originalMonth]?.realizedAmount ?? 0
  const save = () => {
    if (amount <= 0 || !date || (!planned && !cycle)) return
    if (planned) {
      forecast.updateOccurrence(item.event.id, item.originalMonth, {
        realizedAmount: marked + amount, realizedAt: date,
      })
    } else {
      const add = item.event.kind === 'income' ? actuals.addExtraIncome : actuals.addExtraExpense
      add(item.event.name, amount, item.event.id, cycle, item.id, date)
    }
    setOpen(false)
  }

  return <div className="mt-2 text-xs">
    {planned && marked > 0 && <p className="text-dark-text-muted">
      Marcado como efetivado em {item.event.occurrenceOverrides?.[item.originalMonth]?.realizedAt?.split('-').reverse().join('/') ?? 'data não informada'}.
      {' '}<button type="button" className="text-primary-400 hover:text-primary-300" onClick={() => forecast.updateOccurrence(item.event.id, item.originalMonth, { realizedAmount: undefined, realizedAt: undefined })}>Desfazer</button>
    </p>}
    {!planned && linked.map((entry) => <p key={entry.id} className="mt-1 flex flex-wrap items-center gap-1 text-dark-text-muted">
      <span>{formatCurrency(entry.amount)} {item.event.kind === 'income' ? 'recebido' : 'pago'} · ciclo {formatMonthKey(entry.cycle)}{entry.occurredAt && ` · ${entry.occurredAt.split('-').reverse().join('/')}`}</span>
      <button type="button" className="text-primary-400 hover:text-primary-300" onClick={() => {
        if (item.event.kind === 'income') actuals.removeExtraIncome(entry.id, entry.cycle)
        else actuals.removeExtraExpense(entry.id, entry.cycle)
      }}>Desfazer lançamento</button>
    </p>)}
    {item.remainingAmount > 0.005 && <>
      <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1 text-primary-400 hover:text-primary-300">
        {open ? 'Fechar registro' : item.event.kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento'}
      </button>
      {open && <div className="mt-2 grid gap-2 rounded-lg border border-dark-border bg-dark-card p-3 sm:grid-cols-3 sm:items-end">
        <label><span className="app-form-label mb-1 block">Valor {item.event.kind === 'income' ? 'recebido' : 'pago'}</span><CurrencyInput value={amount} onChange={setAmount} /></label>
        <label><span className="app-form-label mb-1 block">Data real</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
        {!planned && <label><span className="app-form-label mb-1 block">Ciclo</span><input type="month" value={cycle} onChange={(event) => setCycle(event.target.value)} className={inputClass} /></label>}
        {planned && <p className="text-dark-text-muted sm:self-center">Já incluído no plano. Este registro acompanha a previsão sem criar outra saída de caixa.</p>}
        <PrimaryButton disabled={amount <= 0 || !date || (!planned && !cycle)} onClick={save}>Marcar como {item.event.kind === 'income' ? 'recebido' : 'pago'}</PrimaryButton>
      </div>}
    </>}
  </div>
}

/** As ocorrências pertencem ao evento; não formam uma segunda lista concorrente. */
export function ForecastEventOccurrences({ event }: { event: ExpectedEvent }) {
  const { forecast, actuals, cards } = useFinancasStore()
  const today = todayKey()
  const startMonth = event.month < addMonths(forecast.currentMonth, -12)
    ? addMonths(forecast.currentMonth, -12) : event.month
  const occurrences = upcomingOccurrences([event], actuals.months, startMonth, 48, today,
    cards.entries, cards.paidInvoices).filter((item) => item.status !== 'settled' || item.month >= forecast.currentMonth).slice(0, 6)

  return <div className="mt-3 border-t border-dark-border-subtle pt-3">
    <p className="text-xs font-medium text-dark-text-secondary">Próximas ocorrências</p>
    {occurrences.length === 0 ? <p className="mt-2 text-xs text-dark-text-muted">Nenhuma ocorrência pendente neste período.</p> :
      <ul className="mt-2 space-y-2">
        {occurrences.map((item) => <li key={item.id} className="rounded-lg border border-dark-border-subtle bg-dark-card/70 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-dark-text-secondary">{item.date ? item.date.split('-').reverse().join('/') : formatMonthKey(item.month)}
              {item.event.cashTreatment === 'card' && ` · fatura ${formatMonthKey(cardDueMonthForOccurrence(item) ?? item.month)}`}
              {item.status === 'settled' ? ' · realizado' : item.status === 'scheduled' ? ' · no cartão' : item.status === 'partial' ? ' · parcial' : item.status === 'overdue' ? ' · vencido' : ''}
            </span>
            <strong className="tabular-nums text-dark-text">{formatCurrency(item.status === 'settled' ? item.paidAmount : item.remainingAmount)} {item.status === 'settled' ? 'realizado' : 'restante'}</strong>
          </div>
          <OccurrenceAdjustment key={`${item.id}:${item.month}:${item.amount}`} item={item}
            onSave={(date, month, amount) => forecast.updateOccurrence(event.id, item.originalMonth, { date: date || undefined, month, amount })}
            onCancel={() => forecast.updateOccurrence(event.id, item.originalMonth, { cancelled: true })} />
          <CardOccurrenceAction item={item} accounts={cards.accounts}
            currentDueMonth={cards.settings.currentDueMonth ?? inferDueMonthFromPaymentDate(cards.settings.paymentDate)} onAdd={cards.addEntry} />
          <OccurrenceRealization key={`${item.id}:${item.remainingAmount}`} item={item} />
        </li>)}
      </ul>}
  </div>
}
