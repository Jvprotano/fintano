import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Flag,
  Landmark,
  Plus,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { LedgerList, LedgerMoveForm } from './Ledger'
import { ReserveSection } from './ReserveSection'
import { GoalsSection } from './GoalsSection'
import { AssetsManager } from './AssetsManager'
import { DebtsManager } from './DebtsManager'
import {
  DonutChart,
  EmptyState,
  FormField,
  GainLabel,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  StatTile,
  Tag,
} from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import { useFinancasStore, useInvestmentsStore } from '../context/financasStore'
import type { FinancialHoldingSummary, InvestmentPurpose } from '../lib/investments'
import { holdingPurpose } from '../lib/investments'
import {
  CHART_PALETTE,
  INVESTMENT_CLASS_PRESET_COLORS,
  INVESTMENT_DEDUCTION_TYPES,
} from '../types/constants'

type Section = 'overview' | 'holdings' | 'reserve' | 'assets' | 'debts'

const SECTION_OPTIONS: { value: Section; label: string }[] = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'holdings', label: 'Posições' },
  { value: 'reserve', label: 'Reserva' },
  { value: 'assets', label: 'Bens' },
  { value: 'debts', label: 'Dívidas' },
]

function PositionRow({ holding }: { holding: FinancialHoldingSummary }) {
  const {
    investmentClasses,
    goals,
    updateHolding,
    removeHolding,
    addHoldingTransaction,
    removeHoldingTransaction,
    setHoldingTransactionCycle,
    setMarketValue,
  } = useInvestmentsStore()
  const { activeCycle } = useFinancasStore()
  const [expanded, setExpanded] = useState(false)
  const purpose = holdingPurpose(holding)
  const assetClass = investmentClasses.find((item) => item.id === holding.assetClassId)
  const allocations = goals.flatMap((goal) =>
    goal.holdingAllocations
      .filter((allocation) => allocation.holdingId === holding.id && allocation.allocated > 0)
      .map((allocation) => ({ goal: goal.name, amount: allocation.allocated, color: goal.color })),
  )
  const missingLocation = !holding.institution?.trim()

  return <div className={`overflow-hidden rounded-2xl border bg-dark-surface/35 transition-colors ${expanded ? 'border-dark-text-muted/30' : 'border-dark-border/70 hover:border-dark-text-muted/25'}`}>
    <button type="button" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${purpose === 'emergency_fund' ? 'border-blue-500/15 bg-blue-500/[0.07] text-blue-300' : 'border-primary-500/15 bg-primary-500/[0.07] text-primary-300'}`}>
        {purpose === 'emergency_fund' ? <Shield size={15} /> : <Landmark size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-dark-text">{holding.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
          <span className="inline-flex items-center gap-1"><Building2 size={10} />{holding.institution || 'Instituição não informada'}</span>
          {assetClass && <span>· {assetClass.name}</span>}
          {holding.benchmark && <span>· {holding.benchmark}</span>}
          {holding.liquidity && <span>· {holding.liquidity}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Tag>{purpose === 'emergency_fund' ? 'Reserva de emergência' : 'Carteira'}</Tag>
          {allocations.map((allocation) => <Tag key={allocation.goal}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: allocation.color }} />{allocation.goal}: {formatCurrency(allocation.amount)}</Tag>)}
          {missingLocation && <span className="inline-flex items-center gap-1 text-xs text-amber-300"><AlertCircle size={10} /> complete a instituição</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-dark-text">{formatCurrency(holding.marketValue)}</p>
        <p className="text-xs"><GainLabel gain={holding.gain} pct={holding.invested > 0 ? holding.gainPct : null} /></p>
      </div>
      <ChevronDown size={15} className={`shrink-0 text-dark-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>

    {expanded && <div className="space-y-4 border-t border-dark-border/60 bg-dark-card/40 px-4 py-4">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5"><span className="block text-dark-text-muted">Aportado</span><strong className="mt-0.5 block tabular-nums text-dark-text">{formatCurrency(holding.invested)}</strong></div>
        <div className="rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5"><span className="block text-dark-text-muted">Rendimento</span><strong className="mt-0.5 block"><GainLabel gain={holding.gain} pct={holding.invested > 0 ? holding.gainPct : null} /></strong></div>
        <div className="col-span-2 rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5 sm:col-span-1"><span className="block text-dark-text-muted">Retorno anualizado</span><strong className="mt-0.5 block tabular-nums text-dark-text">{holding.annualizedPct === null ? '—' : `${holding.annualizedPct >= 0 ? '+' : ''}${holding.annualizedPct.toFixed(1)}%`}</strong></div>
      </div>

      <LedgerMoveForm
        onMove={(amount, note, cycleMonth) =>
          addHoldingTransaction(holding.id, amount, note, cycleMonth)
        }
        inLabel="Aportar"
        outLabel="Resgatar"
        disableOut={holding.marketValue <= 0}
        cycleMonth={activeCycle.month}
      />

      <div className="rounded-2xl border border-dark-border/70 bg-dark-input/20 p-3 sm:p-4">
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-dark-text">Dados da posição</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-dark-text-muted">Saldo, classificação e identificação do produto.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Saldo atual" hint="marcação a mercado"><CurrencyInput value={holding.marketValue} onChange={(value) => setMarketValue(holding.id, value)} className="!py-2" /></FormField>
          <FormField label="Classe"><select value={holding.assetClassId} onChange={(event) => updateHolding(holding.id, { assetClassId: event.target.value })} className={`${inputClass} h-[42px]`}>{investmentClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
          <FormField label="Finalidade"><select value={purpose} onChange={(event) => updateHolding(holding.id, { purpose: event.target.value as InvestmentPurpose })} className={`${inputClass} h-[42px]`}><option value="portfolio">Carteira / metas</option><option value="emergency_fund">Reserva de emergência</option></select></FormField>
          <FormField label="Produto"><input value={holding.name} onChange={(event) => updateHolding(holding.id, { name: event.target.value })} className={`${inputClass} !py-2`} placeholder="Ex.: CDB Itaú 110% CDI" /></FormField>
          <FormField label="Instituição"><input value={holding.institution ?? ''} onChange={(event) => updateHolding(holding.id, { institution: event.target.value })} className={`${inputClass} !py-2`} placeholder="Ex.: Itaú, XP, Nubank" /></FormField>
          <FormField label="Referência"><input value={holding.benchmark ?? ''} onChange={(event) => updateHolding(holding.id, { benchmark: event.target.value })} className={`${inputClass} !py-2`} placeholder="Ex.: 110% CDI" /></FormField>
          <FormField label="Liquidez"><input value={holding.liquidity ?? ''} onChange={(event) => updateHolding(holding.id, { liquidity: event.target.value })} className={`${inputClass} !py-2`} placeholder="Ex.: D+0" /></FormField>
        </div>
      </div>
      <LedgerList
        transactions={holding.transactions}
        onRemove={(id) => removeHoldingTransaction(holding.id, id)}
        onCycleMonthChange={(id, cycleMonth) =>
          setHoldingTransactionCycle(holding.id, id, cycleMonth)
        }
        inLabel="Aporte"
        outLabel="Resgate"
      />
      <div className="border-t border-dark-border-subtle pt-3">
        <button type="button" onClick={() => removeHolding(holding.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-dark-text-muted transition-colors hover:bg-rose-500/[0.06] hover:text-rose-400"><Trash2 size={13} /> Excluir posição</button>
      </div>
    </div>}
  </div>
}

function NewPositionForm({ onClose }: { onClose: () => void }) {
  const { investmentClasses, addHolding, addClass, removeClass, holdings } = useInvestmentsStore()
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [assetClassId, setAssetClassId] = useState(investmentClasses[0]?.id ?? '')
  const [purpose, setPurpose] = useState<InvestmentPurpose>('portfolio')
  const [initialAmount, setInitialAmount] = useState(0)
  const [newClassName, setNewClassName] = useState('')
  const [showNewClass, setShowNewClass] = useState(false)
  const selectedClassId = investmentClasses.some((item) => item.id === assetClassId) ? assetClassId : investmentClasses[0]?.id ?? ''

  const handleAdd = () => {
    if (!name.trim() || !selectedClassId) return
    if (!addHolding({ name, assetClassId: selectedClassId, institution, purpose, initialAmount })) return
    onClose()
  }
  const handleAddClass = () => {
    const trimmed = newClassName.trim()
    if (!trimmed) return
    if (!addClass(trimmed, INVESTMENT_CLASS_PRESET_COLORS[investmentClasses.length % INVESTMENT_CLASS_PRESET_COLORS.length])) return
    setNewClassName(''); setShowNewClass(false)
  }

  return <div className="mt-4 space-y-3 rounded-xl border border-dark-border bg-dark-surface/60 p-4">
    <h4 className="text-sm font-semibold text-dark-text">Nova posição financeira</h4>
    <SegmentedControl options={[{ value: 'portfolio' as const, label: 'Carteira / metas' }, { value: 'emergency_fund' as const, label: 'Reserva de emergência' }]} value={purpose} onChange={setPurpose} />
    <p className="text-xs text-dark-text-muted">A classe diz no que está aplicado; a finalidade diz para que o dinheiro existe.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField label="Produto"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: CDB Itaú 110% CDI" className={inputClass} /></FormField>
      <FormField label="Instituição"><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Ex.: Itaú, XP, Nubank" className={inputClass} /></FormField>
    </div>
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-text-muted">Classe de ativo</span>
      <div className="flex flex-wrap gap-1.5">
        {investmentClasses.map((item) => {
          const selected = selectedClassId === item.id
          const isEmpty = !holdings.some((holding) => holding.assetClassId === item.id)
          return <span key={item.id} className={`group inline-flex items-center rounded-lg border ${selected ? 'border-primary-500/60 bg-primary-500/10' : 'border-transparent bg-dark-input'}`}>
            <button type="button" onClick={() => setAssetClassId(item.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${selected ? 'text-primary-200' : 'text-dark-text-muted'}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</button>
            {isEmpty && <button type="button" onClick={() => removeClass(item.id)} className="pr-2 text-dark-text-muted hover:text-rose-400" aria-label={`Remover a classe ${item.name}`}><X size={12} /></button>}
          </span>
        })}
        {showNewClass ? <span className="inline-flex items-center gap-1 rounded-lg border border-primary-500/40 bg-dark-input px-2 py-1"><input autoFocus value={newClassName} onChange={(event) => setNewClassName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleAddClass()} placeholder="Nova classe" className="w-28 bg-transparent text-xs text-dark-text outline-none" /><button type="button" onClick={handleAddClass} className="text-primary-300"><Plus size={13} /></button></span> : <button type="button" onClick={() => setShowNewClass(true)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-dark-border px-3 py-1.5 text-xs text-dark-text-muted"><Plus size={12} /> Nova classe</button>}
      </div>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block sm:flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-text-muted">Valor aplicado hoje</span><CurrencyInput value={initialAmount} onChange={setInitialAmount} /></label>
      <div className="flex gap-2"><PrimaryButton onClick={handleAdd} disabled={!name.trim() || !selectedClassId}><Plus size={15} /> Adicionar posição</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
    </div>
  </div>
}

function BalanceEquation({ financialAssets, physicalAssets, liabilities, netWorth }: { financialAssets: number; physicalAssets: number; liabilities: number; netWorth: number }) {
  const grossAssets = financialAssets + physicalAssets
  return <Panel>
    <PanelHeader title="Como o patrimônio fecha" description="Ativos menos dívidas, com cada valor identificado." />
    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
      <div className="rounded-xl border border-dark-border/70 bg-dark-input/35 p-4"><span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">Tudo que você tem</span><strong className="mt-1 block text-lg tabular-nums text-dark-text">{formatCurrency(grossAssets)}</strong><span className="mt-1 block text-xs text-dark-text-muted">{formatCurrency(financialAssets)} financeiro{physicalAssets > 0 ? ` + ${formatCurrency(physicalAssets)} em bens` : ''}</span></div>
      <span className="self-center text-center text-xl text-dark-text-muted">−</span>
      <div className="rounded-xl border border-dark-border/70 bg-dark-input/35 p-4"><span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">Tudo que você deve</span><strong className="mt-1 block text-lg tabular-nums text-dark-text">{formatCurrency(liabilities)}</strong><span className="mt-1 block text-xs text-dark-text-muted">saldo devedor atual</span></div>
      <span className="self-center text-center text-xl text-dark-text-muted">=</span>
      <div className={`rounded-xl border p-4 ${netWorth >= 0 ? 'border-primary-500/25 bg-primary-500/[0.07]' : 'border-rose-500/25 bg-rose-500/[0.07]'}`}><span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">Patrimônio líquido</span><strong className={`mt-1 block text-lg tabular-nums ${netWorth >= 0 ? 'text-primary-300' : 'text-rose-300'}`}>{formatCurrency(netWorth)}</strong><span className="mt-1 block text-xs text-dark-text-muted">o que efetivamente é seu</span></div>
    </div>
  </Panel>
}

function PayrollInvestmentsPanel({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const { scenarios, currentCycleFacts } = useFinancasStore()
  const { summary } = useInvestmentsStore()
  const payrollInvestments = scenarios.activeScenario.deductions.filter((deduction) =>
    INVESTMENT_DEDUCTION_TYPES.includes(deduction.type),
  )

  if (payrollInvestments.length === 0) return null

  return (
    <Panel>
      <PanelHeader
        title="Previdência em folha"
        icon={<CircleDollarSign size={16} />}
        description="Contribuições recorrentes do cenário ativo. São fluxo do ciclo; o saldo acumulado pertence a uma posição patrimonial."
        actions={
          <SecondaryButton onClick={() => onNavigate('holdings')}>
            Conferir posições
          </SecondaryButton>
        }
      />
      <div className="mt-4 space-y-2">
        {payrollInvestments.map((deduction) => {
          const employer = deduction.employerContribution ?? 0
          const linkedHolding = summary.allHoldings.find(
            (holding) => holding.id === deduction.linkedHoldingId,
          )
          return (
            <div
              key={deduction.id}
              className="grid gap-2 rounded-xl border border-dark-border-subtle bg-dark-input/25 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(7rem,auto))] sm:items-center"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm text-dark-text">{deduction.name}</strong>
                <span className="text-xs text-dark-text-muted">
                  {linkedHolding
                    ? `${linkedHolding.name}: ${formatCurrency(linkedHolding.marketValue)}`
                    : 'Sem posição patrimonial vinculada'}
                </span>
              </div>
              <span className="text-xs text-dark-text-secondary">
                <span className="block text-xs text-dark-text-muted">Você</span>
                {formatCurrency(deduction.value)}
              </span>
              <span className="text-xs text-dark-text-secondary">
                <span className="block text-xs text-dark-text-muted">Empresa</span>
                {formatCurrency(employer)}
              </span>
              <strong className="text-xs text-primary-300">
                <span className="block text-xs font-normal text-dark-text-muted">Creditado/mês</span>
                {formatCurrency(deduction.value + employer)}
              </strong>
            </div>
          )
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <StatTile
          label="Recursos pessoais no ciclo"
          value={formatCurrency(currentCycleFacts.actual.personalInvestment)}
          detail={`${formatCurrency(currentCycleFacts.actual.payrollInvestment)} via folha + ${formatCurrency(currentCycleFacts.actual.directInvestment)} pela conta`}
        />
        <StatTile
          label="Contrapartida no ciclo"
          value={formatCurrency(currentCycleFacts.actual.employerInvestment)}
          detail="bônus da empresa; não reduz o caixa"
          tone="positive"
        />
        <StatTile
          label="Total creditado no ciclo"
          value={formatCurrency(currentCycleFacts.actual.creditedInvestment)}
          detail="pessoal + empresa"
          tone="accent"
        />
      </div>
      {payrollInvestments.some(
        (deduction) =>
          !summary.allHoldings.some((holding) => holding.id === deduction.linkedHoldingId),
      ) && (
        <p className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.045] px-3 py-2 text-xs leading-relaxed text-dark-text-muted">
          Vincule cada previdência, em Planejar, a uma posição com seu saldo atual. O FinTano não
          inventa o patrimônio acumulado a partir da contribuição mensal nem lança o aporte duas
          vezes.
        </p>
      )}
    </Panel>
  )
}

function Overview({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const { summary, goals } = useInvestmentsStore()
  const institutionSegments = useMemo(() => {
    const values = new Map<string, number>()
    for (const holding of summary.allHoldings) {
      const label = holding.institution?.trim() || 'Instituição não informada'
      values.set(label, (values.get(label) ?? 0) + holding.marketValue)
    }
    if (summary.goalsBalance > 0) values.set('Dinheiro sem posição', summary.goalsBalance)
    const reserveWithoutPosition = Math.max(0, summary.reserveBalance - summary.reserveHoldings.reduce((sum, item) => sum + item.marketValue, 0))
    if (reserveWithoutPosition > 0) values.set('Reserva sem posição', reserveWithoutPosition)
    return [...values.entries()].map(([label, value], index) => ({ id: label, label, value, color: INVESTMENT_CLASS_PRESET_COLORS[index % INVESTMENT_CLASS_PRESET_COLORS.length] }))
  }, [summary])
  const allocatedToGoals = goals.filter((goal) => goal.kind === 'funding').reduce((sum, goal) => sum + goal.allocatedBalance, 0)
  const purposeSegments = [
    { id: 'reserve', label: 'Reserva de emergência', value: summary.reserveBalance, color: CHART_PALETTE.blue },
    { id: 'goals', label: 'Destinado a metas', value: allocatedToGoals, color: CHART_PALETTE.violet },
    { id: 'free', label: 'Carteira sem destino específico', value: Math.max(0, summary.portfolioMarketValue - allocatedToGoals), color: CHART_PALETTE.aqua },
    { id: 'unlocated', label: 'Metas sem posição', value: summary.goalsBalance, color: CHART_PALETTE.muted },
  ]
  const goalsWithoutSources = goals.filter((goal) => goal.kind === 'funding' && goal.current <= 0 && !goal.isComplete)
  const positionsWithoutInstitution = summary.allHoldings.filter((holding) => !holding.institution?.trim())

  return <div className="space-y-4">
    {summary.financialAssets > 0 ? <div className="grid gap-4 lg:grid-cols-2">
      <Panel><PanelHeader title="Onde está seu dinheiro" icon={<Building2 size={16} />} description="Distribuição por instituição, com valor e percentual visíveis." /><div className="mt-5"><DonutChart segments={institutionSegments} centerLabel="Financeiro" centerValue={formatCurrency(summary.financialAssets)} /></div></Panel>
      <Panel><PanelHeader title="Para que ele existe" icon={<CircleDollarSign size={16} />} description="Reserva, objetivos e carteira livre sem criar patrimônio em duplicidade." /><div className="mt-5"><DonutChart segments={purposeSegments} total={summary.financialAssets} centerLabel="Finalidades" centerValue={formatCurrency(summary.financialAssets)} /></div></Panel>
    </div> : <EmptyState icon={<Landmark size={26} />} title="Comece pelas posições" action={<PrimaryButton onClick={() => onNavigate('holdings')}><Plus size={15} /> Cadastrar posição</PrimaryButton>}>Cadastre onde seu dinheiro está. Depois você poderá separar o que é reserva e ligar valores específicos às metas.</EmptyState>}

    <PayrollInvestmentsPanel onNavigate={onNavigate} />

    <BalanceEquation financialAssets={summary.financialAssets} physicalAssets={summary.physicalAssets} liabilities={summary.liabilities} netWorth={summary.netWorth} />

    {(goalsWithoutSources.length > 0 || positionsWithoutInstitution.length > 0) && <Panel>
      <PanelHeader title="Próximos ajustes" icon={<AlertCircle size={16} />} description="Poucos dados faltam para o mapa ficar completo." />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {goalsWithoutSources.length > 0 && <a href="#patrimonio-metas" className="rounded-xl border border-dark-border/70 bg-dark-input/35 p-3 text-left hover:border-primary-500/35"><span className="flex items-center gap-2 text-xs font-semibold text-dark-text"><Flag size={14} className="text-violet-300" />Ligar {goalsWithoutSources.length} meta{goalsWithoutSources.length > 1 ? 's' : ''} a posições</span><span className="mt-1 block text-xs text-dark-text-muted">{goalsWithoutSources.map((goal) => goal.name).join(', ')}</span></a>}
        {positionsWithoutInstitution.length > 0 && <button type="button" onClick={() => onNavigate('holdings')} className="rounded-xl border border-dark-border/70 bg-dark-input/35 p-3 text-left hover:border-primary-500/35"><span className="flex items-center gap-2 text-xs font-semibold text-dark-text"><Building2 size={14} className="text-amber-300" />Informar instituição de {positionsWithoutInstitution.length} {positionsWithoutInstitution.length === 1 ? 'posição' : 'posições'}</span><span className="mt-1 block text-xs text-dark-text-muted">{positionsWithoutInstitution.map((holding) => holding.name).join(', ')}</span></button>}
      </div>
    </Panel>}

    <div id="patrimonio-metas" className="scroll-mt-20">
      <GoalsSection />
    </div>
  </div>
}

function PositionsPanel() {
  const { summary } = useInvestmentsStore()
  const [showForm, setShowForm] = useState(false)
  const grouped = useMemo(() => {
    const groups = new Map<string, FinancialHoldingSummary[]>()
    for (const holding of summary.allHoldings) {
      const institution = holding.institution?.trim() || 'Instituição não informada'
      groups.set(institution, [...(groups.get(institution) ?? []), holding])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  }, [summary.allHoldings])

  return <Panel>
    <PanelHeader title="Posições" icon={<Landmark size={16} />} description="Todo produto financeiro aparece aqui — inclusive o CDB da reserva. A finalidade e as metas são atributos da posição." actions={!showForm && <SecondaryButton onClick={() => setShowForm(true)}><Plus size={14} /> Nova posição</SecondaryButton>} />
    {showForm && <NewPositionForm onClose={() => setShowForm(false)} />}
    <div className="mt-4">{grouped.length === 0 ? <EmptyState icon={<Landmark size={26} />} title="Nenhuma posição cadastrada" action={!showForm && <PrimaryButton onClick={() => setShowForm(true)}><Plus size={15} /> Adicionar a primeira</PrimaryButton>}>Cadastre CDBs, ETFs, caixinhas, ações e qualquer outro lugar onde seu dinheiro está.</EmptyState> : <div className="space-y-5">{grouped.map(([institution, holdings]) => <div key={institution}>
      <div className="mb-2 flex items-center gap-2 px-1"><Building2 size={13} className="text-dark-text-muted" /><h4 className="text-xs font-semibold text-dark-text">{institution}</h4><span className="ml-auto text-xs font-semibold tabular-nums text-dark-text-secondary">{formatCurrency(holdings.reduce((sum, holding) => sum + holding.marketValue, 0))}</span></div>
      <div className="space-y-2">{holdings.map((holding) => <PositionRow key={holding.id} holding={holding} />)}</div>
    </div>)}</div>}</div>
  </Panel>
}

export function InvestmentsManager() {
  const { summary, goals } = useInvestmentsStore()
  const { debts } = useFinancasStore()
  const [section, setSection] = useState<Section>('overview')
  const activeGoals = goals.filter((goal) => !goal.isComplete).length

  return <div className="space-y-4">
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Patrimônio líquido" value={formatCurrency(summary.netWorth)} detail={`${formatCurrency(summary.grossAssets)} em ativos − ${formatCurrency(summary.liabilities)} em dívidas`} tone={summary.netWorth > 0 ? 'accent' : summary.netWorth < 0 ? 'negative' : 'neutral'} />
      <StatTile label="Dinheiro e investimentos" value={formatCurrency(summary.financialAssets)} detail={`${summary.allHoldings.length} ${summary.allHoldings.length === 1 ? 'posição' : 'posições'} · ${formatCurrency(summary.reserveBalance)} de reserva`} tone="neutral" />
      <StatTile label="Dívidas" value={formatCurrency(summary.liabilities)} detail={summary.liabilities > 0 ? `${formatCurrency(debts.summary.totalMonthlyInterest)}/mês de juros` : 'nenhuma dívida cadastrada'} tone="neutral" />
      <StatTile label="Rendimento financeiro" value={`${summary.financialGain >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(summary.financialGain))}`} detail={summary.financialInvested > 0 ? `${((summary.financialGain / summary.financialInvested) * 100).toFixed(1)}% sobre o aportado · ${activeGoals} meta${activeGoals === 1 ? '' : 's'} aberta${activeGoals === 1 ? '' : 's'}` : undefined} tone={summary.financialGain > 0 ? 'positive' : summary.financialGain < 0 ? 'negative' : 'neutral'} />
    </div>

    <nav aria-label="Seções do patrimônio">
      <SegmentedControl
        options={SECTION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={section}
        onChange={setSection}
        columnsClassName="grid-cols-3 sm:grid-cols-5"
      />
    </nav>

    {section === 'overview' && <Overview onNavigate={setSection} />}
    {section === 'holdings' && <PositionsPanel />}
    {section === 'reserve' && <ReserveSection />}
    {section === 'assets' && <AssetsManager />}
    {section === 'debts' && <DebtsManager />}
  </div>
}
