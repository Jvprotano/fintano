import { useState } from 'react'
import { Archive, Building2, ChevronDown, Plus, RotateCcw, Shield, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { localDateKey } from '../lib/shared'
import { LedgerList, LedgerMoveForm } from './Ledger'
import {
  EmptyState,
  FormField,
  GainLabel,
  Meter,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  Tag,
} from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import { useFinancasStore, useInvestmentsStore, useMetrics } from '../context/financasStore'
import type { FinancialHoldingSummary } from '../lib/investments'
import { CHART_PALETTE } from '../types/constants'

const MONTH_OPTIONS = [3, 6, 12]

function ReservePositionRow({ holding }: { holding: FinancialHoldingSummary }) {
  const {
    investmentClasses,
    updateHolding,
    removeHolding,
    restoreHolding,
    deleteEmptyHolding,
    resolveHoldingKind,
    addHoldingTransaction,
    removeHoldingTransaction,
    setHoldingTransactionCycle,
    setMarketValue,
  } = useInvestmentsStore()
  const { activeCycle } = useFinancasStore()
  const [expanded, setExpanded] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const assetClass = investmentClasses.find((item) => item.id === holding.assetClassId)

  return (
    <div className={`overflow-hidden rounded-2xl border bg-dark-surface/35 transition-colors ${expanded ? 'border-dark-text-muted/30' : 'border-dark-border/70 hover:border-dark-text-muted/25'}`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-dark-text">{holding.name}{holding.archivedAt ? ' · arquivada' : ''}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dark-text-muted">
            {holding.institution && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={10} />
                {holding.institution}
              </span>
            )}
            {assetClass && <span>{assetClass.name}</span>}
            {holding.benchmark && <span>{holding.benchmark}</span>}
            {holding.liquidity && <span>liquidez {holding.liquidity}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-dark-text">
            {formatCurrency(holding.marketValue)}
          </p>
          <p className="text-xs">
            <GainLabel gain={holding.gain} pct={holding.invested > 0 ? holding.gainPct : null} />
          </p>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-dark-text-muted transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-dark-border/60 bg-dark-card/40 px-4 py-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5">
              <span className="block text-dark-text-muted">Aportado</span>
              <strong className="tabular-nums text-dark-text">{formatCurrency(holding.invested)}</strong>
            </div>
            <div className="rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5">
              <span className="block text-dark-text-muted">Rendimento</span>
              <strong>
                <GainLabel gain={holding.gain} pct={holding.invested > 0 ? holding.gainPct : null} />
              </strong>
            </div>
            <div className="col-span-2 rounded-xl border border-dark-border-subtle bg-dark-input/45 px-3 py-2.5 sm:col-span-1">
              <span className="block text-dark-text-muted">Retorno anualizado</span>
              <strong className="tabular-nums text-dark-text">
                {holding.annualizedPct === null
                  ? '—'
                  : `${holding.annualizedPct >= 0 ? '+' : ''}${holding.annualizedPct.toFixed(1)}%`}
              </strong>
            </div>
          </div>

          <LedgerMoveForm
            onMove={(amount, note, cycleMonth, occurredOn) =>
              addHoldingTransaction(holding.id, amount, note, cycleMonth, occurredOn)
            }
            inLabel="Aportar"
            outLabel="Resgatar"
            disableOut={holding.marketValue <= 0}
            notePlaceholder="Nota (opcional) — ex.: aporte mensal, resgate emergencial"
            cycleMonth={activeCycle.month}
          />

          <div className="rounded-2xl border border-dark-border/70 bg-dark-input/20 p-3 sm:p-4">
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-dark-text">Dados da reserva</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-dark-text-muted">Identifique onde está o dinheiro e em quanto tempo ele fica disponível.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Saldo atual" hint="marcação a mercado">
              <CurrencyInput
                value={holding.marketValue}
                onChange={(value) => setMarketValue(holding.id, value)}
                className="!py-2"
              />
            </FormField>
            <FormField label="Classe do ativo">
              <select
                value={holding.assetClassId}
                onChange={(event) => updateHolding(holding.id, { assetClassId: event.target.value })}
                className={`${inputClass} h-[42px]`}
              >
                {investmentClasses.map((assetClass) => (
                  <option key={assetClass.id} value={assetClass.id}>
                    {assetClass.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Produto">
            <input
              value={holding.name}
              onChange={(event) => updateHolding(holding.id, { name: event.target.value })}
              className={`${inputClass} !py-1.5`}
              placeholder="Ex.: CDB liquidez diária"
            />
            </FormField>
            <FormField label="Instituição">
            <input
              value={holding.institution ?? ''}
              onChange={(event) => updateHolding(holding.id, { institution: event.target.value })}
              className={`${inputClass} !py-1.5`}
              placeholder="Ex.: Inter, Itaú, XP"
            />
            </FormField>
            <FormField label="Referência">
            <input
              value={holding.benchmark ?? ''}
              onChange={(event) => updateHolding(holding.id, { benchmark: event.target.value })}
              className={`${inputClass} !py-1.5`}
              placeholder="Ex.: 100% CDI"
            />
            </FormField>
            <FormField label="Liquidez">
            <input
              value={holding.liquidity ?? ''}
              onChange={(event) => updateHolding(holding.id, { liquidity: event.target.value })}
              className={`${inputClass} !py-1.5`}
              placeholder="Ex.: D+0"
            />
            </FormField>
            </div>
          </div>

          <LedgerList
            transactions={holding.transactions}
            onRemove={(id) => removeHoldingTransaction(holding.id, id)}
            onCycleMonthChange={(id, cycleMonth) =>
              setHoldingTransactionCycle(holding.id, id, cycleMonth)
            }
            onKindChange={(id, kind) => resolveHoldingKind(holding.id, id, kind)}
            inLabel="Aporte"
            outLabel="Resgate"
          />

          <div className="border-t border-dark-border-subtle pt-3">
            <button
              type="button"
              onClick={() => holding.archivedAt ? restoreHolding(holding.id) : removeHolding(holding.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-dark-text-muted transition-colors hover:bg-dark-hover hover:text-dark-text"
            >
              {holding.archivedAt ? <RotateCcw size={13} /> : <Archive size={13} />}
              {holding.archivedAt ? 'Restaurar posição da reserva' : 'Arquivar posição da reserva'}
            </button>
            {holding.marketValue === 0 && holding.transactions.length === 0 && <button type="button" onClick={() => {
              if (!deleteEmptyHolding(holding.id)) setDeleteError('Exclusão recusada: a posição ainda está vinculada a uma meta ou desconto em folha.')
            }} className="ml-2 inline-flex items-center gap-1.5 text-xs text-dark-text-muted hover:text-rose-400"><Trash2 size={13} /> Excluir cadastro vazio</button>}
            {deleteError && <p role="alert" className="mt-2 text-xs text-amber-200">{deleteError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function NewReservePositionForm({ onClose }: { onClose: () => void }) {
  const { investmentClasses, addHolding } = useInvestmentsStore()
  const { activeCycle } = useFinancasStore()
  const fixedIncome = investmentClasses.find((item) => item.id === 'renda-fixa')
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [liquidity, setLiquidity] = useState('')
  const [assetClassId, setAssetClassId] = useState(
    fixedIncome?.id ?? investmentClasses[0]?.id ?? '',
  )
  const [initialAmount, setInitialAmount] = useState(0)
  const [initialKind, setInitialKind] = useState<'opening_balance' | 'contribution'>('opening_balance')
  const [initialCycleMonth, setInitialCycleMonth] = useState(activeCycle.month)
  const [occurredOn, setOccurredOn] = useState(localDateKey)

  const handleAdd = () => {
    if (!name.trim() || !assetClassId || (initialAmount > 0 && (!occurredOn || (initialKind === 'contribution' && !initialCycleMonth)))) return
    if (!addHolding({
      name,
      institution,
      benchmark,
      liquidity,
      assetClassId,
      initialAmount,
      initialKind,
      initialCycleMonth,
      occurredOn,
      purpose: 'emergency_fund',
    })) return
    onClose()
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dark-border bg-dark-surface/60 p-3">
      <h4 className="text-sm font-semibold text-dark-text">Nova posição da reserva</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField label="Produto"><input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: CDB liquidez diária"
          className={inputClass}
        /></FormField>
        <FormField label="Instituição"><input
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          placeholder="Ex.: Inter"
          className={inputClass}
        /></FormField>
        <FormField label="Referência"><input
          value={benchmark}
          onChange={(event) => setBenchmark(event.target.value)}
          placeholder="Ex.: 100% CDI"
          className={inputClass}
        /></FormField>
        <FormField label="Liquidez"><input
          value={liquidity}
          onChange={(event) => setLiquidity(event.target.value)}
          placeholder="Ex.: D+0"
          className={inputClass}
        /></FormField>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-text-muted">
            Classe do ativo
          </span>
          <select
            value={assetClassId}
            onChange={(event) => setAssetClassId(event.target.value)}
            className={inputClass}
          >
            {investmentClasses.map((assetClass) => (
              <option key={assetClass.id} value={assetClass.id}>
                {assetClass.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-semibold uppercase tracking-wide text-dark-text-muted">Origem do valor inicial</span>
        <SegmentedControl options={[{ value: 'opening_balance' as const, label: 'Saldo que já existia' }, { value: 'contribution' as const, label: 'Aporte deste ciclo' }]} value={initialKind} onChange={setInitialKind} />
        <p className="text-xs text-dark-text-muted">{initialKind === 'opening_balance' ? 'Compõe a reserva, sem consumir a verba do ciclo.' : 'Conta como investimento realizado na competência escolhida.'}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Valor inicial</span><CurrencyInput value={initialAmount} onChange={setInitialAmount} /></label>
        <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Data real</span><input type="date" required={initialAmount > 0} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} className={inputClass} /></label>
        {initialKind === 'contribution' && <label className="block"><span className="mb-1 block text-xs text-dark-text-muted">Competência do aporte</span><input type="month" value={initialCycleMonth} onChange={(event) => setInitialCycleMonth(event.target.value)} className={inputClass} /></label>}
      </div>

      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || !assetClassId || (initialAmount > 0 && (!occurredOn || (initialKind === 'contribution' && !initialCycleMonth)))}>
          <Plus size={15} />
          Adicionar à reserva
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </div>
  )
}

export function ReserveSection() {
  const {
    emergencyFund,
    investmentClasses,
    summary,
    setEmergencyFundTargetMonths,
  } = useInvestmentsStore()
  const {
    emergencyFundTarget: target,
    emergencyFundRemaining: remaining,
    emergencyFundProgress: progress,
  } = useMetrics()
  const [showForm, setShowForm] = useState(false)

  const reserveHoldings = summary.reserveHoldings
  const activeReserveHoldings = reserveHoldings.filter((holding) => !holding.archivedAt)
  const archivedReserveHoldings = reserveHoldings.filter((holding) => holding.archivedAt)
  const classById = new Map(investmentClasses.map((item) => [item.id, item]))

  return (
    <Panel>
      <PanelHeader
        title="Reserva de emergência"
        icon={<Shield size={16} />}
        description="A reserva é patrimônio investido, mas tem finalidade própria: segurança e liquidez. Ela não entra no rebalanceamento da carteira de longo prazo."
        actions={
          <div className="text-right leading-tight">
            <p className="text-sm font-semibold tabular-nums text-dark-text">
              {formatCurrency(emergencyFund.current)}
            </p>
            {target > 0 && (
              <p className="text-xs text-dark-text-muted">
                {progress.toFixed(0)}% da meta ({emergencyFund.targetMonths} meses)
              </p>
            )}
          </div>
        }
      />

      <div className="mt-4 space-y-4">
        {target > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-dark-text-muted">Meta: {formatCurrency(target)}</span>
              <span className="text-dark-text-muted">
                {remaining <= 0 ? 'Meta completa' : `Faltam ${formatCurrency(remaining)}`}
              </span>
            </div>
            <Meter
              value={emergencyFund.current}
              max={target}
              color={CHART_PALETTE.blue}
              height={8}
              overIsBad={false}
            />
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-text-muted">
              Meta em meses de custo
            </span>
            <SegmentedControl
              value={emergencyFund.targetMonths}
              onChange={setEmergencyFundTargetMonths}
              options={MONTH_OPTIONS.map((months) => ({ value: months, label: `${months}m` }))}
            />
          </div>
          {!showForm && (
            <SecondaryButton onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Nova alocação
            </SecondaryButton>
          )}
        </div>

        {showForm && <NewReservePositionForm onClose={() => setShowForm(false)} />}

        {activeReserveHoldings.length === 0 && archivedReserveHoldings.length === 0 ? (
          <EmptyState
            icon={<Shield size={26} />}
            title="Diga onde sua reserva está aplicada"
            action={
              !showForm && (
                <PrimaryButton onClick={() => setShowForm(true)}>
                  <Plus size={15} />
                  Adicionar aplicação
                </PrimaryButton>
              )
            }
          >
            Cadastre produto, instituição, referência e liquidez. O saldo continua sendo tratado
            como reserva e também como ativo financeiro.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {activeReserveHoldings.map((holding) => (
              <ReservePositionRow key={holding.id} holding={holding} />
            ))}
            {archivedReserveHoldings.length > 0 && <details className="rounded-lg border border-dark-border-subtle bg-dark-surface/30 p-3">
              <summary className="cursor-pointer text-xs font-medium text-dark-text-secondary">Posições da reserva arquivadas ({archivedReserveHoldings.length})</summary>
              <p className="mt-2 text-xs text-dark-text-muted">Saldos atuais continuam na reserva e aportes antigos permanecem no Histórico.</p>
              <div className="mt-3 space-y-2">{archivedReserveHoldings.map((holding) => <ReservePositionRow key={holding.id} holding={holding} />)}</div>
            </details>}
          </div>
        )}

        {reserveHoldings.length > 0 && (
          <div className="rounded-lg border border-dark-border-subtle bg-dark-card px-3 py-2.5 text-xs leading-relaxed text-dark-text-muted">
            <strong className="text-dark-text">Onde está alocada:</strong>{' '}
            {Array.from(
              reserveHoldings.reduce((acc, holding) => {
                const label = classById.get(holding.assetClassId)?.name ?? 'Sem classe'
                acc.set(label, (acc.get(label) ?? 0) + holding.marketValue)
                return acc
              }, new Map<string, number>()),
            )
              .map(([label, value]) => `${label} ${formatCurrency(value)}`)
              .join(' · ')}
            . Aportes nessas posições contam como investimento realizado no fechamento do ciclo.
          </div>
        )}

        {summary.reserveGain !== 0 && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-dark-text-muted">Rendimento acumulado da reserva</span>
            <Tag>
              <GainLabel
                gain={summary.reserveGain}
                pct={summary.reserveInvested > 0 ? (summary.reserveGain / summary.reserveInvested) * 100 : null}
              />
            </Tag>
          </div>
        )}
      </div>
    </Panel>
  )
}
