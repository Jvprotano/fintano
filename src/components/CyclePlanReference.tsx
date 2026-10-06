import { useState } from 'react'
import { useFinancasStore } from '../context/financasStore'
import { repositoryRevision } from '../data/repositoryCommand'
import { formatCurrency, formatDate, formatMonthKey } from '../lib/format'
import { SecondaryButton } from './ui'

export function CyclePlanReference() {
  const { scenarios, activeCycle, metrics, planComparison, history } = useFinancasStore()
  const [error, setError] = useState('')
  const closed = history.snapshots.some((item) => item.month === activeCycle.month)
  const rows = [
    ['Salário na conta', planComparison.paycheck, metrics.paycheckInAccount],
    ['Contas fora do cartão', planComparison.costs, metrics.costsOnAccount],
    ['Desejos fora do cartão', planComparison.wants, metrics.wantsOnAccount],
    ['Cartão', planComparison.card, metrics.plannedOnCard],
    ['Investimentos pessoais', planComparison.invested, metrics.totalPlannedInvestment],
  ] as const
  return (
    <div className="border-t border-dark-border-subtle pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-relaxed text-dark-text-muted">
          {planComparison.fixedAt
            ? `Plano de ${formatMonthKey(activeCycle.month)} fixado em ${formatDate(planComparison.fixedAt)}. Ajustes preservam essa referência para o Histórico.`
            : closed ? 'Ciclo fechado. Consulte a comparação em Histórico.'
            : 'Fixe o plano para comparar sua intenção original com o realizado ao fechar o ciclo.'}
        </p>
        {!planComparison.fixedAt && !closed && <SecondaryButton onClick={() => {
          setError(scenarios.fixCurrentPlan(repositoryRevision()) ? '' : 'Não foi possível fixar o plano. Confira o armazenamento e tente novamente.')
        }}>Fixar plano do ciclo</SecondaryButton>}
      </div>
      {planComparison.fixedAt && <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-dark-text-secondary">Consultar plano fixado</summary>
        <div className="mt-3 space-y-2">{rows.map(([label, fixed, current]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-dark-border-subtle pb-2">
            <span className="text-dark-text-secondary">{label}</span>
            <span className="tabular-nums text-dark-text-muted">fixado {formatCurrency(fixed)}{Math.abs(current - fixed) > 0.005 && ` · ajustado ${formatCurrency(current)}`}</span>
          </div>
        ))}</div>
      </details>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
    </div>
  )
}
