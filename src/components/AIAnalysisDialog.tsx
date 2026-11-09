import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Bot, Check, Clipboard, ExternalLink, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useFinancasStore } from '../context/financasStore'
import {
  buildFinancialAnalysisSnapshot,
  buildFinancialAnalysisPrompt,
} from '../lib/aiAnalysis'
import { inputClass, selectClass } from '../lib/format'
import { PrimaryButton, SecondaryButton } from './ui'

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('copy_failed')
}

export function AIAnalysisDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <AnalysisContent onClose={onClose} /> : null
}

function AnalysisContent({ onClose }: { onClose: () => void }) {
  const store = useFinancasStore()
  const titleId = useId()
  const descriptionId = useId()
  const objectiveHintId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [feedback, setFeedback] = useState('')
  const [mode, setMode] = useState('diagnosis')
  const [objective, setObjective] = useState('')
  const [draft, setDraft] = useState<{ text: string; source: string } | null>(null)

  const planning = mode === 'planning'
  const requestedObjective = planning ? objective.trim() : undefined
  const snapshot = useMemo(() => buildFinancialAnalysisSnapshot(store, planning), [store, planning])
  const generated = useMemo(() => buildFinancialAnalysisPrompt(snapshot, requestedObjective), [snapshot, requestedObjective])
  const prompt = draft?.text ?? generated
  const changed = draft !== null && draft.source !== generated
  const canShare = requestedObjective !== '' && !changed && Boolean(prompt.trim())
  const dialogRef = useRef<HTMLElement>(null)
  const refresh = () => {
    setDraft(null)
    setFeedback('Fotografia atualizada. Revise o texto antes de copiar.')
    promptRef.current?.focus()
  }
  const handleClose = useCallback(() => {
    setFeedback('')
    onClose()
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => closeRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, textarea')
        if (!controls?.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [handleClose])

  const handleCopy = async () => {
    try {
      await copyText(prompt)
      setFeedback('Texto copiado.')
    } catch {
      setFeedback('Não foi possível copiar automaticamente. Selecione o texto acima.')
    }
  }

  const handleService = (name: string, url: string) => {
    const copy = copyText(prompt)
    window.open(url, '_blank', 'noopener,noreferrer')
    void copy
      .then(() => setFeedback(`Texto copiado. Cole no ${name} com Ctrl+V para revisar e enviar.`))
      .catch(() => setFeedback(`${name} aberto, mas a cópia falhou. Selecione o texto acima.`))
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="app-panel-shadow flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-2xl shadow-black/50 sm:max-h-[calc(100vh-2rem)]"
      >
        <div className="flex items-start gap-3 border-b border-dark-border-subtle px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary-400/15 bg-primary-500/[0.08] text-primary-300">
            <Sparkles size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-dark-text">
              Análise financeira com IA
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-dark-text-muted">
              Revise a fotografia financeira antes de levá-la para uma conversa externa.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-dark-text-muted transition-colors hover:bg-dark-hover hover:text-dark-text"
            aria-label="Fechar análise"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <label className="mb-3 block max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-dark-text-secondary">Tipo de análise</span>
            <select className={selectClass} value={mode} onChange={(event) => { setMode(event.currentTarget.value); setFeedback('') }}>
              <option value="diagnosis">Diagnóstico geral</option>
              <option value="planning">Planejar compra ou meta</option>
            </select>
          </label>
          {planning && (
            <div className="mb-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-dark-text-secondary">O que você quer decidir?</span>
                <textarea
                  value={objective}
                  onChange={(event) => { setObjective(event.currentTarget.value); setFeedback('') }}
                  placeholder="Ex.: comprar um carro por até R$ 70 mil em 12 meses, preservando a reserva."
                  rows={2}
                  required
                  aria-describedby={objectiveHintId}
                  className={`${inputClass} block resize-y`}
                />
              </label>
              <p id={objectiveHintId} className="mt-1 text-xs text-dark-text-muted">Inclua valor, prazo e condições se já souber.</p>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-xl border border-dark-border-subtle bg-dark-surface/55 px-3 py-2.5 text-xs leading-relaxed text-dark-text-secondary">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary-400" />
            <span>
              O texto inclui nomes e valores do seu plano. Abrir um serviço copia a mensagem e abre uma conversa vazia. Você decide o que colar e enviar.
            </span>
          </div>

          {changed && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-amber-200" role="status">
              <span>As fontes mudaram ou você alterou o objetivo. Atualizar a fotografia substitui suas edições na mensagem.</span>
              <SecondaryButton onClick={refresh}>Atualizar fotografia</SecondaryButton>
            </div>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-dark-text-muted">
              Mensagem que será compartilhada
            </span>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => {
                const text = event.currentTarget.value
                setDraft(text === generated ? null : { text, source: draft?.source ?? generated })
                setFeedback('')
              }}
              className="app-field h-[clamp(10rem,calc(100dvh-38rem),16rem)] w-full resize-y px-3 py-3 font-mono text-xs leading-relaxed text-dark-text-secondary"
              aria-label="Mensagem para análise financeira"
            />
          </label>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canShare}
              onClick={() => handleService('ChatGPT', 'https://chatgpt.com/')}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-dark-border bg-dark-surface/80 px-4 py-3 text-left transition-colors enabled:hover:border-dark-text-muted/50 enabled:hover:bg-dark-hover disabled:opacity-40"
            >
              <Bot size={18} className="shrink-0 text-dark-text-secondary" />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold text-dark-text">Abrir ChatGPT</strong>
                <span className="mt-0.5 block text-xs text-dark-text-muted">
                  Copia o texto; você cola e envia.
                </span>
              </span>
              <ExternalLink size={14} className="shrink-0 text-dark-text-muted" />
            </button>

            <button
              type="button"
              disabled={!canShare}
              onClick={() => handleService('Claude', 'https://claude.ai/')}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-dark-border bg-dark-surface/80 px-4 py-3 text-left transition-colors enabled:hover:border-dark-text-muted/50 enabled:hover:bg-dark-hover disabled:opacity-40"
            >
              <Sparkles size={18} className="shrink-0 text-dark-text-secondary" />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold text-dark-text">Abrir no Claude</strong>
                <span className="mt-0.5 block text-xs text-dark-text-muted">
                  Copia o texto; você cola e envia.
                </span>
              </span>
              <ExternalLink size={14} className="shrink-0 text-dark-text-muted" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-border-subtle px-4 py-3 sm:px-5">
          <span className="flex min-h-5 items-center gap-1.5 text-xs text-primary-300" role="status">
            {feedback && <Check size={13} />}
            {feedback}
          </span>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <SecondaryButton onClick={handleClose}>Fechar</SecondaryButton>
            <PrimaryButton onClick={handleCopy} disabled={!canShare} className="!py-2">
              <Clipboard size={14} />
              Copiar texto
            </PrimaryButton>
          </div>
        </div>
      </section>
    </div>
  )
}
