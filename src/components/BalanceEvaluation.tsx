import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'
import { FormField, PrimaryButton, SecondaryButton } from './ui'
import { inputClass } from '../lib/format'
import { localDateKey, uid } from '../lib/shared'
import { repositoryRevision, runRepositoryCommand } from '../data/repositoryCommand'
import type { Asset, Debt, LedgerEntry } from '../types'
import { validPensionBalance, type FinancialHolding } from '../lib/investments'

export function EvaluationDate({ date, transactions = [] }: { date?: string; transactions?: LedgerEntry[] }) {
  return <span className="block text-xs text-dark-text-muted">{date ? `Última avaliação: ${date.slice(0, 10).split('-').reverse().join('/')}${transactions.some((tx) => tx.date.slice(0, 10) > date) ? ' + movimentos posteriores' : ''}` : 'Data da avaliação não informada'}</span>
}

/** Atualiza saldo e contexto juntos; não escreve no livro de movimentos. */
export function BalanceEvaluation({ id, collection, value, date }: {
  id: string; collection: 'investmentHoldings' | 'assets' | 'debts'; value: number; date?: string
}) {
  const [draft, setDraft] = useState<number | null>(value)
  const [asOf, setAsOf] = useState(date?.slice(0, 10) ?? localDateKey())
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editRevision, setEditRevision] = useState<string | null>(null)
  return <div>
    <EvaluationDate date={date} />
    {!editing ? <SecondaryButton onClick={() => {
      setDraft(value); setAsOf(date?.slice(0, 10) ?? localDateKey()); setEditRevision(repositoryRevision()); setEditing(true); setError('')
    }}>Conferir saldo por avaliação</SecondaryButton> : <form className="space-y-2" onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }} onSubmit={(event) => {
      event.preventDefault()
      const parsed = new Date(`${asOf}T12:00:00Z`)
      if (draft === null || !Number.isFinite(draft) || draft < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== asOf || asOf > localDateKey()) {
        setError('Informe saldo, inclusive zero, e uma data válida até hoje.'); return
      }
      const result = runRepositoryCommand({ id: uid(), expectedRevision: editRevision, apply: (document) => {
        const rows = document.collections[collection] as (FinancialHolding | Asset | Debt)[]
        if (!rows?.some((row) => row.id === id && !row.archivedAt)) return null
        const field = collection === 'investmentHoldings' ? 'marketValue' : collection === 'assets' ? 'value' : 'balance'
        const next = rows.map((row) => row.id === id ? { ...row, [field]: draft, valuationDate: asOf } : row)
        const owner = rows.find((row) => row.id === id)
        if (owner && 'transactions' in owner && owner.transactions.some((tx) => tx.date.slice(0, 10) > asOf)) throw new Error('A avaliação deve incluir todos os movimentos já registrados. Use um extrato a partir da última movimentação.')
        if (collection === 'investmentHoldings' && !validPensionBalance(next.find((row) => row.id === id) as FinancialHolding)) return null
        return { ...document, collections: { ...document.collections, [collection]: next } }
      } })
      if (!result.ok) { setError(result.message); return }
      setEditing(false)
    }}>
      <FormField label="Saldo avaliado"><CurrencyInput ariaLabel="Saldo avaliado" value={draft ?? 0} showZero={draft !== null} onEmpty={() => setDraft(null)} onChange={setDraft} /></FormField>
      <FormField label="Data da avaliação"><input type="date" required max={localDateKey()} value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></FormField>
      <p className="text-xs text-dark-text-muted">Altera o saldo e a variação de valor. Não registra aporte, resgate ou pagamento. Registre os movimentos antes de conferir o saldo.</p>
      <div className="flex gap-2"><PrimaryButton type="submit">Salvar avaliação</PrimaryButton><SecondaryButton onClick={() => setEditing(false)}>Cancelar</SecondaryButton></div>
      {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
    </form>}
  </div>
}
