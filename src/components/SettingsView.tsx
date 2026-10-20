import { useState } from 'react'
import { Archive, CalendarCheck, Download, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'
import { useCardsStore, useFinancasStore } from '../context/financasStore'
import { repositoryRevision } from '../data/repositoryCommand'
import { formatDate, formatMonthLong, inputClass } from '../lib/format'
import {
  downloadPreLedgerMigrationRaw,
  lastExternalExportRequestedAt,
  listAutoBackups,
  PRE_LEDGER_MIGRATION_RAW_KEY,
} from '../lib/backup'
import { Card } from './Card'
import { CardAccountsPanel } from './cards/CardAccountsPanel'
import { CurrencyInput } from './CurrencyInput'
import { ConfirmationDialog, FormField, PrimaryButton, SecondaryButton } from './ui'

function CycleSettings() {
  const { activeCycle } = useFinancasStore()
  const [month, setMonth] = useState(activeCycle.month)
  const [review, setReview] = useState<{ month: string; revision: string | null } | null>(null)
  const [error, setError] = useState('')

  return <Card title="Competência ativa" icon={<CalendarCheck size={17} />}>
    <p className="mb-4 text-sm text-dark-text-secondary">Define o ciclo padrão dos lançamentos e do plano. Para encerrar o mês, use o fechamento na aba Ciclo.</p>
    <form className="flex items-end gap-3" onSubmit={(event) => {
      event.preventDefault()
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === activeCycle.month) return
      setError('')
      setReview({ month, revision: repositoryRevision() })
    }}>
      <FormField label="Ciclo ativo" className="flex-1">
        <input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} />
      </FormField>
      <PrimaryButton type="submit" disabled={!month || month === activeCycle.month}>Revisar alteração</PrimaryButton>
    </form>
    <p className="mt-3 text-xs text-dark-text-muted">Ativo agora: {formatMonthLong(activeCycle.month)}. A mudança não transfere lançamentos entre ciclos.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    <ConfirmationDialog open={review !== null} title="Alterar a competência ativa?"
      description={`Novos lançamentos e edições usarão ${formatMonthLong(review?.month ?? month)} como ciclo padrão. Isso não fecha o mês nem confirma pagamentos. Para consultar meses fechados, use Histórico.`}
      confirmLabel="Ativar ciclo" onClose={() => setReview(null)} onConfirm={() => {
        if (!review) return
        if (repositoryRevision() !== review.revision) {
          setError('Os dados mudaram durante a revisão. Confira o ciclo e revise novamente.')
          return
        }
        if (!activeCycle.setCycleMonth(review.month)) setError('Não foi possível salvar o ciclo. Tente novamente.')
      }} />
  </Card>
}

interface SettingsViewProps {
  onExport: () => void
  onImport: () => void
  onResetCurrent: () => void
  onResetAll: () => void
  onRestoreAuto: (createdAt: string) => void
}

function DataSettings({ onExport, onImport, onResetCurrent, onResetAll, onRestoreAuto }: SettingsViewProps) {
  const [lastExport, setLastExport] = useState(lastExternalExportRequestedAt)
  const autoBackups = listAutoBackups()
  const hasMigrationOriginal = localStorage.getItem(PRE_LEDGER_MIGRATION_RAW_KEY) !== null

  return <Card title="Dados e backup" icon={<Archive size={17} />}>
    <p className="text-sm text-dark-text-secondary">Seus dados ficam neste navegador. Exporte um backup para guardar uma cópia fora dele.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <SecondaryButton onClick={() => { onExport(); setLastExport(lastExternalExportRequestedAt()) }}><Download size={14} /> Exportar backup</SecondaryButton>
      <SecondaryButton onClick={onImport}><Upload size={14} /> Importar backup</SecondaryButton>
    </div>
    {lastExport && <p className="mt-2 text-xs text-dark-text-muted">Última exportação solicitada: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastExport))}</p>}
    <details className="mt-5 border-t border-dark-border-subtle pt-4">
      <summary className="cursor-pointer text-sm font-medium text-dark-text-secondary">Recuperação e limpeza</summary>
      <div className="mt-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-dark-text">Cópias automáticas</h3>
          {autoBackups.length === 0 ? <p className="mt-2 text-xs text-dark-text-muted">Nenhuma cópia automática disponível neste navegador.</p> : <div className="mt-2 flex flex-wrap gap-2">
            {autoBackups.map((backup) => <SecondaryButton key={backup.createdAt} onClick={() => onRestoreAuto(backup.createdAt)}><RotateCcw size={14} /> Restaurar de {formatDate(backup.createdAt)}</SecondaryButton>)}
          </div>}
        </div>
        {hasMigrationOriginal && <div>
          <SecondaryButton onClick={downloadPreLedgerMigrationRaw}><Download size={14} /> Baixar original pré-migração</SecondaryButton>
          <p className="mt-2 text-xs text-dark-text-muted">Documento bruto para análise. Para restaurar pelo app, use uma cópia automática.</p>
        </div>}
        <div className="flex flex-wrap gap-3 border-t border-dark-border-subtle pt-4">
          <SecondaryButton onClick={onResetCurrent}>Limpar dados atuais</SecondaryButton>
          <button type="button" onClick={onResetAll} className="rounded-xl px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/10">Apagar dados e cópias</button>
        </div>
      </div>
    </details>
  </Card>
}

export function SettingsView(props: SettingsViewProps) {
  const { settings, setSettings, migrationError } = useCardsStore()

  return <div className="space-y-4">
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <CycleSettings />
      <Card title="Teto pessoal dos cartões" icon={<SlidersHorizontal size={17} />}>
        <p className="mb-4 text-sm text-dark-text-secondary">Referência de gasto pessoal somando todos os cartões. O uso e o valor disponível continuam na aba Cartões.</p>
        <FormField label="Limite pessoal mensal">
          <CurrencyInput value={settings.personalSpendingLimit} onChange={(value) => setSettings({ ...settings, personalSpendingLimit: value })} />
        </FormField>
      </Card>
    </div>
    {migrationError ? <p role="alert" className="text-sm text-rose-300">{migrationError}</p> : <CardAccountsPanel />}
    <DataSettings {...props} />
  </div>
}
