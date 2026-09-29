import { useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { PrimaryButton, SecondaryButton } from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import type { ExtraIncomeEntry } from '../types'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import { monthKey } from '../lib/shared'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function ExpectedRow({ occurrence, income, currentMonth, onAdd }: {
  occurrence: ReconciledOccurrence
  income: boolean
  currentMonth: string
  onAdd: (name: string, amount: number, sourceEventId?: string, targetMonth?: string, sourceOccurrenceId?: string, occurredAt?: string) => void
}) {
  const [amount, setAmount] = useState(occurrence.remainingAmount)
  const [date, setDate] = useState(todayKey)
  const [cycle, setCycle] = useState(currentMonth)
  const label = income ? 'recebida' : 'paga'
  return (
    <li className="rounded-lg border border-dark-border-subtle bg-dark-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-dark-text">{occurrence.event.name}</span>
        <span className="tabular-nums text-dark-text-secondary">
          previsto {formatCurrency(occurrence.amount)} · restante {formatCurrency(occurrence.remainingAmount)}
        </span>
      </div>
      <p className="mt-1 text-xs text-dark-text-muted">
        {occurrence.date ? `Vencimento ${occurrence.date.split('-').reverse().join('/')}` : `Previsto para ${occurrence.month}`}
        {occurrence.paidAmount > 0 && ` · já registrado ${formatCurrency(occurrence.paidAmount)}`}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:items-end">
        <label className="block min-w-0">
          <span className="app-form-label mb-1 block">Valor {income ? 'recebido' : 'pago'}</span>
          <CurrencyInput value={amount} onChange={setAmount} />
        </label>
        <label className="block min-w-0">
          <span className="app-form-label mb-1 block">Data real</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </label>
        <label className="block min-w-0">
          <span className="app-form-label mb-1 block">Ciclo</span>
          <input type="month" value={cycle} onChange={(event) => setCycle(event.target.value)} className={inputClass} />
        </label>
        <SecondaryButton className="sm:w-full" disabled={amount <= 0 || !date || !cycle} onClick={() => {
          onAdd(occurrence.event.name, amount, occurrence.event.id, cycle, occurrence.id, date)
          setAmount(Math.max(0, occurrence.remainingAmount - amount))
        }}>Marcar como {label}</SecondaryButton>
      </div>
    </li>
  )
}

function EntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: ExtraIncomeEntry
  onUpdate: (id: string, amount: number) => void
  onRemove: (id: string) => void
}) {
  const [amount, setAmount] = useState(entry.amount)

  const commit = () => {
    if (amount > 0) onUpdate(entry.id, amount)
    else setAmount(entry.amount)
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-dark-card px-3 py-2">
      <span className="w-full min-w-0 text-sm font-medium text-dark-text sm:flex-1">
        <span className="block truncate">{entry.name}</span>
        {entry.sourceEventId && (
          <span className="mt-0.5 block text-xs font-normal text-dark-text-muted">
            previsto em Futuro
          </span>
        )}
        {entry.occurredAt && <span className="mt-0.5 block text-xs text-dark-text-muted">{entry.occurredAt.split('-').reverse().join('/')}</span>}
      </span>
      <div className="ml-auto w-32 shrink-0">
        <CurrencyInput value={amount} onChange={setAmount} onBlur={commit} className="!py-1.5" />
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="shrink-0 rounded-md p-1.5 text-dark-text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-400"
        aria-label={`Remover ${entry.name}`}
      >
        <Trash2 size={13} />
      </button>
    </li>
  )
}

export function ActualCashEntries({
  title,
  description,
  icon,
  tone,
  entries,
  expected,
  currentMonth = monthKey(),
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string
  description: string
  icon: ReactNode
  tone: 'income' | 'expense'
  entries: ExtraIncomeEntry[]
  expected: ReconciledOccurrence[]
  currentMonth?: string
  onAdd: (name: string, amount: number, sourceEventId?: string, targetMonth?: string, sourceOccurrenceId?: string, occurredAt?: string) => void
  onUpdate: (id: string, amount: number) => void
  onRemove: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayKey)
  const [cycle, setCycle] = useState(currentMonth)
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const income = tone === 'income'

  const add = () => {
    if (!name.trim() || amount <= 0) return
    onAdd(name, amount, undefined, cycle, undefined, date)
    setName('')
    setAmount(0)
  }

  return (
    <section
      className={`rounded-xl border p-4 ${
        income
          ? 'border-primary-500/20 bg-primary-500/[0.04]'
          : 'border-dark-border bg-dark-surface/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-dark-text">
            <span className={income ? 'text-primary-300' : 'text-dark-text-secondary'}>{icon}</span>
            {title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">{description}</p>
        </div>
        <strong
          className={`text-lg font-semibold tabular-nums ${
            income ? 'text-primary-300' : 'text-dark-text'
          }`}
        >
          {formatCurrency(total)}
        </strong>
      </div>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </ul>
      )}

      {expected.length > 0 && (
        <div className="mt-3 rounded-lg border border-dark-border-subtle bg-dark-surface/50 p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">
            Previsto em Futuro
          </span>
          <ul className="mt-2 space-y-1.5">
            {expected.map((occurrence) => <ExpectedRow key={occurrence.id} occurrence={occurrence} income={income} currentMonth={currentMonth} onAdd={onAdd} />)}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:items-end">
        <label className="block min-w-0 sm:col-span-2">
          <span className="app-form-label mb-1.5 block">Descrição</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
            placeholder={income ? 'Ex.: banco de horas' : 'Ex.: IPVA'}
            className={inputClass}
          />
        </label>
        <label className="block min-w-0">
          <span className="app-form-label mb-1.5 block">Valor {income ? 'recebido' : 'pago'}</span>
          <CurrencyInput value={amount} onChange={setAmount} />
        </label>
        <label className="block min-w-0"><span className="app-form-label mb-1.5 block">Data real</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
        <label className="block min-w-0"><span className="app-form-label mb-1.5 block">Ciclo</span><input type="month" value={cycle} onChange={(event) => setCycle(event.target.value)} className={inputClass} /></label>
        <PrimaryButton className="sm:w-full" onClick={add} disabled={!name.trim() || amount <= 0 || !date || !cycle}>
          <Plus size={14} />
          Adicionar
        </PrimaryButton>
      </div>
    </section>
  )
}
