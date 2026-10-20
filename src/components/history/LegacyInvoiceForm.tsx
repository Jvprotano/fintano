import { useState } from 'react'
import type { CreditCardAccount } from '../../types'
import type { LegacyInvoiceIdentification, PaidInvoiceSnapshot } from '../../lib/cardCycleAccounting'
import { legacyInvoiceId } from '../../lib/cardCycleAccounting'
import { legacyInvoiceIdentificationError } from '../../lib/legacyInvoiceIdentification'
import { repositoryRevision } from '../../data/repositoryCommand'
import { saveLegacyInvoiceIdentification } from '../../data/legacyInvoiceCommand'
import { formatCurrency, inputClass } from '../../lib/format'
import { CurrencyInput } from '../CurrencyInput'
import { FormField, PrimaryButton, SecondaryButton } from '../ui'

type CardDraft = { accountId: string; total: number | null; personalTotal: number | null; others: { name: string; amount: number }[] }

export function LegacyInvoiceForm({ invoice, accounts, onClose }: {
  invoice: PaidInvoiceSnapshot; accounts: CreditCardAccount[]; onClose: () => void
}) {
  const [revision] = useState(repositoryRevision)
  const [cards, setCards] = useState<CardDraft[]>(() => invoice.identification?.cards.map((row) => ({ ...row, others: row.others.map((person) => ({ ...person })) }))
    ?? [{ accountId: '', total: null, personalTotal: null, others: [] }])
  const [reason, setReason] = useState('')
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const patch = (index: number, value: Partial<CardDraft>) => setCards(cards.map((row, i) => i === index ? { ...row, ...value } : row))
  const identification = (): LegacyInvoiceIdentification => ({ recordedAt: new Date().toISOString(), reason: reason.trim(),
    cards: cards.map((row) => ({ ...row, total: row.total ?? NaN, personalTotal: row.personalTotal ?? NaN,
      others: row.others.map((person) => ({ ...person, name: person.name.trim() })) })) })
  const validate = () => legacyInvoiceIdentificationError(identification(), new Set(accounts.map((row) => row.id)), invoice.total, invoice.personalTotal)
  const sum = (key: 'total' | 'personalTotal') => cards.every((row) => row[key] !== null)
    ? formatCurrency(cards.reduce((value, row) => value + (row[key] ?? 0), 0)) : 'A preencher'

  return <form className="mt-4 space-y-4 border-t border-dark-border pt-4" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }} onSubmit={(event) => {
    event.preventDefault()
    const message = validate()
    if (message) { setError(message); return }
    if (!review) { setError(''); setReview(true); return }
    const result = saveLegacyInvoiceIdentification(legacyInvoiceId(invoice), identification(), revision)
    if (result.ok) onClose()
    else setError(result.message)
  }}>
    <p className="text-xs leading-relaxed text-dark-text-secondary">Distribua o pagamento original inteiro entre os cartões, incluindo sua parte e a de cada pessoa. Use os valores pagos ao banco, após abatimentos e antecipações. Pagamentos separados e diferenças de calendário não entram nesta divisão.</p>
    {review ? <div className="space-y-2 text-sm">
      <p className="font-semibold text-dark-text">Confira a identificação antes de salvar</p>
      <p className="text-xs text-dark-text-muted">{invoice.identification ? 'A identificação anterior será substituída pela divisão abaixo.' : 'Antes: pagamento sem identificação por cartão.'} O valor e a data do pagamento original são preservados.</p>
      {cards.map((row, index) => <div key={index} className="rounded-lg bg-dark-input p-3">
        <p>{accounts.find((account) => account.id === row.accountId)?.name} · total {formatCurrency(row.total!)} · minha parte {formatCurrency(row.personalTotal!)}</p>
        {row.others.map((person) => <p key={person.name} className="mt-1 text-xs text-dark-text-secondary">{person.name}: {formatCurrency(person.amount)}</p>)}
      </div>)}
      <p className="text-xs text-dark-text-muted">Motivo: {reason}</p>
    </div> : <>
      {cards.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-dark-border p-3">
        <legend className="px-1 text-xs text-dark-text-muted">Cartão {index + 1}</legend>
        <div className="grid grid-cols-[minmax(10rem,1fr)_1fr_1fr_auto] items-end gap-3">
          <FormField label="Cartão"><select className={inputClass} value={row.accountId} onChange={(event) => patch(index, { accountId: event.target.value })}>
            <option value="">Selecione o cartão</option>{accounts.map((account) => <option key={account.id} value={account.id} disabled={cards.some((item, i) => i !== index && item.accountId === account.id)}>{account.name}</option>)}
          </select></FormField>
          <FormField label="Total ao banco"><CurrencyInput ariaLabel={`Total ao banco do cartão ${index + 1}`} value={row.total ?? 0} showZero={row.total !== null} onEmpty={() => patch(index, { total: null })} onChange={(total) => patch(index, { total })} /></FormField>
          <FormField label="Minha parte"><CurrencyInput ariaLabel={`Minha parte do cartão ${index + 1}`} value={row.personalTotal ?? 0} showZero={row.personalTotal !== null} onEmpty={() => patch(index, { personalTotal: null })} onChange={(personalTotal) => patch(index, { personalTotal })} /></FormField>
          <SecondaryButton onClick={() => setCards(cards.filter((_, i) => i !== index))}>Remover cartão</SecondaryButton>
        </div>
        {row.others.map((person, personIndex) => <div key={personIndex} className="grid grid-cols-[minmax(10rem,1fr)_1fr_auto] items-end gap-3">
          <FormField label="Pessoa"><input className={inputClass} placeholder="Ex.: Mãe" value={person.name} onChange={(event) => patch(index, { others: row.others.map((item, i) => i === personIndex ? { ...item, name: event.target.value } : item) })} /></FormField>
          <FormField label="Parte dessa pessoa"><CurrencyInput ariaLabel={`Parte da pessoa ${personIndex + 1} no cartão ${index + 1}`} value={person.amount} onChange={(amount) => patch(index, { others: row.others.map((item, i) => i === personIndex ? { ...item, amount } : item) })} /></FormField>
          <SecondaryButton onClick={() => patch(index, { others: row.others.filter((_, i) => i !== personIndex) })}>Remover pessoa</SecondaryButton>
        </div>)}
        <SecondaryButton onClick={() => patch(index, { others: [...row.others, { name: '', amount: 0 }] })}>Adicionar pessoa</SecondaryButton>
      </fieldset>)}
      <SecondaryButton onClick={() => setCards([...cards, { accountId: '', total: null, personalTotal: null, others: [] }])}>Adicionar cartão</SecondaryButton>
      <FormField label="Motivo"><input className={inputClass} value={reason} placeholder="Ex.: Conferência pelo extrato de setembro" onChange={(event) => setReason(event.target.value)} /></FormField>
    </>}
    <p className="text-xs tabular-nums text-dark-text-secondary">Soma informada: {sum('total')} · minha parte {sum('personalTotal')}. Original: {invoice.total === null ? 'total desconhecido' : formatCurrency(invoice.total)} · minha parte {formatCurrency(invoice.personalTotal)}.</p>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    <div className="flex gap-2">
      <PrimaryButton type="submit">{review ? 'Salvar identificação' : 'Revisar identificação'}</PrimaryButton>
      {review && <SecondaryButton onClick={() => { setReview(false); setError('') }}>Voltar à edição</SecondaryButton>}
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
    </div>
  </form>
}
