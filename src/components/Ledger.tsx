import { useState } from 'react'
import { ArrowDownUp, CalendarDays, Minus, Plus, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { formatCurrency, formatDate, formatMonthKey } from '../lib/format'
import { ledgerEntryCycleMonth } from '../lib/shared'
import type { LedgerEntry } from '../types'

// Reserva, posições e metas compartilham o mesmo livro-razão: um formulário de
// entrada/saída e uma lista de movimentações.

function CycleMonthControl({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  compact?: boolean
}) {
  return (
    <label
      className={`group inline-flex items-center border transition-colors focus-within:border-primary-500/45 focus-within:bg-primary-500/[0.08] ${
        compact
          ? 'gap-1.5 rounded-lg border-dark-border/75 bg-dark-surface/75 px-2 py-1'
          : 'gap-2 rounded-xl border-primary-500/20 bg-primary-500/[0.055] px-3 py-2'
      }`}
    >
      <CalendarDays
        size={compact ? 12 : 14}
        className="shrink-0 text-primary-400/80"
      />
      <span className="sr-only">{label}</span>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={`min-w-0 border-0 bg-transparent p-0 font-semibold text-dark-text outline-none ${
          compact ? 'w-[118px] text-xs' : 'w-[138px] text-xs'
        }`}
      />
    </label>
  )
}

export function LedgerMoveForm({
  onMove,
  outLabel = 'Retirar',
  inLabel = 'Aportar',
  disableOut = false,
  notePlaceholder = 'Nota (opcional)',
  invert = false,
  cycleMonth,
}: {
  onMove: (amount: number, note?: string, cycleMonth?: string) => void
  outLabel?: string
  inLabel?: string
  disableOut?: boolean
  notePlaceholder?: string
  /** Quando informado, o lançamento é controlado pela competência do ciclo. */
  cycleMonth?: string
  /**
   * Troca o sinal dos botões. Numa dívida a ação boa é *reduzir* o saldo, então
   * o botão principal precisa emitir valor negativo — o contrário de um aporte.
   */
  invert?: boolean
}) {
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [cycleSelection, setCycleSelection] = useState(() => ({
    source: cycleMonth ?? '',
    selected: cycleMonth ?? '',
  }))
  const selectedCycleMonth =
    cycleSelection.source === (cycleMonth ?? '')
      ? cycleSelection.selected
      : (cycleMonth ?? '')

  const commit = (button: 'primary' | 'secondary') => {
    if (amount <= 0) return
    const positive = invert ? button === 'secondary' : button === 'primary'
    onMove((positive ? 1 : -1) * amount, note, selectedCycleMonth || cycleMonth)
    setAmount(0)
    setNote('')
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        commit('primary')
      }}
      className="rounded-2xl border border-dark-border/80 bg-dark-input/30 p-3 shadow-inner shadow-black/10 sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dark-border bg-dark-surface text-dark-text-muted">
            <ArrowDownUp size={14} />
          </span>
          <div>
            <strong className="block text-sm font-semibold text-dark-text">Nova movimentação</strong>
            <span className="mt-0.5 block text-xs leading-relaxed text-dark-text-muted">
              Informe o valor e escolha entre entrada ou saída.
            </span>
          </div>
        </div>
        {cycleMonth && (
          <div className="sm:text-right">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-dark-text-muted">
              Competência
            </span>
            <CycleMonthControl
              value={selectedCycleMonth || cycleMonth}
              onChange={(selected) =>
                setCycleSelection({ source: cycleMonth, selected })
              }
              label="Ciclo da movimentação"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:flex-1">
          <CurrencyInput value={amount} onChange={setAmount} className="!py-2.5" />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={amount <= 0}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary-500/20 bg-primary-500/12 px-3.5 py-2.5 text-sm font-semibold text-primary-300 transition-colors hover:bg-primary-500/20 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
          >
            <Plus size={14} />
            {inLabel}
          </button>
          <button
            type="button"
            onClick={() => commit('secondary')}
            disabled={amount <= 0 || disableOut}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/15 bg-rose-500/[0.07] px-3.5 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/14 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
          >
            <Minus size={14} />
            {outLabel}
          </button>
        </div>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={notePlaceholder}
        className="app-field mt-2 w-full px-3 py-2 text-sm placeholder:text-dark-text-muted"
      />
      {cycleMonth && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary-500/10 bg-primary-500/[0.035] px-2.5 py-2 text-xs leading-relaxed text-dark-text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
          <span>
            Será contabilizado em <strong className="font-semibold text-primary-200">{formatMonthKey(selectedCycleMonth || cycleMonth)}</strong>.
            {' '}A data real fica preservada no registro.
          </span>
        </div>
      )}
    </form>
  )
}

export function LedgerList({
  transactions,
  onRemove,
  inLabel = 'Aporte',
  outLabel = 'Retirada',
  invert = false,
  onCycleMonthChange,
}: {
  transactions: LedgerEntry[]
  onRemove: (id: string) => void
  inLabel?: string
  outLabel?: string
  /** Habilita a correção de competência, inclusive para dados antigos. */
  onCycleMonthChange?: (id: string, cycleMonth: string) => void
  /** Numa dívida, quem merece a cor de bom é a saída (a amortização). */
  invert?: boolean
}) {
  if (transactions.length === 0) return null
  const history = [...transactions].reverse()

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-dark-text">Histórico de movimentações</span>
          {onCycleMonthChange && (
            <p className="mt-0.5 text-xs leading-relaxed text-dark-text-muted">
              Alterar a competência ou remover um registro recalcula os ciclos fechados.
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-dark-border bg-dark-input px-2 py-0.5 text-xs tabular-nums text-dark-text-muted">
          {transactions.length} {transactions.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {history.map((tx) => {
          const isDeposit = tx.amount >= 0
          const isGood = invert ? !isDeposit : isDeposit
          return (
            <li
              key={tx.id}
              className="group flex items-center gap-2.5 rounded-xl border border-dark-border-subtle bg-dark-input/35 px-3 py-2.5 transition-colors hover:border-dark-border hover:bg-dark-input/55"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                isGood
                  ? 'border-primary-500/15 bg-primary-500/[0.07] text-primary-400'
                  : 'border-rose-500/15 bg-rose-500/[0.07] text-rose-400'
              }`}>
                {isDeposit ? <Plus size={13} /> : <Minus size={13} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-dark-text">
                  {tx.note || (isDeposit ? inLabel : outLabel)}
                </p>
                {onCycleMonthChange ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dark-text-muted">
                    <span>Feito em {formatDate(tx.date)}</span>
                    <CycleMonthControl
                      compact
                      value={ledgerEntryCycleMonth(tx)}
                      onChange={(selected) => onCycleMonthChange(tx.id, selected)}
                      label={`Ciclo de ${tx.note || (isDeposit ? inLabel : outLabel)}`}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-dark-text-muted">{formatDate(tx.date)}</p>
                )}
              </div>
              <span
                className={`shrink-0 text-xs font-semibold tabular-nums ${
                  isGood ? 'text-primary-400' : 'text-rose-400'
                }`}
              >
                {isDeposit ? '+' : '−'} {formatCurrency(Math.abs(tx.amount))}
              </span>
              <button
                type="button"
                onClick={() => onRemove(tx.id)}
                className="rounded-lg p-1.5 text-dark-text-muted opacity-100 transition-all hover:bg-rose-500/[0.08] hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                title="Remover movimentação"
              >
                <Trash2 size={13} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
