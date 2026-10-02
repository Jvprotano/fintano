import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  Archive,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  Download,
  History,
  Keyboard,
  Landmark,
  MoreVertical,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { FinancasProvider } from './context/FinancasContext'
import { useMetrics, useScenarioStore } from './context/financasStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePersistenceStatus } from './hooks/usePersistenceStatus'
import { IncomePanel } from './components/IncomePanel'
import { BudgetModelPicker } from './components/BudgetModelPicker'
import { CostManager } from './components/CostManager'
import { WantsManager } from './components/WantsManager'
import { InvestmentPlan } from './components/InvestmentPlan'
import { ClosingView } from './components/ClosingView'
import { AIAnalysisDialog } from './components/AIAnalysisDialog'
import { ScenarioSwitcher } from './components/ScenarioSwitcher'
import { CycleSwitcher } from './components/CycleSwitcher'
import { ConfirmationDialog } from './components/ui'
import { formatCurrency, formatDate } from './lib/format'
import type { BackupInspection } from './data/backupSchemaV7'
import {
  backupFinancialTotals,
  buildBackupPayload,
  clearAppStorage,
  clearAllFinTanoStorage,
  downloadBackup,
  downloadPreLedgerMigrationRaw,
  inspectBackup,
  listAutoBackups,
  lastExternalExportRequestedAt,
  PRE_LEDGER_MIGRATION_RAW_KEY,
  restoreBackup,
  restoreAutoBackup,
} from './lib/backup'

type View = 'closing' | 'planning' | 'cards' | 'investments' | 'history' | 'forecast'

function PlanningBalance() {
  const { balanceAfterPlan, paycheckInAccount, totalCosts, totalWantsAmount, directInvestmentTarget } = useMetrics()
  return <div className="rounded-xl border border-dark-border bg-dark-card/85 px-4 py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-dark-text-muted">Saldo após o plano do ciclo</p>
        <p className="mt-1 text-xs text-dark-text-muted">Renda em conta planejada menos contas, Desejos e aporte direto.</p>
      </div>
      <strong className={`text-xl tabular-nums ${balanceAfterPlan < -0.005 ? 'text-rose-300' : 'text-dark-text'}`}>
        {formatCurrency(balanceAfterPlan)}
      </strong>
    </div>
    <p className="mt-2 text-xs tabular-nums text-dark-text-muted">
      {formatCurrency(paycheckInAccount)} − {formatCurrency(totalCosts)} contas − {formatCurrency(totalWantsAmount)} Desejos − {formatCurrency(directInvestmentTarget)} aporte
    </p>
  </div>
}

const CreditCardManager = lazy(() =>
  import('./components/CreditCardManager').then((module) => ({ default: module.CreditCardManager })),
)
const InvestmentsManager = lazy(() =>
  import('./components/InvestmentsManager').then((module) => ({ default: module.InvestmentsManager })),
)
const HistoryView = lazy(() =>
  import('./components/HistoryView').then((module) => ({ default: module.HistoryView })),
)
const ForecastView = lazy(() =>
  import('./components/ForecastView').then((module) => ({ default: module.ForecastView })),
)

interface AppDialogState {
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  hideCancel?: boolean
  onConfirm: () => void
}

const SECONDARY_VIEWS = new Set<View>(['forecast'])

const VIEWS: { id: View; label: string; icon: typeof CalendarCheck }[] = [
  { id: 'closing', label: 'Ciclo', icon: CalendarCheck },
  { id: 'planning', label: 'Planejar', icon: SlidersHorizontal },
  { id: 'cards', label: 'Cartões', icon: CreditCard },
  { id: 'investments', label: 'Patrimônio', icon: Landmark },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'forecast', label: 'Futuro', icon: CalendarClock },
]

const VIEW_CONTEXT: Record<View, { eyebrow: string; title: string; description: string }> = {
  closing: {
    eyebrow: 'Competência ativa · realizado e caixa',
    title: 'Seu ciclo',
    description: 'Veja o que entrou, registre o realizado e feche o mês quando os valores estiverem prontos.',
  },
  planning: {
    eyebrow: 'Plano · competência ativa',
    title: 'Planejar',
    description: 'Distribua a renda entre compromissos, Desejos e aportes. Valores planejados ainda não são dinheiro em caixa.',
  },
  cards: {
    eyebrow: 'Fatura · lançamentos e pagamentos',
    title: 'Cartões',
    description: 'Confira a fatura pessoal e seus itens. O envelope Cartão já inclui os detalhes lançados aqui.',
  },
  investments: {
    eyebrow: 'Posição atual · ativos e dívidas',
    title: 'Patrimônio',
    description: 'Acompanhe onde seu dinheiro está e quanto resta depois das dívidas.',
  },
  history: {
    eyebrow: 'Passado · ciclos encerrados',
    title: 'Histórico',
    description: 'Compare o que foi planejado com o realizado nos ciclos já encerrados.',
  },
  forecast: {
    eyebrow: 'Projeção · cenários e premissas',
    title: 'Futuro',
    description: 'Explore possibilidades para os próximos ciclos. Projeção não é saldo disponível hoje.',
  },
}

const SHORTCUTS: { keys: string; description: string }[] = [
  ...VIEWS.map((view, index) => ({ keys: String(index + 1), description: `Ir para ${view.label}` })),
  { keys: '/', description: 'Buscar na fatura (aba Cartões)' },
  { keys: '?', description: 'Mostrar estes atalhos' },
  { keys: 'Esc', description: 'Fechar o que estiver aberto' },
]

function TabBar({
  activeView,
  setActiveView,
  className = '',
}: {
  activeView: View
  setActiveView: (view: View) => void
  className?: string
}) {
  return (
    <nav
      className={`grid grid-cols-3 gap-1 rounded-2xl border border-dark-border/90 bg-dark-card/85 p-1.5 shadow-inner shadow-black/20 sm:grid-cols-6 ${className}`}
      aria-label="Navegação principal"
    >
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const secondary = SECONDARY_VIEWS.has(id)
        const active = activeView === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow] sm:text-sm ${
              active
                ? 'border-primary-500/25 bg-primary-500/[0.12] text-primary-100 shadow-sm shadow-black/20'
                : secondary
                  ? 'border-transparent text-dark-text-muted/65 hover:bg-white/[0.025] hover:text-dark-text-muted'
                  : 'border-transparent text-dark-text-muted hover:bg-white/[0.025] hover:text-dark-text'
            }`}
          >
            <Icon size={15} className={`shrink-0 ${secondary && !active ? 'opacity-70' : ''}`} />
            <span className="hidden whitespace-nowrap lg:inline">{label}</span>
            <span className="whitespace-nowrap lg:hidden">{label.split(' ')[0]}</span>
          </button>
        )
      })}
    </nav>
  )
}

function BackupReview({ inspection }: { inspection: BackupInspection }) {
  const current = backupFinancialTotals(buildBackupPayload())
  const incoming = backupFinancialTotals(inspection.backup)
  const warnings = inspection.issues.filter((issue) => issue.severity === 'warning')
  const { counts } = inspection
  return <span className="space-y-2">
    <span className="block">{counts.planningTemplates} modelos, {counts.monthlyPlans} planos operacionais, {counts.cyclePlans} resumos mensais, {counts.cardCharges} cobranças, {counts.holdings} posições, {counts.valuations} avaliações, {counts.ledgerEntries} movimentos e {counts.closures} fechamentos foram validados.</span>
    <span className="block rounded-lg border border-dark-border bg-dark-surface/60 p-2 text-xs">
      <strong className="block text-dark-text">Conferência antes de substituir</strong>
      <span className="block">Patrimônio financeiro: {formatCurrency(current.financialAssetsCents / 100)} atual → {formatCurrency(incoming.financialAssetsCents / 100)} no arquivo</span>
      <span className="block">Bens: {formatCurrency(current.physicalAssetsCents / 100)} → {formatCurrency(incoming.physicalAssetsCents / 100)} · Dívidas: {formatCurrency(current.liabilitiesCents / 100)} → {formatCurrency(incoming.liabilitiesCents / 100)}</span>
      <span className="block">Caixa extra realizado: entradas {formatCurrency(current.actualCashIncomeCents / 100)} → {formatCurrency(incoming.actualCashIncomeCents / 100)}; saídas {formatCurrency(current.actualCashExpenseCents / 100)} → {formatCurrency(incoming.actualCashExpenseCents / 100)}</span>
    </span>
    {inspection.migratedFromVersion !== null && <span className="block text-amber-200">O formato v{inspection.migratedFromVersion} será convertido para o contrato público v9. O documento local permanece v7.</span>}
    {warnings.length > 0 && <span className="block max-h-32 overflow-y-auto rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-2 text-amber-100">
      <strong className="block">Avisos de integridade ({warnings.length})</strong>
      {warnings.map((warning, index) => <span key={`${warning.code}-${warning.entityId ?? index}`} className="mt-1 block text-xs">{warning.entityId ? `${warning.entityId}: ` : ''}{warning.message}</span>)}
    </span>}
    <span className="block">Os dados atuais serão substituídos depois de uma cópia automática de segurança.</span>
  </span>
}

function AppMenu({
  onExport,
  onImport,
  onResetCurrent,
  onResetAll,
  onShortcuts,
  onRestoreAuto,
}: {
  onExport: () => void
  onImport: () => void
  onResetCurrent: () => void
  onResetAll: () => void
  onShortcuts: () => void
  onRestoreAuto: (createdAt: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const autoBackups = useMemo(() => (open ? listAutoBackups() : []), [open])
  const lastExport = open ? lastExternalExportRequestedAt() : null
  const hasMigrationOriginal = open && localStorage.getItem(PRE_LEDGER_MIGRATION_RAW_KEY) !== null

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-dark-text-secondary transition-colors hover:bg-dark-hover hover:text-dark-text'

  const run = (action: () => void) => () => {
    action()
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-xl border border-dark-border bg-dark-surface/80 p-2.5 text-dark-text-muted shadow-sm shadow-black/15 transition-colors hover:border-dark-text-muted/40 hover:bg-dark-hover hover:text-dark-text"
        aria-label="Mais opções"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-dark-border bg-dark-card p-1.5 shadow-xl shadow-black/40">
          <button type="button" className={itemClass} onClick={run(onExport)}>
            <Download size={14} />
            Exportar backup
          </button>
          {lastExport && <p className="px-3 pb-1 text-xs text-dark-text-muted">Última exportação solicitada: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastExport))}</p>}
          {hasMigrationOriginal && <button type="button" className={itemClass} onClick={run(downloadPreLedgerMigrationRaw)}>
            <Download size={14} /> Baixar original pré-migração
          </button>}
          {hasMigrationOriginal && <p className="px-3 pb-1 text-xs text-dark-text-muted">Documento bruto para análise; use uma cópia automática para restaurar pelo app.</p>}
          <button type="button" className={itemClass} onClick={run(onImport)}>
            <Upload size={14} />
            Importar backup
          </button>
          <button type="button" className={itemClass} onClick={run(onShortcuts)}>
            <Keyboard size={14} />
            Atalhos de teclado
          </button>

          {autoBackups.length > 0 && (
            <div className="mt-1.5 border-t border-dark-border-subtle pt-1.5">
              <span className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-dark-text-muted">
                <Archive size={12} />
                Cópias automáticas
              </span>
              {autoBackups.map((backup) => (
                <button
                  key={backup.createdAt}
                  type="button"
                  className={itemClass}
                  onClick={run(() => onRestoreAuto(backup.createdAt))}
                >
                  <RotateCcw size={14} />
                  Restaurar de {formatDate(backup.createdAt)}
                </button>
              ))}
            </div>
          )}

          <div className="mt-1.5 border-t border-dark-border-subtle pt-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-dark-text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              onClick={run(onResetCurrent)}
            >
              <RotateCcw size={14} />
              Limpar dados atuais
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
              onClick={run(onResetAll)}
            >
              <Trash2 size={14} />
              Apagar dados e cópias
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-dark-border bg-dark-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Atalhos de teclado"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-dark-text">
            <Keyboard size={16} className="text-dark-text-muted" />
            Atalhos de teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-dark-text-muted transition-colors hover:text-dark-text"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <dl className="mt-4 space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-dark-text-secondary">{shortcut.description}</dt>
              <dd>
                <kbd className="rounded-md border border-dark-border bg-dark-surface px-2 py-0.5 font-mono text-xs text-dark-text">
                  {shortcut.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function ViewIntro({ view }: { view: View }) {
  const content = VIEW_CONTEXT[view]
  return (
    <div className="app-page-heading flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <p className="app-eyebrow">{content.eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-dark-text sm:text-[1.8rem]">
          {content.title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-dark-text-secondary">
          {content.description}
        </p>
      </div>
    </div>
  )
}

function AppShell() {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [activeView, setActiveView] = useState<View>('closing')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showAIAnalysis, setShowAIAnalysis] = useState(false)
  const [dialog, setDialog] = useState<AppDialogState | null>(null)
  const scenarios = useScenarioStore()
  const persistence = usePersistenceStatus()
  const closeDialog = useCallback(() => setDialog(null), [])

  const showNotice = useCallback((title: string, description: string) => {
    setDialog({
      title,
      description,
      confirmLabel: 'Entendi',
      hideCancel: true,
      onConfirm: () => undefined,
    })
  }, [])

  const shortcutHandlers = useMemo(
    () => ({
      ...Object.fromEntries(
        VIEWS.map((view, index) => [String(index + 1), () => setActiveView(view.id)]),
      ),
      '?': () => setShowShortcuts(true),
      Escape: () => setShowShortcuts(false),
      '/': () => {
        setActiveView('cards')
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('[data-card-search]')?.focus()
        })
      },
    }),
    [],
  )
  useKeyboardShortcuts(shortcutHandlers)

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (persistence.hasError) {
      showNotice(
        'Resolva o erro de gravação primeiro',
        'A importação foi bloqueada para não substituir seus dados enquanto o navegador não consegue salvá-los.',
      )
      return
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown
      const inspection = inspectBackup(payload)
      const errors = inspection.issues.filter((issue) => issue.severity === 'error')
      if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '))
      setDialog({
        title: 'Importar este backup?',
        description: <BackupReview inspection={inspection} />,
        confirmLabel: 'Importar backup',
        onConfirm: () => {
          const result = restoreBackup(payload)
          if (result.ok) window.location.reload()
          else showNotice('Não foi possível importar', result.error ?? 'O backup não foi restaurado.')
        },
      })
    } catch (error) {
      showNotice(
        'Backup inválido',
        error instanceof Error && error.message
          ? error.message
          : 'O arquivo não parece ser um backup válido do FinTano.',
      )
    }
  }

  const handleResetCurrent = () => {
    setDialog({
      title: 'Limpar os dados atuais?',
      description: 'Planejamento, lançamentos e histórico serão removidos. As cópias automáticas serão mantidas para recuperação.',
      confirmLabel: 'Limpar dados atuais',
      tone: 'danger',
      onConfirm: () => {
        clearAppStorage()
        window.location.reload()
      },
    })
  }

  const handleResetAll = () => {
    setDialog({
      title: 'Apagar tudo deste navegador?',
      description: 'Dados atuais e todas as cópias automáticas serão removidos. Esta ação não pode ser desfeita sem um arquivo de backup exportado.',
      confirmLabel: 'Apagar dados e cópias',
      tone: 'danger',
      onConfirm: () => {
        clearAllFinTanoStorage()
        window.location.reload()
      },
    })
  }

  const handleRestoreAuto = (createdAt: string) => {
    const copy = listAutoBackups().find((item) => item.createdAt === createdAt)
    if (!copy) { showNotice('Cópia indisponível', 'Esta cópia não está mais neste navegador.'); return }
    try {
      const inspection = inspectBackup(copy.backup)
      const errors = inspection.issues.filter((issue) => issue.severity === 'error')
      if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '))
      setDialog({
        title: `Restaurar cópia de ${formatDate(createdAt)}?`,
        description: <BackupReview inspection={inspection} />,
        confirmLabel: 'Restaurar cópia',
        onConfirm: () => {
          const result = restoreAutoBackup(createdAt)
          if (result.ok) window.location.reload()
          else showNotice('Não foi possível restaurar', result.error ?? 'A cópia não foi restaurada.')
        },
      })
    } catch (error) {
      showNotice('Cópia inválida', error instanceof Error ? error.message : 'Não foi possível conferir esta cópia.')
    }
  }

  return (
    <div className="min-h-screen min-w-0 text-dark-text">
      <header className="sticky top-0 z-40 border-b border-dark-border-subtle bg-dark-bg/78 shadow-[0_1px_0_rgba(255,255,255,0.015)] backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-dark-text" aria-label="FinTano">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10 text-xs font-bold text-primary-300">F</span>
            <span>FinTano</span>
          </div>

          <TabBar activeView={activeView} setActiveView={setActiveView} className="hidden xl:grid" />

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <CycleSwitcher />
            </div>
            <ScenarioSwitcher />
            <button
              type="button"
              onClick={() => setShowAIAnalysis(true)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-primary-400/15 bg-primary-500/[0.06] px-3 text-primary-200 shadow-sm shadow-black/15 transition-colors hover:border-primary-400/30 hover:bg-primary-500/[0.1] hover:text-primary-100"
              aria-label="Pedir análise do cenário à IA"
              title="Pedir análise do cenário à IA"
            >
              <Sparkles size={15} />
              <span className="hidden xl:inline text-xs font-semibold">Analisar</span>
            </button>
            <AppMenu
              onExport={downloadBackup}
              onImport={() => importInputRef.current?.click()}
              onResetCurrent={handleResetCurrent}
              onResetAll={handleResetAll}
              onShortcuts={() => setShowShortcuts(true)}
              onRestoreAuto={handleRestoreAuto}
            />
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        {persistence.hasError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-rose-500/35 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" />
              <span>
                <strong className="block text-rose-200">
                  {persistence.isConflict ? 'Dados alterados em outra aba' : 'A última alteração não foi salva'}
                </strong>
                <span className="mt-0.5 block text-xs leading-relaxed text-rose-100/80">
                  {persistence.message}
                  {!persistence.isConflict && ' Libere espaço ou verifique as permissões e tente novamente.'}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={persistence.retry}
              className="shrink-0 rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/10"
            >
              {persistence.isConflict ? 'Recarregar para revisar' : 'Testar novamente'}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 xl:hidden">
          <TabBar activeView={activeView} setActiveView={setActiveView} className="flex-1" />
        </div>
        <div className="sm:hidden">
          <CycleSwitcher />
        </div>

        <ViewIntro view={activeView} />

        {activeView === 'closing' && (
          <ClosingView
            onGoToCards={() => setActiveView('cards')}
            onGoToPlanning={() => setActiveView('planning')}
          />
        )}

        {activeView === 'planning' && (
          <div className="space-y-4">
          <PlanningBalance />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <IncomePanel />
              <CostManager />
            </div>
            <div className="min-w-0 space-y-4">
              <WantsManager />
              <InvestmentPlan />
              <BudgetModelPicker />
            </div>
          </div>
          </div>
        )}

        <Suspense
          fallback={
            <div className="app-panel-shadow rounded-2xl border border-dark-border bg-dark-card/95 p-8 text-center text-sm text-dark-text-muted">
              Carregando dados…
            </div>
          }
        >
          {activeView === 'cards' && <CreditCardManager />}
          {activeView === 'investments' && <InvestmentsManager />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'forecast' && <ForecastView />}
        </Suspense>
      </main>

      <footer className="mt-8 border-t border-dark-border-subtle bg-dark-bg/35">
        <div className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-dark-text-muted sm:px-6">
          Dados salvos apenas neste navegador ({scenarios.scenarios.length}{' '}
          {scenarios.scenarios.length === 1 ? 'cenário' : 'cenários'}). Exporte um backup para
          guardar uma cópia. Aperte <kbd className="font-mono">?</kbd> para ver os atalhos.
        </div>
      </footer>

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      <AIAnalysisDialog open={showAIAnalysis} onClose={() => setShowAIAnalysis(false)} />
      <ConfirmationDialog
        open={dialog !== null}
        title={dialog?.title ?? ''}
        description={dialog?.description}
        confirmLabel={dialog?.confirmLabel}
        tone={dialog?.tone}
        hideCancel={dialog?.hideCancel}
        onConfirm={dialog?.onConfirm ?? (() => undefined)}
        onClose={closeDialog}
      />
    </div>
  )
}

export default function App() {
  return (
    <FinancasProvider>
      <AppShell />
    </FinancasProvider>
  )
}
