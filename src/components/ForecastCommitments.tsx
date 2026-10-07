import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'
import { FormField, PrimaryButton, SecondaryButton } from './ui'
import { useFinancasStore } from '../context/financasStore'
import { cardDueMonthForOccurrence, factLinkKey, requiresExtraCash, type ReconciledOccurrence } from '../lib/forecastCoverage'
import { formatCurrency, formatMonthKey, inputClass } from '../lib/format'
import { localDateKey } from '../lib/shared'
import type { BudgetArea, ExpectedEvent, ForecastFactLink } from '../types'

function ExistingFactLink({ item }: { item: ReconciledOccurrence }) {
  const { forecast, actuals, cards, movementSources, scenarios } = useFinancasStore()
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')
  const options: { label: string; link: ForecastFactLink }[] = []
  const field = item.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const names = [...scenarios.scenarios, ...scenarios.monthlyPlans].flatMap((row) => [...row.costs, ...row.wants])
  for (const cycle of actuals.months) {
    for (const entry of cycle[field]) options.push({ label: cycle.month + ' · ' + entry.name + ' · ' + formatCurrency(entry.amount), link: { type: 'cash', id: entry.id, month: cycle.month } })
    if (item.event.kind === 'expense') for (const type of ['cost', 'want'] as const) for (const [id, amount] of Object.entries(cycle[type === 'cost' ? 'costs' : 'wants'])) options.push({ label: cycle.month + ' · plano: ' + (names.find((row) => row.id === id)?.name ?? 'Item sem cadastro') + ' · ' + formatCurrency(amount), link: { type, id, month: cycle.month } })
  }
  if (item.event.kind === 'expense') for (const entry of [...cards.entries, ...cards.paidInvoices.flatMap((row) => row.entries ?? [])]) if (!entry.entryType && entry.personalAmount > 0) options.push({ label: 'Cartão ' + entry.cardName + ' · ' + entry.description + ' · ' + entry.dueMonth + ' · ' + formatCurrency(entry.personalAmount), link: { type: 'card', id: entry.id } })
  for (const source of movementSources) for (const entry of source.entries) if (item.event.kind === 'income' ? entry.kind === 'withdrawal' : entry.kind === 'contribution' || entry.kind === 'amortization') options.push({ label: (entry.cycleMonth ?? entry.date.slice(0, 7)) + ' · movimento: ' + (entry.note || entry.kind) + ' · ' + formatCurrency(Math.abs(entry.amount)), link: { type: 'movement', ownerType: source.ownerType, ownerId: source.ownerId, id: entry.id } })
  const links = item.event.occurrenceOverrides?.[item.originalMonth]?.links ?? []
  if (item.event.planLink) return <p className="mt-2 text-xs text-dark-text-muted">Acompanha {names.find((row) => row.id === item.event.planLink?.id)?.name ?? 'o item do plano'} no ciclo {formatMonthKey(item.month)}. Registre o realizado na origem.</p>
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-dark-text-secondary">Vincular registro que já existe</summary>
    <p className="mt-2 text-dark-text-muted">Escolha o mesmo dinheiro já registrado. O vínculo acompanha sua origem e não cria outro pagamento ou recebimento.</p>
    <div className="mt-2 flex items-end gap-2"><FormField label="Registro existente"><select className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">Escolha</option>{options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}</select></FormField>
      <SecondaryButton disabled={choice === ''} onClick={() => { const result = forecast.linkFact(item.event.id, item.originalMonth, options[Number(choice)].link); setError(result.ok ? '' : result.message); if (result.ok) setChoice('') }}>Vincular</SecondaryButton>
    </div>
    {links.map((link, index) => <div key={index} className="mt-2 flex items-center justify-between gap-3"><span>{options.find((option) => factLinkKey(option.link) === factLinkKey(link))?.label ?? ('Vínculo com ' + (link.type === 'cash' ? 'extra registrado' : link.type === 'card' ? 'compra no cartão' : link.type === 'movement' ? 'movimento patrimonial' : 'item do plano'))}</span><SecondaryButton onClick={() => { const result = forecast.unlinkFact(item.event.id, item.originalMonth, index); setError(result.ok ? '' : result.message) }}>Desvincular</SecondaryButton></div>)}
    {error && <p role="alert" className="mt-2 text-rose-200">{error}</p>}
  </details>
}

function OccurrenceRealization({ item }: { item: ReconciledOccurrence }) {
  const { forecast, actuals } = useFinancasStore()
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(item.unregisteredAmount)
  const [date, setDate] = useState(localDateKey), [cycle, setCycle] = useState(forecast.currentMonth), [error, setError] = useState('')
  const field = item.event.kind === 'income' ? 'extraIncome' : 'extraExpenses'
  const linked = actuals.months.flatMap((month) => month[field].filter((entry) => entry.sourceOccurrenceId === item.id || (!entry.sourceOccurrenceId && entry.sourceEventId === item.event.id && month.month === item.originalMonth)).map((entry) => ({ ...entry, cycle: month.month })))
  return <div className="mt-2 text-xs">
    {linked.map((entry) => <div key={entry.id} className="mt-1 flex flex-wrap items-center gap-2 text-dark-text-muted"><span>{formatCurrency(entry.amount)} {item.event.kind === 'income' ? 'recebidos' : 'pagos'} · ciclo {formatMonthKey(entry.cycle)}{entry.occurredAt ? ' · ' + entry.occurredAt : ''}</span><button type="button" className="text-primary-400" onClick={() => { const saved = item.event.kind === 'income' ? actuals.removeExtraIncome(entry.id, entry.cycle) : actuals.removeExtraExpense(entry.id, entry.cycle); setError(saved ? '' : 'Não foi possível desfazer o lançamento.') }}>Desfazer lançamento</button></div>)}
    {!item.cancelled && requiresExtraCash(item) && item.unregisteredAmount > 0.005 && <><SecondaryButton className="mt-2" onClick={() => setOpen(!open)}>{open ? 'Fechar registro' : item.event.kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento'}</SecondaryButton>
      {open && <form className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-dark-border p-3" onSubmit={(e) => { e.preventDefault(); const result = forecast.realizeOccurrence(item.event.id, item.originalMonth, amount, cycle, date); if (!result.ok) { setError(result.message); return } setOpen(false); setError('') }}>
        <FormField label="Valor efetivado"><CurrencyInput value={amount} onChange={setAmount} /></FormField><FormField label="Data real"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField><FormField label="Ciclo"><input className={inputClass} type="month" value={cycle} onChange={(e) => setCycle(e.target.value)} /></FormField><PrimaryButton type="submit" disabled={amount <= 0}>Registrar</PrimaryButton>
      </form>}</>}
    {item.event.cashTreatment === 'planned' && !item.event.planLink && !item.linked && <p className="mt-2 text-dark-text-muted">Vincule o item do plano ou o pagamento já registrado. Não será criada uma saída extra.</p>}
    {error && <p role="alert" className="mt-2 text-rose-200">{error}</p>}
  </div>
}

function CardOccurrenceAction({ item }: { item: ReconciledOccurrence }) {
  const { forecast, cards } = useFinancasStore()
  const [accountId, setAccountId] = useState(cards.accounts[0]?.id ?? ''), [date, setDate] = useState(localDateKey)
  const [amount, setAmount] = useState(item.unregisteredAmount), [area, setArea] = useState<BudgetArea>('desejos'), [error, setError] = useState('')
  if (item.cancelled || item.event.cashTreatment !== 'card' || item.unregisteredAmount <= 0.005) return null
  return <details className="mt-2 text-xs"><summary className="cursor-pointer text-dark-text-secondary">Registrar nova cobrança no cartão</summary>
    <p className="mt-2 text-dark-text-muted">Se a compra já está no cartão, use o vínculo acima.</p>
    <form className="mt-2 grid grid-cols-4 gap-2" onSubmit={(e) => { e.preventDefault(); const result = forecast.registerCard(item.event.id, item.originalMonth, { accountId, amount, date, budgetArea: area }); setError(result.ok ? '' : result.message) }}>
      <FormField label="Cartão"><select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{cards.accounts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></FormField>
      <FormField label="Valor"><CurrencyInput value={amount} onChange={setAmount} /></FormField><FormField label="Data real"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField><FormField label="Área"><select className={inputClass} value={area} onChange={(e) => setArea(e.target.value as BudgetArea)}><option value="desejos">Desejos</option><option value="necessidades">Necessidades</option><option value="investimentos">Investimentos</option></select></FormField><PrimaryButton type="submit" disabled={!accountId || amount <= 0}>Lançar cobrança</PrimaryButton>
    </form>{error && <p role="alert" className="mt-2 text-rose-200">{error}</p>}
  </details>
}

function OccurrenceRow({ item, onEdit }: { item: ReconciledOccurrence; onEdit?: (item: ReconciledOccurrence) => void }) {
  const { forecast } = useFinancasStore(), [error, setError] = useState('')
  return <li className="rounded-lg border border-dark-border-subtle bg-dark-card/70 px-3 py-3 text-sm">
    <div className="flex justify-between gap-3"><span className="text-dark-text-secondary">{item.date ? item.date.split('-').reverse().join('/') : formatMonthKey(item.month)}{item.overdue && item.remainingAmount > 0 ? ' · vencida' : ''}{item.event.cashTreatment === 'card' ? ' · fatura ' + formatMonthKey(cardDueMonthForOccurrence(item) ?? item.month) : ''}</span><strong className="tabular-nums">{formatCurrency(item.cancelled || item.status === 'settled' ? item.paidAmount : item.remainingAmount)} {item.cancelled ? 'realizados · cancelada' : item.status === 'settled' ? 'realizados'  : 'restante'}</strong></div>
    {(item.paidAmount > 0 || item.committedAmount > 0) && <p className="mt-1 text-xs text-dark-text-muted">{formatCurrency(item.paidAmount)} efetivados{item.committedAmount > 0 ? ' · ' + formatCurrency(item.committedAmount) + ' no cartão, ainda a pagar' : ''}</p>}
    <div className="mt-2 flex gap-3 text-xs">{item.cancelled ? !item.event.cancelled && <button type="button" className="text-primary-400" onClick={() => { const result = forecast.updateOccurrence(item.event.id, item.originalMonth, { cancelled: false }); setError(result.ok ? '' : result.message) }}>Reativar ocorrência</button> : item.status !== 'settled' && <>
      <button type="button" className="text-primary-400" onClick={() => onEdit?.(item)}>Editar esta ocorrência</button><button type="button" className="text-dark-text-muted" onClick={() => { const result = forecast.updateOccurrence(item.event.id, item.originalMonth, { cancelled: true }); setError(result.ok ? '' : result.message) }}>Cancelar ocorrência</button>
    </>}</div>
    <OccurrenceRealization key={item.id + ':' + item.unregisteredAmount} item={item} />
    {!item.cancelled && <><ExistingFactLink item={item} /><CardOccurrenceAction key={item.id + ':' + item.unregisteredAmount} item={item} /></>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
  </li>
}

export function ForecastEventOccurrences({ event, onEdit }: { event: ExpectedEvent; onEdit?: (item: ReconciledOccurrence) => void }) {
  const { forecastAgenda } = useFinancasStore(), [limit, setLimit] = useState(6), [doneLimit, setDoneLimit] = useState(6)
  const items = forecastAgenda.find((row) => row.event.id === event.id)?.items ?? []
  const pending = items.filter((item) => item.status !== 'settled' && item.status !== 'cancelled')
  const done = items.filter((item) => item.status === 'settled' || item.status === 'cancelled' && (!event.cancelled || item.paidAmount > 0 || item.committedAmount > 0 || event.occurrenceOverrides?.[item.originalMonth])).reverse()
  return <div className="mt-3 border-t border-dark-border-subtle pt-3"><p className="text-xs text-dark-text-muted">Ocorrências pendentes</p><ul className="mt-2 space-y-2">{pending.slice(0, limit).map((item) => <OccurrenceRow key={item.id} item={item} onEdit={onEdit} />)}</ul>
    {pending.length > limit && <SecondaryButton className="mt-2" onClick={() => setLimit(limit + 6)}>Ver mais ocorrências</SecondaryButton>}
    {done.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer text-dark-text-muted">Realizadas e canceladas ({done.length})</summary><ul className="mt-2 space-y-2">{done.slice(0, doneLimit).map((item) => <OccurrenceRow key={item.id} item={item} />)}</ul>{done.length > doneLimit && <SecondaryButton className="mt-2" onClick={() => setDoneLimit(doneLimit + 6)}>Ver mais registros</SecondaryButton>}</details>}
  </div>
}
