import type { CardCycleAccounting } from '../../lib/cardCycleAccounting'
import { formatCurrency, formatMonthLong } from '../../lib/format'
import type { BudgetArea, BudgetBucket, CreditCardSummary } from '../../types'
import { BUDGET_AREAS, BUDGET_AREA_COLORS, BUDGET_AREA_SHORT_LABELS } from '../../types/constants'
import { Panel, PanelHeader } from '../ui'

export function CardSummaryPanels({
  summary,
  accounting,
  activeMonth,
  budgetComparison,
  plannedOnCard,
}: {
  summary: CreditCardSummary
  accounting: CardCycleAccounting
  activeMonth: string
  budgetComparison: Record<BudgetArea, BudgetBucket>
  plannedOnCard: number
}) {
  const prepaid = Math.max(
    0,
    accounting.spendingThisCycle.spentPersonalTotal - accounting.spendingThisCycle.duePersonalTotal,
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader
          title={`Área do orçamento · ${formatMonthLong(activeMonth)}`}
          description="Segue a fatura usada para encerrar o ciclo ativo. As áreas distribuem apenas a sua parte devida; valores antecipados ficam fora."
        />
        <div className="mt-3 space-y-1.5">
          {BUDGET_AREAS.map((area) => {
            const realized = accounting.spendingThisCycle.personalByArea[area]
            const planned = budgetComparison[area].actual
            return (
              <div key={area} className="rounded-lg bg-dark-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium text-dark-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BUDGET_AREA_COLORS[area] }} />
                    {BUDGET_AREA_SHORT_LABELS[area]}
                  </span>
                  <strong className="tabular-nums text-dark-text">{formatCurrency(realized)}</strong>
                </div>
                {planned > 0 && <p className="mt-0.5 text-xs tabular-nums text-dark-text-muted">{((realized / planned) * 100).toFixed(0)}% do plano de {formatCurrency(planned)}</p>}
              </div>
            )
          })}
          {accounting.spendingThisCycle.unclassifiedPersonal > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-sm">
              <span className="font-medium text-amber-300">Sem área definida</span>
              <strong className="tabular-nums text-amber-300">{formatCurrency(accounting.spendingThisCycle.unclassifiedPersonal)}</strong>
            </div>
          )}
        </div>
        {plannedOnCard > 0 && (
          <p className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
            Plano no cartão: {formatCurrency(plannedOnCard)} · fatura pessoal do ciclo: {formatCurrency(accounting.invoiceFormedByCycle.personalTotal)}
            {prepaid > 0.005 ? ` · antecipado: ${formatCurrency(prepaid)}` : ''}.
          </p>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Resumo do futuro" />
        <dl className="mt-3 space-y-1.5 text-sm">
          {[
            { label: 'Próximas faturas', value: summary.nextTotal },
            { label: 'Minha parte próxima', value: summary.nextPersonalTotal },
            { label: 'Parcelas restantes', value: summary.remainingInstallmentsTotal },
            { label: 'Minhas parcelas restantes', value: summary.remainingPersonalInstallmentsTotal },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-dark-surface px-3 py-2">
              <dt className="font-medium text-dark-text-secondary">{row.label}</dt>
              <dd className="font-semibold tabular-nums text-dark-text">{formatCurrency(row.value)}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  )
}
