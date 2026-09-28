import { Fragment, useState } from 'react'
import { ChartColumn, History, Pencil, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import {
  EmptyState,
  ConfirmButton,
  Panel,
  PanelHeader,
  SecondaryButton,
  StatTile,
  Tag,
} from './ui'
import {
  formatCurrency,
  formatMonthKey,
  formatSignedCurrency,
  inputClass,
} from '../lib/format'
import { useHistoryStore, useInvestmentsStore } from '../context/financasStore'
import type { HistoryPoint, SnapshotPatch } from '../types'
import {
  BUDGET_AREA_LABELS,
  BUDGET_AREAS,
  COST_CATEGORIES,
} from '../types/constants'
import { HistoryOverview } from './history/HistoryOverview'
import { HistoryTrendExplorer } from './history/HistoryTrendExplorer'

/**
 * Correção de um mês já fechado. Refechar substituiria tudo pelos números de
 * hoje — inútil quando o erro está três meses atrás.
 */
function SnapshotEditorContent({ point, onClose }: { point: HistoryPoint; onClose: () => void }) {
  const history = useHistoryStore()
  const set = (patch: SnapshotPatch) => history.updateSnapshot(point.id, patch)

  const fields: { label: string; value: number; key: keyof SnapshotPatch }[] = [
    { label: 'Base do orçamento', value: point.availableForBudget, key: 'availableForBudget' },
    { label: 'Salário na conta', value: point.paycheckInAccount, key: 'paycheckInAccount' },
    { label: 'Entradas extras', value: point.extraIncome, key: 'extraIncome' },
    { label: 'Saídas extraordinárias', value: point.extraExpense, key: 'extraExpense' },
    { label: 'Custos', value: point.costs, key: 'costs' },
    { label: 'Plano de custos', value: point.costsPlanned, key: 'costsPlanned' },
    { label: 'Desejos fora do cartão', value: point.wants, key: 'wants' },
    { label: 'Plano fora do cartão', value: point.wantsPlanned, key: 'wantsPlanned' },
    { label: 'Previdência em folha', value: point.payrollInvested, key: 'payrollInvested' },
    {
      label: point.employerInvestmentKnown
        ? 'Contrapartida da empresa'
        : 'Contrapartida da empresa (não informada)',
      value: point.employerInvested,
      key: 'employerInvested',
    },
    { label: 'Meta de investimento', value: point.investedPlanned, key: 'investedPlanned' },
    { label: 'Ativos financeiros', value: point.grossAssets, key: 'grossAssets' },
    { label: 'Bens', value: point.physicalAssets, key: 'physicalAssets' },
    { label: 'Dívidas', value: point.liabilities, key: 'liabilities' },
    {
      label: 'Dívida com bem',
      value: point.securedLiabilities,
      key: 'securedLiabilities',
    },
    {
      label: 'Fatura do ciclo (minha parte)',
      value: point.cardPersonalTotal,
      key: 'cardPersonalTotal',
    },
    {
      label: 'Plano do cartão',
      value: point.cardPlanned,
      key: 'cardPlanned',
    },
  ]

  return (
    <div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {fields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">{field.label}</span>
              <CurrencyInput
                value={field.value}
                onChange={(value) => set({ [field.key]: value } as SnapshotPatch)}
                className="!py-1.5"
              />
            </label>
          ))}
          <label className="block sm:col-span-2 xl:col-span-4">
            <span className="mb-1 block text-xs text-dark-text-muted">Nota do mês</span>
            <input
              value={point.note ?? ''}
              onChange={(event) => set({ note: event.target.value })}
              placeholder="ex.: 13º salário, mudança de aluguel"
              className={`${inputClass} !py-1.5`}
            />
          </label>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-dark-text-muted">
          Aportes e resgates seguem a competência do livro-razão em Patrimônio. Aqui você
          corrige a previdência em folha, a contrapartida da empresa e os valores congelados no fechamento. A taxa de
          poupança, o saldo e o patrimônio líquido são recalculados a partir dessas fontes.
          “Fatura do ciclo” é a sua parte efetivamente paga na fatura usada para encerrar o mês.
          Valores antecipados já retirados da fatura não são somados novamente. Financeiro: {formatCurrency(point.financialNetWorth)} · líquido total:{' '}
          {formatCurrency(point.grossAssets + point.physicalAssets - point.liabilities)}.
        </p>
        <div className="mt-2.5 flex gap-2">
          <SecondaryButton onClick={onClose}>Fechar</SecondaryButton>
        </div>
    </div>
  )
}

function SnapshotEditor({ point, onClose }: { point: HistoryPoint; onClose: () => void }) {
  return (
    <tr className="border-t border-dark-border-subtle bg-dark-surface/40">
      <td colSpan={9} className="px-5 py-4">
        <SnapshotEditorContent point={point} onClose={onClose} />
      </td>
    </tr>
  )
}

function HistoryActions({
  point,
  editing,
  onToggleEdit,
  onRemove,
  desktop = false,
}: {
  point: HistoryPoint
  editing: boolean
  onToggleEdit: () => void
  onRemove: () => void
  desktop?: boolean
}) {
  const visibility = desktop
    ? 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'
    : ''
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onToggleEdit}
        className={`rounded-md p-1.5 transition-all focus-visible:opacity-100 ${visibility} ${
          editing
            ? 'bg-dark-hover text-dark-text opacity-100'
            : 'text-dark-text-muted hover:bg-dark-hover hover:text-dark-text'
        }`}
        aria-label={`Corrigir ${formatMonthKey(point.month)}`}
        aria-expanded={editing}
      >
        <Pencil size={14} />
      </button>
      <ConfirmButton
        onConfirm={onRemove}
        confirmLabel="Apagar mês"
        className={`!p-1.5 ${visibility}`}
      >
        <Trash2 size={14} />
        <span className="sr-only">Apagar {formatMonthKey(point.month)}</span>
      </ConfirmButton>
    </div>
  )
}

function PlanVariance({
  label,
  planned,
  actual,
  higherIsBetter = false,
}: {
  label: string
  planned: number
  actual: number
  higherIsBetter?: boolean
}) {
  const delta = actual - planned
  const onTarget = Math.abs(delta) <= 0.005
  const favorable = higherIsBetter ? delta >= 0 : delta <= 0

  return (
    <div className="rounded-xl border border-dark-border-subtle bg-dark-input/30 px-3.5 py-3.5 shadow-inner shadow-black/10">
      <span className="block text-xs font-medium uppercase tracking-wider text-dark-text-muted">
        {label}
      </span>
      <strong className="mt-1 block text-base font-semibold tabular-nums text-dark-text">
        {formatCurrency(actual)}
      </strong>
      <span className="mt-1 block text-xs text-dark-text-muted">
        plano {formatCurrency(planned)}
      </span>
      <span
        className={`mt-1.5 block text-xs font-semibold tabular-nums ${
          onTarget
            ? 'text-dark-text-muted'
            : favorable
              ? 'text-primary-400'
              : 'text-rose-400'
        }`}
      >
        {onTarget ? 'No planejado' : formatSignedCurrency(delta)}
      </span>
    </div>
  )
}

function CompactPlanDelta({
  planned,
  actual,
  higherIsBetter = false,
}: {
  planned: number
  actual: number
  higherIsBetter?: boolean
}) {
  const delta = actual - planned
  if (Math.abs(delta) <= 0.005) return null
  const favorable = higherIsBetter ? delta >= 0 : delta <= 0

  return (
    <span
      className={`mt-0.5 block text-xs font-medium tabular-nums ${
        favorable ? 'text-primary-400' : 'text-rose-400'
      }`}
      title={`Planejado ${formatCurrency(planned)}`}
    >
      {formatSignedCurrency(delta)} vs plano
    </span>
  )
}

function WantAllocationDetails({
  point,
  compact = false,
}: {
  point: HistoryPoint
  compact?: boolean
}) {
  if (point.wantAllocations.length === 0) return null
  const title = point.wantAllocations
    .map((allocation) => `${allocation.name}: ${formatCurrency(allocation.actual)}`)
    .join(' · ')

  if (compact) {
    return (
      <span
        className="mt-0.5 block max-w-52 truncate text-xs text-dark-text-muted"
        title={title}
      >
        {point.wantAllocations
          .map((allocation) => `${allocation.name} ${formatCurrency(allocation.actual)}`)
          .join(' · ')}
      </span>
    )
  }

  return (
    <div className="col-span-2 border-t border-dark-border-subtle pt-2">
      <span className="text-dark-text-muted">Distribuição fora do cartão</span>
      <ul className="mt-1.5 space-y-1">
        {point.wantAllocations.map((allocation) => (
          <li
            key={allocation.id}
            className="flex items-center justify-between gap-3 text-dark-text-secondary"
          >
            <span className="min-w-0 truncate">{allocation.name}</span>
            <span className="shrink-0 tabular-nums">{formatCurrency(allocation.actual)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LatestMonthComparison({ points }: { points: HistoryPoint[] }) {
  const latest = points.at(-1)
  if (!latest) return null
  const previous = points.at(-2)

  const categoryChanges = previous
    ? [
        ...COST_CATEGORIES.map(({ key, label }) => ({
          id: `cost-${key}`,
          group: 'Custo',
          label,
          current: latest.costsByCategory[key] ?? 0,
          delta: (latest.costsByCategory[key] ?? 0) - (previous.costsByCategory[key] ?? 0),
        })),
        ...BUDGET_AREAS.map((area) => ({
          id: `card-${area}`,
          group: 'Cartão',
          label: BUDGET_AREA_LABELS[area],
          current: latest.cardByArea[area] ?? 0,
          delta: (latest.cardByArea[area] ?? 0) - (previous.cardByArea[area] ?? 0),
        })),
        ...latest.wantAllocations.map((allocation) => {
          const before = previous.wantAllocations.find(
            (item) => item.id === allocation.id || item.name === allocation.name,
          )
          return {
            id: `want-${allocation.id}`,
            group: 'Desejo fora do cartão',
            label: allocation.name,
            current: allocation.actual,
            delta: allocation.actual - (before?.actual ?? 0),
          }
        }),
      ]
        .filter((item) => Math.abs(item.delta) > 0.005)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6)
    : []

  return (
    <Panel>
      <PanelHeader
        title={`${formatMonthKey(latest.month)}: fechamento contra o plano`}
        icon={<ChartColumn size={16} />}
        description="O sinal mostra realizado menos planejado. Em gastos, positivo e vermelho significa estouro; em investimentos, superar a meta é favorável."
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <PlanVariance label="Custos" planned={latest.costsPlanned} actual={latest.costs} />
        <PlanVariance
          label="Desejos fora do cartão"
          planned={latest.wantsPlanned}
          actual={latest.wants}
        />
        <PlanVariance label="Cartão" planned={latest.cardPlanned} actual={latest.cardPersonalTotal} />
        <PlanVariance
          label="Investimentos"
          planned={latest.investedPlanned}
          actual={latest.invested}
          higherIsBetter
        />
      </div>

      {previous && categoryChanges.length > 0 && (
        <div className="mt-4 border-t border-dark-border-subtle pt-4">
          <span className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">
            Maiores mudanças desde {formatMonthKey(previous.month)}
          </span>
          <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {categoryChanges.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-dark-text-secondary">
                  <span className="text-dark-text-muted">{item.group}</span> · {item.label}
                </span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    item.delta > 0 ? 'text-rose-400' : 'text-primary-400'
                  }`}
                  title={`Agora ${formatCurrency(item.current)}`}
                >
                  {formatSignedCurrency(item.delta)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

/** Só leitura do passado — o fechamento do mês corrente vive na aba Ciclo. */
export function HistoryView() {
  const history = useHistoryStore()
  const investments = useInvestmentsStore()
  const { points, stats } = history
  const [editingId, setEditingId] = useState<string | null>(null)

  const hasLiabilities = points.some((point) => point.liabilities > 0)
  const hasPhysicalAssets = points.some((point) => point.physicalAssets > 0)

  const reversed = [...points].reverse()
  const latestPoint = points.at(-1)

  if (points.length === 0) {
    return (
      <EmptyState icon={<History size={26} />} title="Nenhum mês fechado ainda">
        O histórico só mostra o que você já fechou. Vá em Ciclo para registrar o mês
        corrente — a partir do segundo fechamento aparecem comparações entre ciclos e o custo
        médio real.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Meses fechados"
          value={String(stats.months)}
          detail={`desde ${formatMonthKey(points[0].month)}`}
        />
        <StatTile
          label="Custo médio"
          value={formatCurrency(stats.averageCosts)}
          detail={
            stats.averageCardPersonal > 0
              ? `+ ${formatCurrency(stats.averageCardPersonal)}/mês de fatura pessoal`
              : 'média dos meses fechados'
          }
        />
        <StatTile
          label="Aporte médio"
          value={formatCurrency(stats.averageInvested)}
          detail={`${stats.averageSavingsRate.toFixed(1)}% da renda por ciclo`}
          tone={stats.averageInvested > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Último aporte"
          value={formatCurrency(latestPoint?.invested ?? 0)}
          detail={
            stats.months > 1
              ? `${formatSignedCurrency(latestPoint?.investedDelta ?? 0)} vs ${formatMonthKey(points.at(-2)?.month ?? '')}`
              : formatMonthKey(latestPoint?.month ?? '')
          }
          tone={
            !latestPoint || Math.abs(latestPoint.invested) <= 0.005
              ? 'neutral'
              : latestPoint.invested > 0
                ? 'positive'
                : 'negative'
          }
        />
      </div>

      <LatestMonthComparison points={points} />

      <HistoryOverview
        points={points}
        current={{
          financialAssets: investments.summary.financialAssets,
          financialNetWorth: investments.summary.financialNetWorth,
          physicalAssets: investments.summary.physicalAssets,
          securedLiabilities: investments.summary.securedLiabilities,
          netWorth: investments.summary.netWorth,
        }}
      />

      <HistoryTrendExplorer points={points} />

      <Panel padded={false}>
        <h3 className="border-b border-dark-border-subtle px-5 py-4 text-sm font-semibold tracking-tight text-dark-text">
          Meses fechados
        </h3>
        <div className="space-y-2 p-3 sm:hidden">
          {reversed.map((point) => {
            const editing = editingId === point.id
            return (
              <article
                key={point.id}
                className="rounded-lg border border-dark-border-subtle bg-dark-surface/45 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-dark-text">{formatMonthKey(point.month)}</h4>
                    {point.note && <p className="mt-0.5 text-xs text-dark-text-muted">{point.note}</p>}
                  </div>
                  <HistoryActions
                    point={point}
                    editing={editing}
                    onToggleEdit={() => setEditingId(editing ? null : point.id)}
                    onRemove={() => history.removeSnapshot(point.id)}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-dark-text-muted">Renda</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">
                      {formatCurrency(point.availableForBudget + point.extraIncome)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-dark-text-muted">Custos</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">{formatCurrency(point.costs)}</dd>
                    <CompactPlanDelta planned={point.costsPlanned} actual={point.costs} />
                  </div>
                  <div>
                    <dt className="text-dark-text-muted">Investido</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">{formatCurrency(point.invested)}</dd>
                    <CompactPlanDelta
                      planned={point.investedPlanned}
                      actual={point.invested}
                      higherIsBetter
                    />
                  </div>
                  <div>
                    <dt className="text-dark-text-muted">Fatura pessoal</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">
                      {formatCurrency(point.cardPersonalTotal)}
                    </dd>
                    <CompactPlanDelta planned={point.cardPlanned} actual={point.cardPersonalTotal} />
                  </div>
                  <div>
                    <dt className="text-dark-text-muted">Desejos fora do cartão</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">{formatCurrency(point.wants)}</dd>
                    <CompactPlanDelta planned={point.wantsPlanned} actual={point.wants} />
                  </div>
                  <div>
                    <dt className="text-dark-text-muted">Poupança</dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">{point.savingsRate.toFixed(0)}%</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-dark-text-muted">
                      {hasLiabilities || hasPhysicalAssets ? 'Patrimônio líquido' : 'Patrimônio'}
                    </dt>
                    <dd className="mt-0.5 tabular-nums text-dark-text">{formatCurrency(point.netWorth)}</dd>
                  </div>
                  <WantAllocationDetails point={point} />
                </dl>
                {(point.extraIncome > 0.005 || point.extraExpense > 0.005) && (
                  <div className="mt-3 border-t border-dark-border-subtle pt-2 text-xs leading-relaxed">
                    {point.extraIncome > 0.005 && (
                      <p className="text-primary-300">+ {formatCurrency(point.extraIncome)} em entradas extras</p>
                    )}
                    {point.extraExpense > 0.005 && (
                      <p className="text-amber-300">− {formatCurrency(point.extraExpense)} em saídas extraordinárias</p>
                    )}
                  </div>
                )}
                {editing && (
                  <div className="mt-3 border-t border-dark-border-subtle pt-3">
                    <SnapshotEditorContent point={point} onClose={() => setEditingId(null)} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-dark-text-muted">
                <th className="px-5 py-2.5 font-medium">Mês</th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  title="Base recorrente do orçamento mais entradas extras recebidas"
                >
                  Renda
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Custos</th>
                <th className="px-4 py-2.5 text-right font-medium">Desejos fora do cartão</th>
                <th className="px-4 py-2.5 text-right font-medium">Investido</th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  title="Sua parte da fatura usada para encerrar o ciclo"
                >
                  Fatura
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Poupança</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  {hasLiabilities || hasPhysicalAssets ? 'Líquido' : 'Patrimônio'}
                </th>
                <th className="px-5 py-2.5 text-right font-medium sr-only">Ações</th>
              </tr>
            </thead>
            <tbody>
              {reversed.map((point) => (
                <Fragment key={point.id}>
                  <tr className="group border-t border-dark-border-subtle">
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-dark-text">
                        {formatMonthKey(point.month)}
                      </span>
                      {point.note && (
                        <span className="ml-2 text-xs text-dark-text-muted">{point.note}</span>
                      )}
                      {point.extraIncome > 0.005 && (
                        <span
                          className="mt-0.5 block max-w-64 truncate text-xs text-primary-300"
                          title={point.extraIncomeEntries
                            .map((entry) => `${entry.name}: ${formatCurrency(entry.amount)}`)
                            .join(' · ')}
                        >
                          + {formatCurrency(point.extraIncome)} extra
                          {point.extraIncomeEntries.length > 0
                            ? ` · ${point.extraIncomeEntries.map((entry) => entry.name).join(', ')}`
                            : ''}
                        </span>
                      )}
                      {point.extraExpense > 0.005 && (
                        <span
                          className="mt-0.5 block max-w-64 truncate text-xs text-amber-300"
                          title={point.extraExpenseEntries
                            .map((entry) => `${entry.name}: ${formatCurrency(entry.amount)}`)
                            .join(' · ')}
                        >
                          − {formatCurrency(point.extraExpense)} extraordinário
                          {point.extraExpenseEntries.length > 0
                            ? ` · ${point.extraExpenseEntries.map((entry) => entry.name).join(', ')}`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary"
                      title={
                        point.extraIncome > 0.005
                          ? `Base ${formatCurrency(point.availableForBudget)} + extras ${formatCurrency(point.extraIncome)}`
                          : 'Base recorrente do orçamento'
                      }
                    >
                      {formatCurrency(point.availableForBudget + point.extraIncome)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                      {formatCurrency(point.costs)}
                      {point.costsDelta !== null && Math.abs(point.costsDelta) > 0.005 && (
                        <span
                          className={`ml-1.5 text-xs ${
                            point.costsDelta > 0 ? 'text-rose-400' : 'text-primary-400'
                          }`}
                        >
                          {point.costsDelta > 0 ? '↑' : '↓'}
                        </span>
                      )}
                      <CompactPlanDelta planned={point.costsPlanned} actual={point.costs} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                      {formatCurrency(point.wants)}
                      <CompactPlanDelta planned={point.wantsPlanned} actual={point.wants} />
                      <WantAllocationDetails point={point} compact />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                      {formatCurrency(point.invested)}
                      <CompactPlanDelta
                        planned={point.investedPlanned}
                        actual={point.invested}
                        higherIsBetter
                      />
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary"
                      title="Sua parte efetivamente devida na fatura que encerrou o ciclo"
                    >
                      {point.cardPersonalTotal > 0 ? formatCurrency(point.cardPersonalTotal) : '—'}
                      <CompactPlanDelta planned={point.cardPlanned} actual={point.cardPersonalTotal} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-dark-text-secondary">
                      {point.savingsRate.toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-dark-text">
                      {formatCurrency(point.netWorth)}
                      {point.netWorthDelta !== null && (
                        <span
                          className={`ml-1.5 text-xs ${
                            point.netWorthDelta >= 0 ? 'text-primary-400' : 'text-rose-400'
                          }`}
                        >
                          {point.netWorthDelta >= 0 ? '+' : '−'}
                          {formatCurrency(Math.abs(point.netWorthDelta)).replace('R$', '').trim()}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right">
                      <HistoryActions
                        point={point}
                        editing={editingId === point.id}
                        onToggleEdit={() =>
                          setEditingId((prev) => (prev === point.id ? null : point.id))
                        }
                        onRemove={() => history.removeSnapshot(point.id)}
                        desktop
                      />
                    </td>
                  </tr>
                  {editingId === point.id && (
                    <SnapshotEditor point={point} onClose={() => setEditingId(null)} />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {stats.bestSavingsMonth && stats.months > 1 && (
          <p className="border-t border-dark-border-subtle px-5 py-3 text-xs text-dark-text-muted">
            Melhor mês de poupança:{' '}
            <Tag>{formatMonthKey(stats.bestSavingsMonth.month)}</Tag> com{' '}
            {stats.bestSavingsMonth.savingsRate.toFixed(0)}%.
          </p>
        )}
      </Panel>
    </div>
  )
}
