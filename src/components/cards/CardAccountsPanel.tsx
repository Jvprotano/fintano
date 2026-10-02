import { useState } from 'react'
import { CreditCard, Plus } from 'lucide-react'
import { Card } from '../Card'
import { CurrencyInput } from '../CurrencyInput'
import { ConfirmationDialog, PrimaryButton } from '../ui'
import { formatMonthLong, inputClass } from '../../lib/format'
import { useCardsStore } from '../../context/financasStore'
import { addMonths } from '../../lib/shared'
import { repositoryRevision } from '../../data/repositoryCommand'

const day = (value: string) => Math.max(1, Math.min(31, Number(value) || 1))

export function CardAccountsPanel() {
  const { accounts, unregistered, settings, entries, setDueMonth, addAccount, updateAccount } = useCardsStore()
  const [name, setName] = useState('')
  const [closingDay, setClosingDay] = useState(25)
  const [dueDay, setDueDay] = useState(5)
  const [limit, setLimit] = useState(0)
  const [error, setError] = useState('')
  const [calendarReview, setCalendarReview] = useState<{ month: string; revision: string | null } | null>(null)
  const add = (candidate = name) => {
    const clean = candidate.trim()
    if (!clean) return
    if (accounts.some((account) => account.name.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))) {
      setError('Esse cartão já está cadastrado.')
      return
    }
    addAccount({ name: clean, closingDay, dueDay, limit })
    setName(''); setLimit(0); setError('')
  }
  const currentDueMonth = settings.currentDueMonth ?? ''
  return <Card title="Cadastro e calendário" icon={<CreditCard size={17} />} collapsible storageKey="card-accounts">
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="app-form-label">Competência da fatura atual
          <input type="month" value={currentDueMonth}
            onChange={(event) => {
              const month = event.target.value
              if (!/^\d{4}-\d{2}$/.test(month) || month === currentDueMonth) return
              setCalendarReview({ month, revision: repositoryRevision() })
            }} className={`${inputClass} mt-1.5`} />
        </label>
        <p className="self-end text-xs leading-relaxed text-dark-text-muted">
          A fatura aberta vence em {currentDueMonth ? formatMonthLong(currentDueMonth) : 'mês não informado'}.
          Avance pelo pagamento; altere aqui só para corrigir o calendário.
        </p>
      </div>
      {accounts.length > 0 && <ul className="space-y-2">
        {accounts.map((account) => <li key={account.id}
          className="grid gap-2 rounded-lg border border-dark-border bg-dark-surface/60 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_8rem]">
          <label className="app-form-label">Cartão
            <input defaultValue={account.name} onBlur={(event) => {
              const changed = event.target.value.trim()
              if (!changed) { event.target.value = account.name; return }
              if (accounts.some((other) => other.id !== account.id &&
                other.name.toLocaleLowerCase('pt-BR') === changed.toLocaleLowerCase('pt-BR'))) {
                setError('Esse nome já pertence a outro cartão.'); event.target.value = account.name; return
              }
              updateAccount(account.id, { name: changed }); setError('')
            }}
              className={`${inputClass} mt-1`} aria-label={`Nome de ${account.name}`} /></label>
          <label className="app-form-label">Fecha dia
            <input type="number" min="1" max="31" value={account.closingDay}
              onChange={(event) => updateAccount(account.id, { closingDay: day(event.target.value) })}
              className={`${inputClass} mt-1`} /></label>
          <label className="app-form-label">Vence dia
            <input type="number" min="1" max="31" value={account.dueDay}
              onChange={(event) => updateAccount(account.id, { dueDay: day(event.target.value) })}
              className={`${inputClass} mt-1`} /></label>
          <label className="app-form-label">Limite do banco
            <span className="mt-1 block"><CurrencyInput value={account.limit}
              onChange={(value) => updateAccount(account.id, { limit: value })} /></span></label>
        </li>)}
      </ul>}
      {unregistered.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-dark-text-muted">
        <span>Nos lançamentos, sem cadastro:</span>
        {unregistered.map((candidate) => <button key={candidate} type="button" onClick={() => add(candidate)}
          className="rounded-lg border border-dark-border px-2 py-1 text-dark-text-secondary hover:border-primary-500/40">
          Cadastrar {candidate}
        </button>)}
      </div>}
      <div className="grid gap-2 rounded-lg border border-dark-border bg-dark-surface/40 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_8rem_auto] sm:items-end">
        <label className="app-form-label">Novo cartão<input value={name} onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Inter" className={`${inputClass} mt-1`} /></label>
        <label className="app-form-label">Fecha dia<input type="number" min="1" max="31" value={closingDay}
          onChange={(event) => setClosingDay(day(event.target.value))} className={`${inputClass} mt-1`} /></label>
        <label className="app-form-label">Vence dia<input type="number" min="1" max="31" value={dueDay}
          onChange={(event) => setDueDay(day(event.target.value))} className={`${inputClass} mt-1`} /></label>
        <label className="app-form-label">Limite do banco<span className="mt-1 block"><CurrencyInput value={limit} onChange={setLimit} /></span></label>
        <PrimaryButton onClick={() => add()} disabled={!name.trim()}><Plus size={14} /> Cadastrar</PrimaryButton>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <p className="text-xs text-dark-text-muted">Fechamento e vencimento orientam o calendário de cada cartão; os lançamentos antigos mantêm o nome original.</p>
      <ConfirmationDialog open={calendarReview !== null} title="Corrigir a competência da fatura?"
        description={<span>Os {entries.length} lançamentos abertos manterão sua fatura atual ou próxima, mas a competência do gasto será reatribuída: atual de {formatMonthLong(addMonths(currentDueMonth, -1))} para {formatMonthLong(addMonths(calendarReview?.month ?? currentDueMonth, -1))}; próxima de {formatMonthLong(currentDueMonth)} para {formatMonthLong(calendarReview?.month ?? currentDueMonth)}. Faturas pagas permanecem intactas.</span>}
        confirmLabel="Corrigir calendário" onClose={() => setCalendarReview(null)}
        onConfirm={() => {
          if (calendarReview && !setDueMonth(calendarReview.month, calendarReview.revision)) {
            setError('Os dados mudaram ou o calendário não pôde ser atualizado. Revise antes de tentar novamente.')
          } else setError('')
          setCalendarReview(null)
        }} />
    </div>
  </Card>
}
