import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'
import { FormField, PrimaryButton, SecondaryButton } from './ui'
import { EvaluationDate } from './BalanceEvaluation'
import { localDateKey } from '../lib/shared'
import { formatCurrency, inputClass } from '../lib/format'
import { useInvestmentsStore } from '../context/financasStore'
import type { FinancialHoldingSummary } from '../lib/investments'
import { repositoryRevision } from '../data/repositoryCommand'

export function PensionBalance({ holding }: { holding: FinancialHoldingSummary }) {
  const { updateHolding } = useInvestmentsStore()
  const [asOf, setAsOf] = useState(holding.valuationDate ?? localDateKey())
  const [editing, setEditing] = useState(false)
  const [total, setTotal] = useState<number | null>(holding.marketValue)
  const [employer, setEmployer] = useState<number | null>(holding.pension?.employerBalance ?? null)
  const [restricted, setRestricted] = useState<number | null>(holding.pension?.employerRestrictedBalance ?? null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState<string | null>(null)
  const company = holding.pension?.employerBalance
  const blocked = holding.pension?.employerRestrictedBalance
  const known = company !== undefined && blocked !== undefined
  const personalContributions = holding.transactions.filter((tx) => tx.payrollMonth && tx.contributor === 'personal').reduce((sum, tx) => sum + tx.amount, 0)
  const employerContributions = holding.transactions.filter((tx) => tx.payrollMonth && tx.contributor === 'employer').reduce((sum, tx) => sum + tx.amount, 0)

  return <div className="rounded-xl border border-dark-border bg-dark-input/30 p-4">
    <div className="flex items-start justify-between gap-4">
      <div><h4 className="text-sm font-semibold text-dark-text">Sua previdência e a parcela da empresa</h4>
        <p className="mt-1 text-xs text-dark-text-muted">Saldo total inclui a parcela em carência. Direito adquirido não significa resgate imediato; consulte a liquidez do plano.</p></div>
      {!editing && <SecondaryButton onClick={() => {
        setAsOf(holding.valuationDate ?? localDateKey()); setTotal(holding.marketValue); setEmployer(company ?? null); setRestricted(blocked ?? null); setRevision(repositoryRevision()); setError(''); setEditing(true)
      }}>Conferir por extrato</SecondaryButton>}
    </div>
    <EvaluationDate date={holding.valuationDate} transactions={holding.transactions} />
    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-dark-text-secondary">
      <div><span className="block text-dark-text-muted">Saldo pessoal</span><strong className="block mt-1 tabular-nums">{known ? formatCurrency(holding.marketValue - company) : 'Divisão não informada'}</strong></div>
      <div><span className="block text-dark-text-muted">Empresa · direito adquirido</span><strong className="block mt-1 tabular-nums">{known ? formatCurrency(company - blocked) : 'Não informado'}</strong></div>
      <div><span className="block text-dark-text-muted">Empresa · em carência</span><strong className="block mt-1 tabular-nums">{known ? formatCurrency(blocked) : 'Não informado'}</strong></div>
    </div>
    <p className="mt-3 text-xs text-dark-text-muted">Aportes automáticos registrados: você {formatCurrency(personalContributions)} · empresa {formatCurrency(employerContributions)}. Saldos antigos e aportes manuais permanecem no livro; sua origem não é presumida.</p>
    {!known && <p className="mt-2 text-xs text-amber-200">Informe a divisão atual do extrato uma vez. Até lá, esta posição não financia metas nem permite resgate no FinTano.</p>}
    {editing && <form className="mt-4 space-y-3 border-t border-dark-border pt-3" onSubmit={(event) => {
      event.preventDefault()
      if (total === null || employer === null || restricted === null || restricted > employer || employer > total) {
        setError('Informe os três saldos, incluindo zero: carência ≤ saldo da empresa ≤ saldo total.'); return
      }
      if (!asOf || asOf > localDateKey() || holding.transactions.some((tx) => tx.date.slice(0, 10) > asOf)) {
        setError('Use a data de um extrato que inclua todos os movimentos registrados, até hoje.'); return
      }
      if (!updateHolding(holding.id, { marketValue: total, valuationDate: asOf, pension: { employerBalance: employer, employerRestrictedBalance: restricted }, purpose: 'portfolio' }, revision)) {
        setError('Não foi possível salvar ou os dados mudaram. O rascunho foi preservado; confira a revisão antes de tentar novamente.'); return
      }
      setEditing(false); setError('')
    }}>
      <FormField label="Data do extrato"><input type="date" required max={localDateKey()} value={asOf} onChange={(event) => setAsOf(event.target.value)} className={inputClass} /></FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Saldo total do extrato"><CurrencyInput value={total ?? 0} onChange={setTotal} showZero={total !== null} onEmpty={() => setTotal(null)} /></FormField>
        <FormField label="Saldo total da empresa" hint="inclua o rendimento da parcela empresarial"><CurrencyInput value={employer ?? 0} onChange={setEmployer} showZero={employer !== null} onEmpty={() => setEmployer(null)} /></FormField>
        <FormField label="Da empresa, ainda em carência"><CurrencyInput value={restricted ?? 0} onChange={setRestricted} showZero={restricted !== null} onEmpty={() => setRestricted(null)} /></FormField>
      </div>
      <p className="text-xs text-dark-text-muted">Novos aportes da empresa entram integralmente em carência. Quando o plano liberar valores, reduza a parcela em carência aqui. Atualizar o extrato não cria aporte.</p>
      <p className="text-xs text-dark-text-muted">Confirme a folha antes de atualizar seu saldo pelo extrato, para não somar um aporte que o extrato já inclui.</p>
      <div className="flex gap-2"><PrimaryButton type="submit">Salvar extrato</PrimaryButton><SecondaryButton onClick={() => setEditing(false)}>Cancelar</SecondaryButton></div>
      {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
    </form>}
  </div>
}
