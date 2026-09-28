import { ChartColumn, Landmark } from 'lucide-react'
import type { HistoryPoint } from '../../types'
import { formatCurrency, formatMonthKey } from '../../lib/format'
import { Panel, PanelHeader } from '../ui'

interface CurrentWealth {
  financialAssets: number
  financialNetWorth: number
  physicalAssets: number
  securedLiabilities: number
  netWorth: number
}

function ContributionRow({
  point,
  scale,
  latest,
}: {
  point: HistoryPoint
  scale: number
  latest: boolean
}) {
  const employer = point.employerInvestmentKnown ? point.employerInvested : null
  const credited = point.invested + (employer ?? 0)
  const width = Math.min(100, (Math.abs(credited) / scale) * 100)
  const isWithdrawal = credited < -0.005

  return (
    <div
      className={`grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 rounded-lg px-2.5 py-2 ${
        latest ? 'bg-primary-500/[0.045]' : 'bg-dark-input/20'
      }`}
    >
      <span className="pt-0.5 text-xs font-medium text-dark-text-muted">
        {formatMonthKey(point.month)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <strong
            className={`text-sm tabular-nums ${
              isWithdrawal ? 'text-rose-300' : 'text-dark-text'
            }`}
          >
            {formatCurrency(credited)}
          </strong>
          <span className="text-xs tabular-nums text-dark-text-muted">
            pessoal {formatCurrency(point.invested)} · empresa{' '}
            {employer === null ? 'não informada' : formatCurrency(employer)}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-dark-border-subtle"
          role="img"
          aria-label={`${formatMonthKey(point.month)}: total creditado de ${formatCurrency(credited)}`}
        >
          <span
            className={`block h-full rounded-full ${
              isWithdrawal ? 'bg-rose-400/75' : 'bg-primary-400/80'
            }`}
            style={{ width: `${Math.max(credited === 0 ? 0 : 3, width)}%` }}
          />
        </div>
        <span className="mt-1 block text-xs text-dark-text-muted">
          folha {formatCurrency(point.payrollInvested)} · conta{' '}
          {formatCurrency(point.directInvestedAtClose)} · {point.savingsRate.toFixed(1)}% da renda
          {point.openingBalance > 0.005 && (
            <> · posição inicial {formatCurrency(point.openingBalance)} (não é aporte)</>
          )}
        </span>
      </div>
    </div>
  )
}

function WealthRow({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string
  value: number
  detail: string
  accent?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-dark-text-secondary">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-dark-text-muted">
          {detail}
        </span>
      </div>
      <strong
        className={`shrink-0 text-sm tabular-nums ${
          accent ? 'text-primary-300' : 'text-dark-text'
        }`}
      >
        {formatCurrency(value)}
      </strong>
    </div>
  )
}

export function HistoryOverview({
  points,
  current,
}: {
  points: HistoryPoint[]
  current: CurrentWealth
}) {
  const visiblePoints = points.slice(-6)
  const contributionScale = Math.max(
    1,
    ...visiblePoints.map((point) =>
      Math.abs(point.invested + (point.employerInvestmentKnown ? point.employerInvested : 0)),
    ),
  )
  const unsecuredLiabilities = Math.max(
    0,
    current.financialAssets - current.financialNetWorth,
  )
  const propertyEquity = current.netWorth - current.financialNetWorth

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
      <Panel className="min-w-0">
        <PanelHeader
          title="Investimentos por ciclo"
          icon={<ChartColumn size={16} />}
          description="Total creditado: recursos pessoais mais contrapartida da empresa, com a composição de cada ciclo."
        />
        <div className="mt-3 space-y-1.5">
          {visiblePoints.map((point, index) => (
            <ContributionRow
              key={point.id}
              point={point}
              scale={contributionScale}
              latest={index === visiblePoints.length - 1}
            />
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-dark-text-muted">
          Alterar a competência de uma movimentação atualiza estes ciclos imediatamente. Saldos
          iniciais aparecem como posição de abertura, mas não contam como aporte. Meses antigos sem
          contrapartida registrada aparecem como “não informada”, sem fingir que o valor foi zero.
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          title="Patrimônio hoje"
          icon={<Landmark size={16} />}
          description="Composição atual, separada dos fechamentos mensais."
        />
        <div className="mt-2 divide-y divide-dark-border-subtle">
          <WealthRow
            label="Financeiro líquido"
            value={current.financialNetWorth}
            detail={
              unsecuredLiabilities > 0
                ? `${formatCurrency(current.financialAssets)} em dinheiro e investimentos − ${formatCurrency(unsecuredLiabilities)} em dívidas sem bem`
                : 'dinheiro e investimentos; sem dívidas descobertas'
            }
            accent
          />
          <WealthRow
            label="Patrimônio nos bens"
            value={propertyEquity}
            detail={`${formatCurrency(current.physicalAssets)} em bens − ${formatCurrency(current.securedLiabilities)} financiados`}
          />
          <WealthRow
            label="Patrimônio líquido total"
            value={current.netWorth}
            detail="financeiro líquido + parte já sua nos bens"
          />
        </div>
        <p className="mt-2 rounded-lg border border-dark-border-subtle bg-dark-input/20 px-2.5 py-2 text-xs leading-relaxed text-dark-text-muted">
          Este bloco usa os valores atuais de Patrimônio. Mudar apenas o ciclo de um aporte não
          altera quanto você possui hoje.
        </p>
      </Panel>
    </div>
  )
}
