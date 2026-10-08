import { useState } from 'react'
import type { CreditCardAccount } from '../../types'
import { readRepositoryDocument } from '../../data/repository'
import { repositoryRevision } from '../../data/repositoryCommand'
import { reviewCardCalendar, saveCardCalendar, type CardCalendarDraft } from '../../data/cardCalendarCommand'
import { cardCycleForDueMonth, cardDueMonthOffset } from '../../lib/cardCalendar'
import { formatMonthLong, inputClass } from '../../lib/format'
import { PrimaryButton, SecondaryButton } from '../ui'

export function CardCalendarEditor({ account }: { account: CreditCardAccount }) {
  const [draft, setDraft] = useState<CardCalendarDraft | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [review, setReview] = useState<ReturnType<typeof reviewCardCalendar> | null>(null)
  const [error, setError] = useState('')
  const patch = (value: Partial<CardCalendarDraft>) => { setDraft((current) => current && { ...current, ...value }); setReview(null); setError('') }
  const cancel = () => { setDraft(null); setReview(null); setError('') }
  return <details className="col-span-full text-xs text-dark-text-secondary">
    <summary className="cursor-pointer">Ajustar calendário e faturas de {account.name}</summary>
    {!draft ? <div className="mt-3 flex items-center justify-between gap-3">
      <span>A fatura do ciclo vence {cardDueMonthOffset(account) === 0 ? 'no mesmo mês' : 'no mês seguinte'}. Fatura aberta: {account.currentDueMonth ? formatMonthLong(account.currentDueMonth) : 'não informada'}.</span>
      <SecondaryButton onClick={() => { setDraft({ accountId: account.id, openDueMonth: account.currentDueMonth ?? '', dueMonthOffset: cardDueMonthOffset(account), includePaidInvoices: false, reason: '' }); setRevision(repositoryRevision()); setError('') }}>Preparar ajuste</SecondaryButton>
    </div> : <form className="mt-3 space-y-3 rounded-lg border border-dark-border bg-dark-card p-3" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }} onSubmit={(event) => {
      event.preventDefault()
      if (!review) {
        try {
          if (repositoryRevision() !== revision) throw new Error('Os dados mudaram. Cancele e prepare o ajuste novamente.')
          setReview(reviewCardCalendar(readRepositoryDocument(), draft)); setError('')
        } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível revisar.') }
        return
      }
      const result = saveCardCalendar(draft, revision)
      if (!result.ok) { setError(result.message); return }
      cancel()
    }}>
      <div className="grid grid-cols-2 gap-3">
        <label className="app-form-label">Mês de vencimento da fatura aberta<input type="month" className={`${inputClass} mt-1`} value={draft.openDueMonth} onChange={(event) => patch({ openDueMonth: event.target.value })} /></label>
        <label className="app-form-label">A fatura de cada ciclo vence<select className={`${inputClass} mt-1`} value={draft.dueMonthOffset} onChange={(event) => patch({ dueMonthOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>No mesmo mês do ciclo</option><option value={1}>No mês seguinte ao ciclo</option></select></label>
      </div>
      {/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.openDueMonth) && <p>A fatura aberta pertencerá ao ciclo de <strong>{formatMonthLong(cardCycleForDueMonth(draft, draft.openDueMonth))}</strong>.</p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={draft.includePaidInvoices} onChange={(event) => patch({ includePaidInvoices: event.target.checked })} />Corrigir também os meses das faturas já pagas deste cartão</label>
      <p className="text-dark-text-muted">Compras e parcelas seguintes acompanham a diferença de meses. Incluir pagas move também sua composição, mantendo valores, parcelas e datas reais dos pagamentos. Fechamentos afetados recebem a revisão.</p>
      <label className="app-form-label block">Motivo<input className={`${inputClass} mt-1`} placeholder="Ex.: a primeira parcela venceu em outubro" value={draft.reason} onChange={(event) => patch({ reason: event.target.value })} /></label>
      {review && <div className="space-y-2"><p className="font-medium text-dark-text">Confira antes de salvar</p><table className="w-full text-left"><thead><tr className="text-dark-text-muted"><th className="py-2">Registro</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{review.changes.map((row, index) => <tr key={index} className="border-t border-dark-border-subtle"><td className="py-2">{row.label}<span className="block text-dark-text-muted">{row.source}</span></td><td className="pr-3">{row.before}</td><td>{row.after}</td></tr>)}</tbody></table></div>}
      {error && <p role="alert" className="text-rose-200">{error}</p>}
      <div className="flex gap-2"><PrimaryButton type="submit" disabled={!draft.reason.trim() || !draft.openDueMonth}>{review ? 'Salvar ajuste de calendário' : 'Revisar ajuste'}</PrimaryButton><SecondaryButton onClick={cancel}>Cancelar</SecondaryButton></div>
    </form>}
    {account.calendarCorrections && account.calendarCorrections.length > 0 && <details className="mt-3"><summary className="cursor-pointer">Ajustes anteriores ({account.calendarCorrections.length})</summary>{[...account.calendarCorrections].reverse().map((row) => <p key={row.id} className="mt-2">{row.beforeDueMonth} → {row.afterDueMonth} · {row.reason} · {row.correctedAt.slice(0, 10)}</p>)}</details>}
  </details>
}
