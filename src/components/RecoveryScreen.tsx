import { useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Download, RotateCcw, Upload } from 'lucide-react'
import type { RepositoryInspection } from '../data/repository'
import { REPOSITORY_STORAGE_KEY } from '../data/repository'
import { bootstrapMonthlyPlans } from '../data/monthlyPlanMigration'
import { inspectBackup, listAutoBackups, restoreBackup, restoreAutoBackup } from '../lib/backup'
import { formatDate } from '../lib/format'

type BlockedInspection = Extract<RepositoryInspection, { status: 'blocked' }>
type RecoverySource = { label: string; payload: unknown; warnings: string[]; createdAt?: string }

function downloadRawEntries(entries: Record<string, string>): void {
  const keys = Object.keys(entries)
  const singleDocument = keys.length === 1 && keys[0] === REPOSITORY_STORAGE_KEY
  const content = singleDocument ? entries[REPOSITORY_STORAGE_KEY] : JSON.stringify(entries, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `fintano-original-bruto-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function RecoveryScreen({ inspection }: { inspection: BlockedInspection }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [exported, setExported] = useState(false)
  const [source, setSource] = useState<RecoverySource | null>(null)
  const [error, setError] = useState('')
  const autoBackups = listAutoBackups()
  const hasOriginal = Object.keys(inspection.rawEntries).length > 0

  const chooseSource = (payload: unknown, label: string, createdAt?: string) => {
    try {
      const result = inspectBackup(payload)
      const errors = result.issues.filter((issue) => issue.severity === 'error')
      if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '))
      setSource({
        label,
        payload,
        createdAt,
        warnings: result.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message),
      })
      setError('')
    } catch (cause) {
      setSource(null)
      setError(cause instanceof Error ? cause.message : 'A cópia selecionada não é válida.')
    }
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      chooseSource(JSON.parse(await file.text()) as unknown, file.name)
    } catch {
      setSource(null)
      setError('O arquivo não contém um JSON válido.')
    }
  }

  const restore = () => {
    if (!source || (hasOriginal && !exported)) return
    const result = source.createdAt
      ? restoreAutoBackup(source.createdAt, localStorage, { recoverInvalidSource: true })
      : restoreBackup(source.payload, localStorage, { recoverInvalidSource: true })
    if (result.ok) window.location.reload()
    else setError(result.error ?? 'Não foi possível restaurar a cópia.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 text-dark-text">
      <div className="app-panel-shadow w-full max-w-xl rounded-2xl border border-dark-border bg-dark-card p-5 sm:p-7">
        <span className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
          <AlertTriangle size={20} />
        </span>
        <p className="app-eyebrow">Recuperação de dados</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">O FinTano não conseguiu abrir seus dados</h1>
        <p className="mt-3 text-sm leading-relaxed text-dark-text-secondary">{inspection.message} Nenhuma alteração financeira será gravada até que a origem seja recuperada.</p>

        {hasOriginal && (
          <section className="mt-6 rounded-xl border border-dark-border bg-dark-surface/60 p-4">
            <h2 className="text-sm font-semibold">1. Guarde o conteúdo original</h2>
            <p className="mt-1 text-xs leading-relaxed text-dark-text-secondary">
              Baixe os dados exatamente como estão salvos. O arquivo bruto pode estar inválido para importação, mas preserva a origem para análise e reparo.
            </p>
            <button type="button" onClick={() => { downloadRawEntries(inspection.rawEntries); setExported(true) }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-3 text-sm font-medium text-dark-text hover:bg-dark-hover">
              <Download size={16} /> Baixar dados brutos
            </button>
            {exported && <p className="mt-2 text-xs text-primary-300">Download solicitado. Confira se o arquivo foi guardado antes de restaurar.</p>}
          </section>
        )}

        <section className="mt-5 rounded-xl border border-dark-border bg-dark-surface/60 p-4">
          <h2 className="text-sm font-semibold">{hasOriginal ? '2. Escolha uma cópia conhecida' : 'Escolha uma cópia ou tente novamente'}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-3 text-sm font-medium hover:bg-dark-hover">
              <Upload size={16} /> Selecionar arquivo de backup
            </button>
            <button type="button" onClick={() => { const result = bootstrapMonthlyPlans(); if (result.status === 'ready') window.location.reload(); else setError(result.message) }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-3 text-sm font-medium hover:bg-dark-hover">
              <RotateCcw size={16} /> Tentar abrir novamente
            </button>
          </div>
          <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} aria-label="Arquivo de backup" />
          {autoBackups.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-dark-text-muted">Cópias automáticas neste navegador</p>
              {autoBackups.map((backup) => (
                <button key={backup.createdAt} type="button" onClick={() => chooseSource(backup.backup, `Cópia de ${formatDate(backup.createdAt)}`, backup.createdAt)} className="block w-full rounded-lg border border-dark-border bg-dark-card px-3 py-2 text-left text-sm hover:bg-dark-hover">
                  {formatDate(backup.createdAt)}
                </button>
              ))}
            </div>
          )}
        </section>

        {source && (
          <section className="mt-5 rounded-xl border border-primary-500/25 bg-primary-500/[0.05] p-4">
            <h2 className="text-sm font-semibold">Restaurar {source.label}?</h2>
            <p className="mt-1 text-xs leading-relaxed text-dark-text-secondary">A cópia selecionada substituirá o documento atual. Revise os avisos antes de continuar.</p>
            {source.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-200">{source.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            <button type="button" onClick={restore} disabled={hasOriginal && !exported} className="mt-4 min-h-10 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-40">
              Restaurar esta cópia
            </button>
            {hasOriginal && !exported && <p className="mt-2 text-xs text-dark-text-muted">Baixe o conteúdo original para liberar a restauração.</p>}
          </section>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      </div>
    </main>
  )
}
