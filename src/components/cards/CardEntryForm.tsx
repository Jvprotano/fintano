import { useRef, useState } from 'react'
import { Plus, Repeat } from 'lucide-react'
import type { BudgetArea, CreditCardCycle, CreditCardEntry } from '../../types'
import { buildRemainingAmount, parseInstallments, stripInstallmentToken } from '../../lib/cardImport'
import { formatCurrency } from '../../lib/format'
import { CurrencyInput } from '../CurrencyInput'
import { CardAreaCell } from './CardAreaCell'

function todayShort() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function CardEntryForm({
  cycle,
  knownCards,
  onAdd,
}: {
  cycle: CreditCardCycle
  knownCards: string[]
  onAdd: (entry: Omit<CreditCardEntry, 'id'>) => void
}) {
  const descriptionRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayShort)
  const [cardName, setCardName] = useState('Itaú')
  const [amount, setAmount] = useState(0)
  const [amountTotalInput, setAmountTotalInput] = useState(0)
  const [amountInputMode, setAmountInputMode] = useState<'installment' | 'total'>('installment')
  const [personalAmount, setPersonalAmount] = useState(0)
  const [remainingAmount, setRemainingAmount] = useState(0)
  const [ownerNote, setOwnerNote] = useState('')
  const [installmentCurrent, setInstallmentCurrent] = useState('')
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [area, setArea] = useState<BudgetArea>()

  const parsed = parseInstallments(description)
  const installmentTotalValue = isRecurring ? 0 : Number(installmentTotal) || parsed.installmentTotal || 0
  const isInstallment = !isRecurring && (installmentCurrent !== '' || installmentTotal !== '' || Boolean(parsed.installmentTotal))
  const effectiveMode = isInstallment ? amountInputMode : 'installment'
  const purchaseTotal = installmentTotalValue > 1 ? amount * installmentTotalValue : amount
  const amountInputValue = effectiveMode === 'total' ? amountTotalInput : amount

  const changeAmount = (value: number) => {
    if (personalAmount === amount || personalAmount === 0) setPersonalAmount(value)
    setAmount(value)
  }

  const changeAmountInput = (value: number) => {
    if (effectiveMode === 'total') {
      setAmountTotalInput(value)
      changeAmount(installmentTotalValue > 1 ? value / installmentTotalValue : value)
    } else {
      changeAmount(value)
      setAmountTotalInput(installmentTotalValue > 1 ? value * installmentTotalValue : value)
    }
  }

  const changeInstallmentTotal = (raw: string) => {
    const next = raw.replace(/\D/g, '')
    const nextTotal = Number(next) || parsed.installmentTotal || 0
    setInstallmentTotal(next)
    if (effectiveMode === 'total') changeAmount(nextTotal > 1 ? amountTotalInput / nextTotal : amountTotalInput)
    else setAmountTotalInput(nextTotal > 1 ? amount * nextTotal : amount)
  }

  const submit = () => {
    if (!description.trim() || amount === 0) return
    const current = isRecurring ? undefined : Number(installmentCurrent) || parsed.installmentCurrent
    const total = isRecurring ? undefined : Number(installmentTotal) || parsed.installmentTotal
    const cleanDescription = parsed.installmentTotal ? stripInstallmentToken(description) : description.trim()
    const isShared = amount - personalAmount > 0

    onAdd({
      cycle,
      description: cleanDescription,
      purchaseDate,
      cardName: cardName.trim() || 'Cartão',
      amount,
      personalAmount,
      remainingAmount: remainingAmount || buildRemainingAmount(amount, current, total),
      budgetArea: area,
      ownerName: isShared ? ownerNote.trim() || 'Outro' : '',
      ownerNote: isShared ? '' : ownerNote.trim(),
      installmentCurrent: current,
      installmentTotal: total,
      isRecurring: isRecurring || undefined,
    })

    setDescription('')
    setAmount(0)
    setAmountTotalInput(0)
    setAmountInputMode('installment')
    setPersonalAmount(0)
    setRemainingAmount(0)
    setInstallmentCurrent('')
    setInstallmentTotal('')
    setIsRecurring(false)
    descriptionRef.current?.focus()
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit() }}
      className="grid grid-cols-[minmax(140px,1.4fr)_84px_64px_92px_128px_104px_104px_104px_minmax(72px,0.8fr)_56px] items-center gap-2 border-b border-dark-border-subtle bg-dark-surface/30 px-3 py-2"
    >
      <input ref={descriptionRef} placeholder="Nova compra..." value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Descrição da nova compra" className="w-full rounded-md border border-dark-border/60 bg-dark-input px-2.5 py-1.5 text-sm font-medium text-dark-text outline-none placeholder:text-dark-text-muted focus:border-primary-500/60" />
      <div className="flex items-center justify-center gap-1">
        {isRecurring ? (
          <button type="button" onClick={() => setIsRecurring(false)} className="inline-flex items-center gap-1 rounded bg-dark-input px-1.5 py-1 text-[11px] font-semibold text-dark-text-secondary"><Repeat size={11} />Assin.</button>
        ) : (
          <>
            <input value={installmentCurrent} onChange={(event) => setInstallmentCurrent(event.target.value.replace(/\D/g, ''))} placeholder="1" inputMode="numeric" aria-label="Parcela atual" className="w-8 rounded-md border border-dark-border/60 bg-dark-input px-1 py-1.5 text-center text-sm tabular-nums outline-none" />
            <span className="text-xs text-dark-text-muted/60">/</span>
            <input value={installmentTotal} onChange={(event) => changeInstallmentTotal(event.target.value)} placeholder="x" inputMode="numeric" aria-label="Total de parcelas" className="w-8 rounded-md border border-dark-border/60 bg-dark-input px-1 py-1.5 text-center text-sm tabular-nums outline-none" />
            <button type="button" onClick={() => setIsRecurring(true)} title="Marcar como assinatura recorrente" className="text-dark-text-muted/50 hover:text-dark-text"><Repeat size={12} /></button>
          </>
        )}
      </div>
      <input placeholder="Data" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} aria-label="Data da compra" className="w-full rounded-md border border-dark-border/60 bg-dark-input px-2 py-1.5 text-center text-sm outline-none" />
      <input placeholder="Cartão" list="credit-card-names" value={cardName} onChange={(event) => setCardName(event.target.value)} aria-label="Cartão" className="w-full rounded-md border border-dark-border/60 bg-dark-input px-2 py-1.5 text-center text-sm outline-none" />
      <datalist id="credit-card-names">{knownCards.map((card) => <option key={card} value={card} />)}</datalist>
      <CardAreaCell value={area} onChange={setArea} />
      <div>
        <CurrencyInput value={amountInputValue} onChange={changeAmountInput} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" />
        <div className="-mt-0.5 px-1 text-[10px] text-dark-text-muted">{isInstallment ? effectiveMode === 'total' ? `parcela: ${formatCurrency(amount)}` : installmentTotalValue > 1 ? `total: ${formatCurrency(purchaseTotal)}` : 'valor da parcela' : 'valor desta fatura'}</div>
      </div>
      <CurrencyInput value={personalAmount} onChange={setPersonalAmount} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" />
      <CurrencyInput value={remainingAmount} onChange={setRemainingAmount} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" />
      <input placeholder="Pessoa/Obs" value={ownerNote} onChange={(event) => setOwnerNote(event.target.value)} aria-label="Pessoa ou observação" className="w-full rounded-md border border-dark-border/60 bg-dark-input px-2 py-1.5 text-sm outline-none" />
      <button type="submit" disabled={!description.trim() || amount === 0} className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-40" title="Adicionar lançamento (Enter)"><Plus size={18} /></button>
      {isInstallment && (
        <div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-500/20 bg-primary-500/[0.06] p-3 text-xs text-dark-text-muted">
          <span>Compra parcelada: informe a parcela ou o valor total.</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-dark-card p-1">
            {(['installment', 'total'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => { setAmountInputMode(mode); if (mode === 'total') setAmountTotalInput(purchaseTotal) }} className={`rounded-md px-3 py-1.5 font-medium ${amountInputMode === mode ? 'bg-primary-600 text-white' : 'text-dark-text-muted'}`}>{mode === 'installment' ? 'Valor da parcela' : 'Valor total'}</button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
