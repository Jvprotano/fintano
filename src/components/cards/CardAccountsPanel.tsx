import { useState } from 'react'
import { CreditCard, Plus } from 'lucide-react'
import { Card } from '../Card'
import { CurrencyInput } from '../CurrencyInput'
import { PrimaryButton } from '../ui'
import { inputClass } from '../../lib/format'
import { useCardsStore } from '../../context/financasStore'
import { CardCalendarEditor } from './CardCalendarEditor'

const day = (value: string) => value === '' ? 0 : Math.max(1, Math.min(31, Number(value) || 1))

export function CardAccountsPanel() {
  const { accounts, unregistered, addAccount, updateAccount } = useCardsStore()
  const [name, setName] = useState('')
  const [closingDay, setClosingDay] = useState(0)
  const [dueDay, setDueDay] = useState(0)
  const [limit, setLimit] = useState(0)
  const [error, setError] = useState('')
  const add = (candidate = name) => {
    const clean = candidate.trim()
    if (!clean) return
    if (accounts.some((account) => account.name.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))) {
      setError('Esse cartão já está cadastrado.')
      return
    }
    if (!addAccount({ name: clean, closingDay, dueDay, limit })) { setError('Não foi possível cadastrar o cartão. Tente novamente.'); return }
    setName(''); setLimit(0); setClosingDay(0); setDueDay(0); setError('')
  }
  return <Card title="Configurar cartões" icon={<CreditCard size={17} />} collapsible storageKey={accounts.length > 0 ? 'card-accounts-settings' : undefined} defaultCollapsed={accounts.length > 0}>
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-dark-text-muted">Basta o nome para cadastrar. Informe o dia de vencimento uma vez para ver a data em Faturas dos cartões; o mês acompanha a fatura e o ciclo automaticamente. Fechamento e limite do banco são referências opcionais.</p>
      {accounts.length > 0 && <ul className="space-y-2">
        {accounts.map((account) => <li key={account.id}
          className="grid gap-2 rounded-lg border border-dark-border bg-dark-surface/60 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_10rem]">
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
              className={`${inputClass} mt-1`} aria-label={`Nome de ${account.name}`} />
          </label>
          <label className="app-form-label">Fecha dia (opcional)
            <input type="number" min="1" max="31" placeholder="Não informado" value={account.closingDay || ''}
              onChange={(event) => updateAccount(account.id, { closingDay: day(event.target.value) })}
              className={`${inputClass} mt-1`} /></label>
          <label className="app-form-label">Vence dia (opcional)
            <input type="number" min="1" max="31" placeholder="Não informado" value={account.dueDay || ''}
              onChange={(event) => updateAccount(account.id, { dueDay: day(event.target.value) })}
              className={`${inputClass} mt-1`} /></label>
          <label className="app-form-label">Limite do banco (opcional)
            <span className="mt-1 block"><CurrencyInput value={account.limit}
              onChange={(value) => updateAccount(account.id, { limit: value })} /></span></label>
          <CardCalendarEditor account={account} />
        </li>)}
      </ul>}
      {unregistered.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-dark-text-muted">
        <span>Nos lançamentos, sem cadastro:</span>
        {unregistered.map((candidate) => <button key={candidate} type="button" onClick={() => add(candidate)}
          className="rounded-lg border border-dark-border px-2 py-1 text-dark-text-secondary hover:border-primary-500/40">
          Cadastrar {candidate}
        </button>)}
      </div>}
      <div className="rounded-lg border border-dark-border bg-dark-surface/40 p-3">
        <div className="flex items-end gap-3">
          <label className="app-form-label flex-1">Novo cartão<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Inter" className={`${inputClass} mt-1`} /></label>
          <PrimaryButton onClick={() => add()} disabled={!name.trim()}><Plus size={14} /> Cadastrar</PrimaryButton>
        </div>
        <details className="mt-3 text-xs text-dark-text-muted"><summary className="cursor-pointer">Referências opcionais do novo cartão</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <label className="app-form-label">Fecha dia<input type="number" min="1" max="31" placeholder="Não informado" value={closingDay || ''} onChange={(event) => setClosingDay(day(event.target.value))} className={`${inputClass} mt-1`} /></label>
            <label className="app-form-label">Vence dia<input type="number" min="1" max="31" placeholder="Não informado" value={dueDay || ''} onChange={(event) => setDueDay(day(event.target.value))} className={`${inputClass} mt-1`} /></label>
            <label className="app-form-label">Limite do banco<span className="mt-1 block"><CurrencyInput value={limit} onChange={setLimit} /></span></label>
          </div>
        </details>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <p className="text-xs text-dark-text-muted">A consulta usa o ciclo ativo. Corrigir a atribuição é excepcional e não deve ser necessário a cada pagamento.</p>
    </div>
  </Card>
}
