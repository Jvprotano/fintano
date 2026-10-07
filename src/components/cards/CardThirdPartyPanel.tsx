import { useState } from 'react'
import { useFinancasStore } from '../../context/financasStore'
import { recordReimbursement, removeReimbursement } from '../../data/cardThirdParties'
import { formatCurrency, formatMonthLong, inputClass } from '../../lib/format'
import { localDateKey } from '../../lib/shared'
import type { CardThirdParty, CreditCardEntry } from '../../types'
import { CurrencyInput } from '../CurrencyInput'
import { FormField, Panel, PrimaryButton, SecondaryButton } from '../ui'

function ThirdPartyRow({ entry, record, month }: { entry?: CreditCardEntry; record: CardThirdParty; month: string }) {
  const [amount, setAmount] = useState(0)
  const [cycleMonth, setCycleMonth] = useState(month)
  const [date, setDate] = useState(localDateKey)
  const [error, setError] = useState('')
  const received = record.payments.reduce((sum, row) => sum + row.amount, 0)
  const share = record.amount
  const outstanding = record?.fundedBy === 'user' ? Math.max(0, share - received) : 0
  return <details className="rounded-lg border border-dark-border-subtle bg-dark-surface p-3">
    <summary className="cursor-pointer text-sm text-dark-text">
      {record?.ownerName || entry?.ownerName || 'Terceiro'} · {record?.description || entry?.description} · {formatMonthLong(record?.dueMonth ?? entry!.dueMonth!)}{entry?.installmentTotal ? ` · ${entry.installmentCurrent}/${entry.installmentTotal}` : ''}
      <span className="ml-3 text-xs text-dark-text-muted">{record.fundedBy === 'user' ? `${formatCurrency(outstanding)} a receber` : 'Registro anterior: pagamento direto ao banco'}</span>
    </summary>
    <p className="mt-2 text-xs text-dark-text-muted">Parte de terceiros: {formatCurrency(share)} · fatura {formatMonthLong(record?.dueMonth ?? entry!.dueMonth!)}{entry ? ` · compra ${formatCurrency(entry.amount)} · minha parte ${formatCurrency(entry.personalAmount)}` : ' · compra removida; pagamento e recebimentos preservados'}</p>
    {record?.fundedBy === 'user' && <>
      <p className="mt-3 text-xs text-dark-text-secondary">Recebido: {formatCurrency(received)} · restante: {formatCurrency(outstanding)}</p>
      {outstanding > 0.005 && <form className="mt-3 flex items-end gap-3" onSubmit={(e) => {
        e.preventDefault()
        const result = recordReimbursement(record.id, amount, cycleMonth, date)
        if (!result.ok) { setError(result.message); return }
        setAmount(0); setError('')
      }}>
        <FormField label="Valor recebido"><CurrencyInput value={amount} onChange={setAmount} /></FormField>
        <FormField label="Ciclo recebido"><input className={inputClass} type="month" value={cycleMonth} onChange={(e) => setCycleMonth(e.target.value)} /></FormField>
        <FormField label="Data real"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
        <PrimaryButton type="submit" disabled={amount <= 0}>Registrar recebimento</PrimaryButton>
      </form>}
      {record.payments.length > 0 && <details className="mt-3 text-xs text-dark-text-muted"><summary className="cursor-pointer">Recebimentos registrados</summary>{record.payments.map((row) => <div key={row.id} className="mt-2 flex items-center justify-between gap-3">
        <span>{formatCurrency(row.amount)} · {row.occurredOn} · ciclo {formatMonthLong(row.cycleMonth)}</span>
        <SecondaryButton onClick={() => { const result = removeReimbursement(record.id, row.id); setError(result.ok ? '' : result.message) }}>Desfazer</SecondaryButton>
      </div>)}</details>}
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
  </details>
}

export function CardThirdPartyPanel({ history = false }: { history?: boolean }) {
  const { cards, thirdParties, activeCycle } = useFinancasStore()
  const paidEntries = cards.paidInvoices.flatMap((invoice) => (invoice.entries ?? []).map((entry) => ({ ...entry, dueMonth: entry.dueMonth ?? invoice.dueMonth })))
  const all = [...cards.entries, ...paidEntries]
  const open = thirdParties.records.filter((row) => row.fundedBy === 'user' && row.amount - row.payments.reduce((sum, row) => sum + row.amount, 0) > 0.005)
  const completed = thirdParties.records.filter((row) => !open.some((other) => other.id === row.id) &&
    (history ? row.cashMonth < activeCycle.month : row.cashMonth === activeCycle.month || row.payments.some((payment) => payment.cycleMonth === activeCycle.month)))
  if (!completed.length && (history || !open.length)) return null
  return <Panel><details>
    <summary className="cursor-pointer text-sm font-semibold text-dark-text">{history ? 'Recebimentos de terceiros anteriores' : `Terceiros · ${formatCurrency(thirdParties.outstanding)} a receber`}</summary>
    <p className="mt-2 text-xs text-dark-text-muted">Você paga a fatura inteira. Registre aqui o que terceiros te pagam; o recebimento recompõe o caixa sem virar renda nova.</p>
    <div className="mt-3 space-y-2">
      {!history && open.map((record) => <ThirdPartyRow key={`${record.id}:${activeCycle.month}`} record={record} entry={all.find((row) => row.id === record.entryId)} month={activeCycle.month} />)}
    </div>
    {completed.length > 0 && <details className="mt-3 text-xs text-dark-text-muted"><summary className="cursor-pointer">Sem pendência ({completed.length})</summary><div className="mt-2 space-y-2">{completed.map((record) => <ThirdPartyRow key={`${record.id}:${activeCycle.month}`} record={record} entry={all.find((row) => row.id === record.entryId)} month={activeCycle.month} />)}</div></details>}
  </details></Panel>
}
