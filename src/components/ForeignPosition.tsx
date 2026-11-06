import { useState } from 'react'
import type { FinancialHolding } from '../lib/investments'
import { useInvestmentsStore, useFinancasStore } from '../context/financasStore'
import { recordMovement } from '../data/financialMovement'
import { repositoryRevision } from '../data/repositoryCommand'
import { localDateKey } from '../lib/shared'
import { formatCurrency, inputClass } from '../lib/format'
import { CurrencyInput } from './CurrencyInput'
import { FormField, PrimaryButton, SecondaryButton } from './ui'

export function ForeignPositionSettings({ holding }: { holding: FinancialHolding }) {
  const { exchange, updateHolding } = useInvestmentsStore()
  const [editing, setEditing] = useState(false)
  const [currency, setCurrency] = useState<'EUR' | 'USD'>(holding.fx?.currency ?? 'EUR')
  const [balance, setBalance] = useState(holding.fx?.balance ?? 0)
  const [rate, setRate] = useState('')
  const [date, setDate] = useState(localDateKey)
  const [revision, setRevision] = useState<string | null>(null)
  const [error, setError] = useState('')
  const reference = exchange.settings.currencies[currency].reference
  return <div className="col-span-full rounded-xl border border-dark-border p-3">
    {!editing ? <div className="flex items-center justify-between gap-3"><p className="text-xs text-dark-text-secondary">{holding.fx ? `Saldo real: ${formatCurrency(holding.fx.balance, holding.fx.currency)} · avaliação em reais sem custos de compra` : 'Esta posição guarda euro ou dólar? Informe a moeda e o saldo exato do extrato.'}</p><SecondaryButton onClick={() => {
      setBalance(holding.fx?.balance ?? 0); setDate(localDateKey()); setRevision(repositoryRevision()); setEditing(true); setError('')
    }}>{holding.fx ? 'Conferir saldo em moeda' : 'Cadastrar saldo em moeda'}</SecondaryButton></div> : <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault()
      const valuationRate = reference?.rate ?? (Number(rate.replace(',', '.')) || holding.fx?.rate)
      if (!valuationRate || !Number.isFinite(valuationRate) || valuationRate <= 0 || !date || date > localDateKey() || holding.transactions.some((tx) => tx.date.slice(0, 10) > date)) { setError('Informe a referência de câmbio e uma data que inclua todos os movimentos, até hoje.'); return }
      if (!updateHolding(holding.id, { fx: { currency, balance, rate: valuationRate }, valuationDate: date }, revision)) { setError('Não foi possível salvar. Os dados podem ter mudado; cancele e reabra para conferir.'); return }
      setEditing(false)
    }} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }}>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Moeda da posição"><select disabled={!!holding.fx} value={currency} onChange={(event) => setCurrency(event.target.value as 'EUR' | 'USD')} className={inputClass}><option value="EUR">Euro · EUR</option><option value="USD">Dólar · USD</option></select></FormField>
        <FormField label="Saldo exato do extrato"><CurrencyInput currency={currency} showZero value={balance} onChange={setBalance} /></FormField>
        <FormField label="Data do saldo"><input type="date" required max={localDateKey()} value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></FormField>
        {!reference && <FormField label="Referência em reais por unidade"><input required={!holding.fx} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder={holding.fx?.rate.toString() ?? 'Ex.: 6,13'} className={inputClass} /></FormField>}
      </div>
      <p className="text-xs text-dark-text-muted">Registra a quantidade atual, inclusive zero, sem criar aporte nem alterar movimentos antigos em reais. Não deduz a quantidade pelo valor antigo. A avaliação usa a referência do Banco Central, sem tarifas, tributos ou margem da meta; na ausência de nova referência conserva a última avaliação.</p>
      <div className="flex gap-2"><PrimaryButton type="submit">Salvar moeda e saldo</PrimaryButton><SecondaryButton onClick={() => setEditing(false)}>Cancelar</SecondaryButton></div>
      {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
    </form>}
  </div>
}

export function ForeignPositionMove({ holding }: { holding: FinancialHolding }) {
  const { activeCycle } = useFinancasStore()
  const [quantity, setQuantity] = useState(0)
  const [amount, setAmount] = useState(0)
  const [kind, setKind] = useState('buy')
  const [date, setDate] = useState(localDateKey)
  const [month, setMonth] = useState(activeCycle.month)
  const [error, setError] = useState('')
  if (!holding.fx) return null
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault()
    const asset = { type: 'holding' as const, id: holding.id }
    const result = recordMovement({ source: kind === 'buy' ? { type: 'account' } : asset, destination: kind === 'buy' ? asset : { type: 'account' }, amount,
      month, occurredOn: date, foreignAmounts: { [holding.id]: quantity }, note: `${kind === 'buy' ? 'Compra' : 'Saída'} de ${formatCurrency(quantity, holding.fx!.currency)}` })
    if (!result.ok) { setError(result.message); return }
    setQuantity(0); setAmount(0); setError('')
  }}>
    <div className="grid grid-cols-3 gap-3">
      <FormField label="Movimento"><select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value)}><option value="buy">Comprar / aportar moeda</option><option value="sell">Resgatar para reais</option></select></FormField>
      <FormField label={kind === 'buy' ? 'Quantidade recebida' : 'Quantidade retirada'}><CurrencyInput currency={holding.fx.currency} value={quantity} onChange={setQuantity} /></FormField>
      <FormField label={kind === 'buy' ? 'Reais efetivamente pagos (com custos)' : 'Reais efetivamente recebidos'}><CurrencyInput value={amount} onChange={setAmount} /></FormField>
      <FormField label="Competência"><input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></FormField>
      <FormField label="Data real"><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></FormField>
    </div>
    <p className="text-xs text-dark-text-muted">A quantidade altera o saldo em moeda. O valor efetivo em reais entra no livro e no ciclo; a cotação atual não substitui o custo da operação.</p>
    <PrimaryButton type="submit" disabled={quantity <= 0 || amount <= 0}>Registrar movimento</PrimaryButton>
    {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
  </form>
}
