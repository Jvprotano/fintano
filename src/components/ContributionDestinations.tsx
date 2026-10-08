import { useState } from 'react'
import { useFinancasStore } from '../context/financasStore'
import { CurrencyInput } from './CurrencyInput'
import { PrimaryButton, SecondaryButton } from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import { contributionPlan, type ContributionDestination } from '../lib/contributionPlan'
import { repositoryRevision } from '../data/repositoryCommand'
import { setContributionDestinations } from '../data/contributionCommands'

export function ContributionDestinations() {
  const { scenarios, investments, debts } = useFinancasStore()
  const plan = contributionPlan(scenarios.activeScenario, investments.holdings, investments.goals, debts.debts)
  const [draft, setDraft] = useState<ContributionDestination[] | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState('')
  const options = [
    ...investments.holdings.filter((row) => !row.archivedAt).map((row) => ({ key: `holding:${row.id}`, label: `${row.purpose === 'emergency_fund' ? 'Reserva' : 'Posição'} · ${row.name}` })),
    ...investments.goals.filter((row) => !row.archivedAt && row.kind !== 'tracking').map((row) => ({ key: `goal:${row.id}`, label: `Meta · ${row.name}` })),
  ]
  const rows = draft ?? scenarios.activeScenario.contributionDestinations ?? []
  const sum = rows.reduce((total, row) => total + row.amount, 0)
  return <div className="space-y-3 rounded-xl border border-dark-border p-4" onKeyDown={(event) => { if (event.key === 'Escape') setDraft(null) }}>
    <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-dark-text">Destinos do aporte direto</h4>
      <p className="mt-1 text-xs text-dark-text-muted">Capacidade no plano: {formatCurrency(plan.capacity)}/mês. Folha tem destinos próprios. Reservar saldo existente em Patrimônio não cria aporte.</p></div>
      {draft === null && <SecondaryButton onClick={() => { setDraft(rows.map((row) => ({ ...row }))); setRevision(repositoryRevision()); setError('') }}>Editar destinos</SecondaryButton>}
    </div>
    {rows.map((row, index) => <div key={`${row.type}:${row.id}`} className="flex items-center gap-3 text-sm"><span className="flex-1 text-dark-text-secondary">{options.find((item) => item.key === `${row.type}:${row.id}`)?.label ?? 'Destino arquivado ou ausente'}</span>
      {draft === null ? <span className="tabular-nums">{formatCurrency(row.amount)}/mês</span> : <><div className="w-36"><CurrencyInput ariaLabel={`Aporte para ${options.find((item) => item.key === `${row.type}:${row.id}`)?.label ?? row.id}`} value={row.amount} showZero onChange={(amount) => setDraft(draft.map((item, i) => i === index ? { ...item, amount } : item))} /></div><SecondaryButton onClick={() => setDraft(draft.filter((_, i) => i !== index))}>Remover</SecondaryButton></>}
    </div>)}
    <p className={`text-xs ${sum > plan.capacity + 0.005 ? 'text-amber-200' : 'text-dark-text-muted'}`}>Destinado: {formatCurrency(sum)} · {sum > plan.capacity ? `Excede a capacidade em ${formatCurrency(sum - plan.capacity)}; revise antes de projetar os destinos.` : `Sem destino: ${formatCurrency(plan.capacity - sum)}`}</p>
    {plan.unavailable.length > 0 && <p role="alert" className="text-xs text-amber-200">Há destino inativo. A projeção das fontes aguarda revisão.</p>}
    {plan.uncoveredInstallments > 0 && <p className="text-xs text-amber-200">A capacidade desconta {formatCurrency(plan.uncoveredInstallments)} de parcelas que não estão cobertas por custos vinculados no plano. Confira os vínculos em Dívidas.</p>}
    {draft !== null && <><div className="flex gap-2"><label className="app-form-label flex-1">Novo destino<select className={inputClass} value={choice} onChange={(event) => setChoice(event.target.value)}><option value="">Escolha posição ou meta</option>{options.filter((option) => !draft.some((row) => `${row.type}:${row.id}` === option.key)).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><SecondaryButton disabled={!choice} onClick={() => { const [type, ...id] = choice.split(':'); setDraft([...draft, { type: type as 'holding' | 'goal', id: id.join(':'), amount: 0 }]); setChoice('') }}>Adicionar</SecondaryButton></div>
      <div className="flex gap-2"><PrimaryButton onClick={() => { const result = setContributionDestinations(scenarios.currentPlan, draft, revision); if (!result.ok) setError(result.message); else setDraft(null) }}>Salvar destinos</PrimaryButton><SecondaryButton onClick={() => setDraft(null)}>Cancelar</SecondaryButton></div>
      {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
    </>}
    <p className="text-xs text-dark-text-muted">Destinos desta competência. Publicar o plano como modelo leva a divisão aos próximos ciclos ainda intactos. Nenhum saldo é movimentado ao salvar. Valores sem destino continuam na projeção geral, sem financiar uma meta específica. Classes abaixo descrevem composição e não são outra promessa de aporte.</p>
  </div>
}
