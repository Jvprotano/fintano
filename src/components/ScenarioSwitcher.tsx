import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Layers3, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatCurrency, formatMonthKey } from '../lib/format'
import { useFinancasStore } from '../context/financasStore'
import { usePlanningWorkspace } from '../context/planningStore'
import { PrimaryButton, SecondaryButton } from './ui'

export function ScenarioSwitcher({ onGoToPlanning }: { onGoToPlanning: () => void }) {
  const store = useFinancasStore()
  const workspace = usePlanningWorkspace()
  const {
    scenarios,
    currentPlan,
    recurringTemplateId,
    renameScenario,
    removeScenario,
  } = store.scenarios
  const summaries = store.scenarioSummaries

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const finishEditing = () => {
    if (editingId && draftName.trim() && !renameScenario(editingId, draftName)) return
    setEditingId(null)
    setDraftName('')
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape') { setOpen(false); setEditingId(null) }
    }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-xl border border-dark-border bg-dark-surface/80 px-3 text-sm font-medium text-dark-text shadow-sm shadow-black/15 transition-colors hover:border-dark-text-muted/40 hover:bg-dark-hover"
      >
        <Layers3 size={14} className="text-dark-text-muted" />
        <span className="max-w-48 truncate">Planejar · {workspace.selectedId ? workspace.scenarios.activeScenarioAll.name : 'Atual'}</span>
        <ChevronDown
          size={14}
          className={`text-dark-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="app-panel-shadow absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-dark-border bg-dark-card/98">
          <p className="border-b border-dark-border-subtle px-3 py-2 text-xs leading-relaxed text-dark-text-muted">
            Plano de {formatMonthKey(store.activeCycle.month)} · {currentPlan.fixedReference ? 'referência fixada' : 'em edição'}. Renda em conta: {formatCurrency(store.metrics.paycheckInAccount)}.
          </p>
          <button type="button" onClick={() => { workspace.select(null); setOpen(false); onGoToPlanning() }}
            className={`m-1.5 block w-[calc(100%-0.75rem)] rounded-lg px-2 py-2 text-left text-sm ${!workspace.selectedId ? 'bg-primary-500/10 text-primary-300' : 'text-dark-text hover:bg-dark-hover'}`}>
            <span className="block font-medium">Atual · plano do ciclo</span>
            <span className="text-xs text-dark-text-muted">Usado no Ciclo e nas projeções</span>
          </button>
          <p className="px-3 pt-3 text-xs font-semibold text-dark-text-secondary">Cenários salvos</p>
          <p className="px-3 py-1 text-xs leading-relaxed text-dark-text-muted">Abra para consultar ou editar em Planejar. Crie uma variação antes de experimentar novos valores.</p>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {scenarios.map((scenario) => {
              const summary = summaries.find((item) => item.id === scenario.id)
              const isActive = scenario.id === workspace.selectedId

              if (editingId === scenario.id) {
                return (
                  <div key={scenario.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5">
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') finishEditing()
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      className="app-field min-w-0 flex-1 !rounded-lg px-2 py-1.5 text-sm"
                      aria-label="Novo nome do cenário"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={finishEditing}
                      className="rounded-md p-1.5 text-primary-400 hover:bg-primary-500/10"
                      aria-label="Salvar nome"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md p-1.5 text-dark-text-muted hover:bg-dark-hover"
                      aria-label="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              }

              return (
                <div
                  key={scenario.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    isActive ? 'bg-primary-500/10' : 'hover:bg-dark-hover'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      workspace.select(scenario.id)
                      setOpen(false)
                      onGoToPlanning()
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`block truncate text-sm font-medium ${
                        isActive ? 'text-primary-300' : 'text-dark-text'
                      }`}
                    >
                      {scenario.name}{scenario.id === recurringTemplateId && <span className="ml-2 text-xs font-normal text-dark-text-muted">Modelo</span>}
                      {workspace.pendingScenarioIds.includes(scenario.id) && <span className="ml-2 text-xs font-normal text-dark-text-muted">Rascunho</span>}
                    </span>
                    {summary && (
                      <span className="block text-xs tabular-nums text-dark-text-muted">
                        renda {formatCurrency(scenario.salaryNet)} · livre{' '}
                        <span
                          className={
                            summary.balanceAfterPlan >= 0 ? 'text-primary-400' : 'text-rose-400'
                          }
                        >
                          {formatCurrency(summary.balanceAfterPlan)}
                        </span>
                      </span>
                    )}
                  </button>
                  <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(scenario.id)
                        setDraftName(scenario.name)
                      }}
                      className="rounded-md p-1.5 text-dark-text-muted hover:text-dark-text"
                      aria-label={`Renomear ${scenario.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!removeScenario(scenario.id)) {
                          setRemoveError('Não foi possível excluir. O cenário pode ser modelo dos próximos ciclos, origem de planos ou de itens realizados.')
                        } else setRemoveError('')
                      }}
                      disabled={scenarios.length <= 1}
                      className="rounded-md p-1.5 text-dark-text-muted hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Excluir ${scenario.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {removeError && <p role="alert" className="px-3 pb-2 text-xs leading-relaxed text-amber-200">{removeError}</p>}
          <div className="border-t border-dark-border-subtle p-2 text-xs text-dark-text-muted">
            <p>Modelo dos próximos ciclos: {scenarios.find((item) => item.id === recurringTemplateId)?.name ?? 'Recorrente'}</p>
          </div>
          <div className="border-t border-dark-border-subtle p-2">
            {creating ? <form className="space-y-2" onSubmit={(event) => {
              event.preventDefault()
              if (!workspace.createVariation(newName)) { setRemoveError('Não foi possível criar a variação. Confira o nome e o armazenamento.'); return }
              setCreating(false); setNewName(''); setRemoveError(''); setOpen(false); onGoToPlanning()
            }}>
              <label className="app-form-label">Nome da variação<input className="app-field mt-1.5 w-full px-3 py-2" placeholder="Ex.: IDEAL" value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /></label>
              <p className="text-xs text-dark-text-muted">Cópia de {workspace.selectedId ? workspace.scenarios.activeScenarioAll.name : 'Atual · plano do ciclo'}, com renda, custos, Desejos e aportes.</p>
              <div className="flex gap-2"><PrimaryButton type="submit" disabled={!newName.trim()}>Criar cenário</PrimaryButton><SecondaryButton onClick={() => setCreating(false)}>Cancelar</SecondaryButton></div>
            </form> : <SecondaryButton className="w-full" onClick={() => { setCreating(true); setRemoveError('') }}><Plus size={14} /> Criar variação</SecondaryButton>}
          </div>
        </div>
      )}
    </div>
  )
}
