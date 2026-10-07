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
  paidCards = [],
  onAdd,
}: {
  cycle: CreditCardCycle
  knownCards: string[]
  paidCards?: string[]
  onAdd: (entry: Omit<CreditCardEntry, 'id'>) => boolean
}) {
  const descriptionRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayShort)
  const [cardName, setCardName] = useState(() => knownCards[0] ?? '')
  const [amount, setAmount] = useState(0)
  const [amountTotalInput, setAmountTotalInput] = useState(0)
  const [amountInputMode, setAmountInputMode] = useState<'installment' | 'total'>('installment')
  const [personalAmount, setPersonalAmount] = useState(0)
  const [remainingAmount, setRemainingAmount] = useState(0)
  const [ownerNote, setOwnerNote] = useState('')
  const [installmentCurrent, setInstallmentCurrent] = useState('')
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [area, setArea] = useState<BudgetArea | undefined>('desejos')
  const [saveError, setSaveError] = useState('')

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

    const saved = onAdd({
      cycle,
      description: cleanDescription,
      purchaseDate,
      cardName: knownCards.includes(cardName) ? cardName : knownCards[0] ?? 'Cartão',
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
    if (!saved) {
      setSaveError('Não foi possível salvar a compra. Confira o armazenamento e tente novamente.')
      return
    }
    setSaveError('')

    setDescription('')
    setAmount(0)
    setAmountTotalInput(0)
    setAmountInputMode('installment')
    setPersonalAmount(0)
    setRemainingAmount(0)
    setInstallmentCurrent('')
    setInstallmentTotal('')
    setIsRecurring(false)
    setArea('desejos')
    descriptionRef.current?.focus()
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit() }}
      className="grid grid-cols-2 gap-3 border-b border-dark-border-subtle bg-dark-surface/30 p-4 md:grid-cols-[minmax(140px,1.4fr)_84px_64px_92px_128px_104px_104px_104px_minmax(72px,0.8fr)_56px] md:items-center md:gap-2 md:px-3 md:py-2"
    >
      {paidCards.includes(knownCards.includes(cardName) ? cardName : knownCards[0] ?? '') && <p className="col-span-full text-xs text-primary-400">Fatura deste ciclo paga: esta compra será lançada no próximo ciclo.</p>}
      {saveError && <p role="alert" className="col-span-full rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{saveError}</p>}
      <h3 className="col-span-full text-sm font-semibold text-dark-text md:hidden">Nova compra</h3>
      <label className="col-span-full min-w-0 md:col-span-1"><span className="app-form-label mb-1 block md:sr-only">Descrição</span><input ref={descriptionRef} placeholder="Ex.: mercado" value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Descrição da nova compra" className="app-field w-full px-2.5 py-2 text-sm font-medium md:py-1.5" /></label>
      <div className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Parcelas</span><div className="flex min-h-10 items-center justify-center gap-1 md:min-h-0">
        {isRecurring ? (
          <button type="button" onClick={() => setIsRecurring(false)} className="inline-flex items-center gap-1 rounded bg-dark-input px-1.5 py-1 text-xs font-semibold text-dark-text-secondary"><Repeat size={11} />Assin.</button>
        ) : (
          <>
            <input value={installmentCurrent} onChange={(event) => setInstallmentCurrent(event.target.value.replace(/\D/g, ''))} placeholder="1" inputMode="numeric" aria-label="Parcela atual" className="w-8 rounded-md border border-dark-border/60 bg-dark-input px-1 py-1.5 text-center text-sm tabular-nums outline-none" />
            <span className="text-xs text-dark-text-muted/60">/</span>
            <input value={installmentTotal} onChange={(event) => changeInstallmentTotal(event.target.value)} placeholder="x" inputMode="numeric" aria-label="Total de parcelas" className="w-8 rounded-md border border-dark-border/60 bg-dark-input px-1 py-1.5 text-center text-sm tabular-nums outline-none" />
            <button type="button" onClick={() => setIsRecurring(true)} title="Marcar como assinatura recorrente" className="text-dark-text-muted/50 hover:text-dark-text"><Repeat size={12} /></button>
          </>
        )}
      </div></div>
      <label className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Data real</span><input placeholder="Ex.: 28/09" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} aria-label="Data da compra" className="app-field w-full px-2 py-2 text-center text-sm md:py-1.5" /></label>
      <label className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Cartão</span><select value={knownCards.includes(cardName) ? cardName : knownCards[0] ?? ''} onChange={(event) => setCardName(event.target.value)} aria-label="Cartão" className="app-field w-full px-2 py-2 text-sm md:py-1.5">{knownCards.map((card) => <option key={card} value={card}>{card}</option>)}</select></label>
      <div className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Área do orçamento</span><CardAreaCell value={area} onChange={setArea} /></div>
      <div className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Valor da fatura</span>
        <CurrencyInput value={amountInputValue} onChange={changeAmountInput} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" />
        <div className="-mt-0.5 px-1 text-xs text-dark-text-muted">{isInstallment ? effectiveMode === 'total' ? `parcela: ${formatCurrency(amount)}` : installmentTotalValue > 1 ? `total: ${formatCurrency(purchaseTotal)}` : 'valor da parcela' : 'valor desta fatura'}</div>
      </div>
      <label className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Minha parte</span><CurrencyInput value={personalAmount} onChange={setPersonalAmount} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" /></label>
      <label className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Restante</span><CurrencyInput value={remainingAmount} onChange={setRemainingAmount} className="!border-dark-border/60 !bg-dark-input !py-1.5 !pl-7 !pr-2.5 text-sm" /></label>
      <label className="min-w-0"><span className="app-form-label mb-1 block md:sr-only">Pessoa ou observação</span><input placeholder="Ex.: Ana" value={ownerNote} onChange={(event) => setOwnerNote(event.target.value)} aria-label="Pessoa ou observação" className="app-field w-full px-2 py-2 text-sm md:py-1.5" /></label>
      <button type="submit" disabled={!description.trim() || amount === 0} className="col-span-full flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-40 md:col-span-1 md:h-9 md:w-9 md:px-0" title="Adicionar lançamento (Enter)"><Plus size={18} /><span className="md:sr-only">Adicionar compra</span></button>
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
