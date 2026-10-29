import { useState } from 'react'
import { useFinancasStore } from '../context/financasStore'
import { repositoryRevision } from '../data/repositoryCommand'
import { formatCurrency, formatMonthKey } from '../lib/format'
import { ConfirmationDialog, FormField, PrimaryButton, SecondaryButton } from './ui'

export function SavePlanScenario() {
  const { scenarios, activeCycle } = useFinancasStore()
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [name, setName] = useState('')
  const [useNext, setUseNext] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [review, setReview] = useState<{
    scenarioId?: string; name: string; useForNextCycles: boolean; revision: string | null; salary: number; previousSalary?: number
  } | null>(null)
  const target = scenarios.scenarios.find((scenario) => scenario.id === targetId)
  const isCurrentModel = target?.id === scenarios.recurringTemplateId
  const useForNextCycles = isCurrentModel || useNext

  return <div className="mt-3 border-t border-dark-border-subtle pt-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-dark-text-muted">Planejar salva este ciclo automaticamente. Para reutilizar o plano nos próximos meses, salve-o como cenário.</p>
      <SecondaryButton onClick={() => {
        setOpen(!open)
        setTargetId(scenarios.recurringTemplateId)
        setName('')
        setUseNext(true)
        setError('')
        setSuccess('')
      }} aria-expanded={open}>Salvar plano como cenário</SecondaryButton>
    </div>
    {success && <p role="status" className="mt-2 text-sm text-primary-300">{success}</p>}
    {open && <form className="mt-4 space-y-3" onSubmit={(event) => {
      event.preventDefault()
      if (!target && !name.trim()) { setError('Informe o nome do novo cenário.'); return }
      setError('')
      setReview({ scenarioId: target?.id, name: target?.name ?? name.trim(), useForNextCycles,
        revision: repositoryRevision(), salary: scenarios.currentPlan.salaryNet, previousSalary: target?.salaryNet })
    }}>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Salvar em">
          <select className="app-field w-full px-3 py-2" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {scenarios.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>Atualizar {scenario.name}</option>)}
            <option value="">Criar novo cenário</option>
          </select>
        </FormField>
        {!target && <FormField label="Nome do novo cenário">
          <input className="app-field w-full px-3 py-2" placeholder="Ex.: Atual após reajuste" value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>}
      </div>
      <label className="flex items-center gap-2 text-sm text-dark-text-secondary">
        <input type="checkbox" className="accent-primary-500" checked={useForNextCycles} disabled={isCurrentModel} onChange={(event) => setUseNext(event.target.checked)} />
        Usar como modelo dos próximos ciclos
      </label>
      <p className="text-xs leading-relaxed text-dark-text-muted">
        {isCurrentModel ? 'Este cenário já é o modelo atual. Atualizá-lo muda a base dos próximos meses. ' : ''}
        {useForNextCycles ? 'Atualiza também planos futuros desse modelo ainda sem edição, referência fixada ou realizado. Ciclos fechados são preservados.' : 'Guarda o cenário sem trocar o modelo dos próximos ciclos.'}
      </p>
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
        <PrimaryButton type="submit">Revisar gravação</PrimaryButton>
      </div>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
    </form>}
    <ConfirmationDialog open={review !== null} title={review?.scenarioId ? 'Atualizar cenário com este plano?' : 'Salvar plano em um novo cenário?'}
      description={review && <div className="space-y-3">
        <p>O plano completo de {formatMonthKey(activeCycle.month)} será copiado para <strong>{review.name}</strong>: renda, descontos, custos, Desejos e aporte.</p>
        <p className="tabular-nums">Renda informada: {review.previousSalary !== undefined && `${formatCurrency(review.previousSalary)} → `}{formatCurrency(review.salary)}.</p>
        <p>{review.useForNextCycles ? 'Será o modelo dos próximos ciclos, incluindo planos futuros desse modelo ainda intactos.' : 'O modelo dos próximos ciclos continua como está.'}</p>
        <p>O plano deste ciclo e sua referência fixada permanecem preservados. Nenhum recebimento ou pagamento será registrado.</p>
      </div>}
      confirmLabel="Salvar cenário" onClose={() => setReview(null)} onConfirm={() => {
        if (!review) return
        const result = scenarios.saveCurrentPlanAsScenario({ scenarioId: review.scenarioId, name: review.name,
          useForNextCycles: review.useForNextCycles }, review.revision)
        if (!result.ok) { setError(result.message); return }
        setOpen(false)
        setSuccess(`Cenário “${review.name}” salvo${review.useForNextCycles ? ' e definido como modelo dos próximos ciclos' : ''}.`)
      }} />
  </div>
}
