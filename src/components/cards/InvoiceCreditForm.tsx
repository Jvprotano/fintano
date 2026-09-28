import { useState } from 'react'
import type { CreditCardCycle, CreditCardEntry } from '../../types'
import { formatMonthLong } from '../../lib/format'
import { CurrencyInput } from '../CurrencyInput'
import { PrimaryButton } from '../ui'

function todayShort() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function InvoiceCreditForm({ cycle, cashCycleMonth, knownCards, onAdd, onCancel }: {
  cycle: CreditCardCycle
  cashCycleMonth: string
  knownCards: string[]
  onAdd: (entry: Omit<CreditCardEntry, 'id'>) => void
  onCancel: () => void
}) {
  const [creditSource, setCreditSource] = useState<'payment' | 'reward'>('payment')
  const [description, setDescription] = useState('')
  const [cardName, setCardName] = useState(knownCards[0] ?? '')
  const [purchaseDate, setPurchaseDate] = useState(todayShort)
  const [amount, setAmount] = useState(0)
  const valid = description.trim().length > 0 && cardName.trim().length > 0 && Number.isFinite(amount) && amount > 0

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        onAdd({
          cycle,
          entryType: 'invoiceCredit',
          creditSource,
          cashCycleMonth,
          description: description.trim(),
          cardName: cardName.trim(),
          purchaseDate: purchaseDate.trim(),
          amount,
          personalAmount: amount,
          remainingAmount: 0,
        })
        onCancel()
      }}
      className="grid gap-3 border-b border-dark-border-subtle bg-dark-surface/50 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.5fr_1fr_0.8fr_1fr_auto] xl:items-end"
    >
      <label className="block min-w-0 text-xs font-medium text-dark-text-secondary">
        Tipo de abatimento
        <select value={creditSource} onChange={(event) => setCreditSource(event.target.value as 'payment' | 'reward')} className="mt-1.5 w-full rounded-md border border-dark-border bg-dark-input px-2.5 py-2 text-sm text-dark-text">
          <option value="payment">Pagamento antecipado</option>
          <option value="reward">Pontos ou crédito</option>
        </select>
      </label>
      <label className="block min-w-0 text-xs font-medium text-dark-text-secondary">
        Descrição
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: pontos abatidos na fatura" className="mt-1.5 w-full rounded-md border border-dark-border bg-dark-input px-2.5 py-2 text-sm text-dark-text" />
      </label>
      <label className="block min-w-0 text-xs font-medium text-dark-text-secondary">
        Cartão
        <input value={cardName} onChange={(event) => setCardName(event.target.value)} list="invoice-credit-card-names" placeholder="Ex.: Itaú" className="mt-1.5 w-full rounded-md border border-dark-border bg-dark-input px-2.5 py-2 text-sm text-dark-text" />
        <datalist id="invoice-credit-card-names">{knownCards.map((card) => <option key={card} value={card} />)}</datalist>
      </label>
      <label className="block min-w-0 text-xs font-medium text-dark-text-secondary">
        Data real
        <input value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} placeholder="Ex.: 28/09" className="mt-1.5 w-full rounded-md border border-dark-border bg-dark-input px-2.5 py-2 text-sm text-dark-text" />
      </label>
      <label className="block min-w-0 text-xs font-medium text-dark-text-secondary">
        Valor já abatido
        <span className="mt-1.5 block"><CurrencyInput value={amount} onChange={setAmount} className="!border-dark-border !bg-dark-input !py-2" /></span>
      </label>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
        <PrimaryButton type="submit" disabled={!valid}>Registrar</PrimaryButton>
        <button type="button" onClick={onCancel} className="rounded-lg border border-dark-border px-3 py-2 text-sm font-medium text-dark-text-secondary hover:text-dark-text">Cancelar</button>
      </div>
      <p className="text-xs leading-relaxed text-dark-text-muted sm:col-span-2 xl:col-span-full">
        Fatura selecionada: {cycle === 'current' ? 'atual' : 'em formação'} · ciclo do caixa: {formatMonthLong(cashCycleMonth)}. Reduz a parte pessoal da fatura sem mudar compras ou áreas do orçamento. Pagamento antecipado já saiu do caixa; pontos ou crédito não são saída de caixa.
      </p>
    </form>
  )
}
