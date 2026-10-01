import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Layers3, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatCurrency, formatMonthKey } from '../lib/format'
import { useFinancasStore } from '../context/financasStore'
import { repositoryRevision } from '../data/repositoryCommand'
import { ConfirmationDialog } from './ui'

export function ScenarioSwitcher() {
  const store = useFinancasStore()
  const {
    scenarios,
    activeScenarioId,
    setActiveScenarioId,
    applyScenarioToActiveCycle,
    saveCurrentPlanAsRecurring,
    currentPlan,
    recurringTemplateId,
    setRecurringTemplateId,
    createScenario,
    duplicateScenario,
    renameScenario,
    removeScenario,
  } = store.scenarios
  const summaries = store.scenarioSummaries

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [applyError, setApplyError] = useState('')
  const [applyReview, setApplyReview] = useState<{ id: string; revision: string | null } | null>(null)
  const [modelReview, setModelReview] = useState<{ scope: 'model_only' | 'future_unmodified'; revision: string | null } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId)

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-xl border border-dark-border bg-dark-surface/80 px-3 text-sm font-medium text-dark-text shadow-sm shadow-black/15 transition-colors hover:border-dark-text-muted/40 hover:bg-dark-hover"
      >
        <Layers3 size={14} className="text-dark-text-muted" />
        <span className="max-w-36 truncate">Simular: {activeScenario?.name ?? 'Cenário'}</span>
        <ChevronDown
          size={14}
          className={`text-dark-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="app-panel-shadow absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-dark-border bg-dark-card/98">
          <p className="border-b border-dark-border-subtle px-3 py-2 text-xs leading-relaxed text-dark-text-muted">
            Plano de {formatMonthKey(store.activeCycle.month)}: {currentPlan.sourceTemplateName}. Selecionar uma simulação só muda a comparação.
          </p>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {scenarios.map((scenario) => {
              const summary = summaries.find((item) => item.id === scenario.id)
              const isActive = scenario.id === activeScenarioId

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
                      if (setActiveScenarioId(scenario.id)) setOpen(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`block truncate text-sm font-medium ${
                        isActive ? 'text-primary-300' : 'text-dark-text'
                      }`}
                    >
                      {scenario.name}
                    </span>
                    {summary && (
                      <span className="block text-xs tabular-nums text-dark-text-muted">
                        base {formatCurrency(summary.availableForBudget)} · livre{' '}
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
                    <button type="button" onClick={() => { setRecurringTemplateId(scenario.id); setApplyError('') }}
                      className="rounded-md p-1.5 text-dark-text-muted hover:text-primary-300"
                      aria-label={`Usar ${scenario.name} como modelo dos próximos ciclos`}
                      title="Usar como modelo dos próximos ciclos">
                      <Layers3 size={13} />
                    </button>
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
                          setRemoveError('Não foi possível excluir. Confira se este cenário é a única origem de custos ou Desejos já realizados.')
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
          {(removeError || applyError) && <p role="alert" className="px-3 pb-2 text-xs leading-relaxed text-amber-200">{removeError || applyError}</p>}
          <div className="border-t border-dark-border-subtle p-2">
            <button type="button" disabled={!activeScenario} onClick={() => {
              setApplyReview({ id: activeScenarioId, revision: repositoryRevision() })
              setOpen(false)
            }} className="w-full rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-40">
              Aplicar simulação ao ciclo
            </button>
          </div>
          <div className="border-t border-dark-border-subtle p-2 text-xs text-dark-text-muted">
            <p>Modelo dos próximos ciclos: {scenarios.find((item) => item.id === recurringTemplateId)?.name ?? 'Recorrente'}</p>
            <p className="mt-1 leading-relaxed">Depois de editar Planejar, copie o plano deste ciclo para o modelo.</p>
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={() => { setModelReview({ scope: 'model_only', revision: repositoryRevision() }); setOpen(false) }}
                className="flex-1 rounded-lg border border-dark-border px-2 py-2 font-medium text-dark-text-secondary hover:bg-dark-hover">Só modelo</button>
              <button type="button" onClick={() => { setModelReview({ scope: 'future_unmodified', revision: repositoryRevision() }); setOpen(false) }}
                className="flex-1 rounded-lg border border-dark-border px-2 py-2 font-medium text-dark-text-secondary hover:bg-dark-hover">Modelo + futuros</button>
            </div>
          </div>
          <div className="flex gap-1.5 border-t border-dark-border-subtle p-1.5">
            <button
              type="button"
              onClick={() => {
                if (createScenario()) setOpen(false)
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-dark-text-secondary transition-colors hover:bg-dark-hover hover:text-dark-text"
            >
              <Plus size={13} />
              Novo cenário
            </button>
            <button
              type="button"
              onClick={() => {
                if (duplicateScenario(activeScenarioId)) setOpen(false)
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-dark-text-secondary transition-colors hover:bg-dark-hover hover:text-dark-text"
            >
              <Copy size={13} />
              Duplicar atual
            </button>
          </div>
        </div>
      )}
      <ConfirmationDialog open={applyReview !== null} title="Aplicar esta simulação ao ciclo?"
        description={<span>O plano de {formatMonthKey(store.activeCycle.month)} receberá os valores e itens de {scenarios.find((item) => item.id === applyReview?.id)?.name ?? 'esta simulação'}. Realizados e histórico permanecem registrados; itens antigos com fatos ficam arquivados no plano.</span>}
        confirmLabel="Aplicar ao ciclo" onClose={() => setApplyReview(null)} onConfirm={() => {
          if (!applyReview) return
          if (!applyScenarioToActiveCycle(applyReview.id, applyReview.revision)) {
            setApplyError('Os dados mudaram ou a aplicação falhou. Reabra a comparação e confira antes de tentar novamente.')
            setOpen(true)
          } else setApplyError('')
        }} />
      <ConfirmationDialog open={modelReview !== null} title="Atualizar o modelo recorrente?"
        description={<span>Os valores e itens do plano de {formatMonthKey(store.activeCycle.month)} serão copiados para {scenarios.find((item) => item.id === recurringTemplateId)?.name ?? 'o modelo'}. {modelReview?.scope === 'future_unmodified' ? 'Planos futuros ainda intactos também serão atualizados; ciclos com edição ou realizado ficam como estão.' : 'Os planos já criados ficam como estão.'}</span>}
        confirmLabel="Atualizar modelo" onClose={() => setModelReview(null)} onConfirm={() => {
          if (!modelReview) return
          if (!saveCurrentPlanAsRecurring(modelReview.scope, modelReview.revision)) {
            setApplyError('Os dados mudaram ou o modelo não pôde ser salvo. Confira e tente novamente.')
            setOpen(true)
          } else setApplyError('')
        }} />
    </div>
  )
}
