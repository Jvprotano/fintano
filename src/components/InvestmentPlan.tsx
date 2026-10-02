import { useState } from 'react'
import { Plus, Scale, Target, Trash2 } from 'lucide-react'
import { Card } from './Card'
import { CurrencyInput } from './CurrencyInput'
import { HeaderMetric } from './HeaderMetric'
import { PrimaryButton, SecondaryButton, SuggestionChip } from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import { useMetrics, useScenarioStore } from '../context/financasStore'
import { DIVERSIFICATION_PRESET_COLORS } from '../types/constants'

const SUGGESTIONS = [
  'Renda Fixa',
  'Ações',
  'Fundos Imobiliários',
  'Criptomoedas',
  'Ações Internacionais',
  'ETFs',
]

export function InvestmentPlan() {
  const {
    diversification,
    updateDiversification,
    addDiversificationSlice,
    removeDiversificationSlice,
    normalizeDiversification,
    assignRemainingToSlice,
    plannedInvestmentAmount,
    setPlannedInvestmentAmount,
  } = useScenarioStore()
  const {
    investmentAllocation,
    budgetAllocation,
    investmentDeductions,
    employerInvestmentContributions,
    directInvestmentTarget,
    totalPlannedInvestment,
    availableForBudget,
    selectedModel,
  } = useMetrics()

  const [newName, setNewName] = useState('')
  const investmentTarget = budgetAllocation.investimentos
  const totalPct = diversification.reduce((s, d) => s + d.percentage, 0)
  const unallocatedPct = 100 - totalPct

  const handlePercentageChange = (id: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, value))
    updateDiversification(
      diversification.map((d) => (d.id === id ? { ...d, percentage: clamped } : d)),
    )
  }

  const handleAdd = (name: string) => {
    if (!name.trim()) return
    const usedColors = new Set(diversification.map((d) => d.color))
    const color =
      DIVERSIFICATION_PRESET_COLORS.find((c) => !usedColors.has(c)) ||
      DIVERSIFICATION_PRESET_COLORS[0]
    if (!addDiversificationSlice(name.trim(), 0, color)) return
    setNewName('')
  }

  return (
    <Card
      title="Plano de aportes"
      icon={<Target size={17} />}
      collapsible
      storageKey="investment-plan"
      headerExtra={
        totalPlannedInvestment > 0 ? (
          <HeaderMetric
            amount={totalPlannedInvestment}
            baseAmount={availableForBudget}
            targetShare={plannedInvestmentAmount === null ? selectedModel.investimentos : undefined}
            label="Investimento"
            tone="primary"
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-3">
          <label className="app-form-label">Aporte total planejado neste ciclo
            <span className="mt-1.5 block max-w-xs"><CurrencyInput
              value={plannedInvestmentAmount ?? 0}
              showZero={plannedInvestmentAmount !== null}
              onEmpty={() => setPlannedInvestmentAmount(null)}
              onChange={setPlannedInvestmentAmount}
              placeholder={formatCurrency(Math.max(0, availableForBudget * selectedModel.investimentos / 100))}
            /></span>
          </label>
          <p className="mt-2 text-xs text-dark-text-muted">
            {plannedInvestmentAmount === null
              ? `Usando a sugestão de ${selectedModel.investimentos}% (${formatCurrency(investmentTarget)}). Informe um valor para decidir em reais.`
              : `Valor definido em reais. ${formatCurrency(investmentDeductions)} vêm da folha; o restante sai da conta.`}
          </p>
          {plannedInvestmentAmount !== null && <button type="button"
            className="mt-2 text-xs text-primary-300 hover:underline"
            onClick={() => setPlannedInvestmentAmount(null)}>Usar sugestão percentual</button>}
        </div>
        {investmentTarget > 0 && (
          <dl className="space-y-1.5 rounded-lg border border-dark-border bg-dark-surface p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-dark-text-secondary">Meta do mês</dt>
              <dd className="font-medium tabular-nums text-dark-text">
                {formatCurrency(investmentTarget)}
              </dd>
            </div>
            {investmentDeductions > 0 && (
              <div className="flex justify-between">
                <dt className="text-dark-text-secondary">Já investido via folha</dt>
                <dd className="font-medium tabular-nums text-dark-text-secondary">
                  − {formatCurrency(investmentDeductions)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-dark-border-subtle pt-1.5">
              <dt className="font-medium text-dark-text">Aporte direto pela conta</dt>
              <dd className="font-semibold tabular-nums text-primary-400">
                {formatCurrency(directInvestmentTarget)}
              </dd>
            </div>
            {employerInvestmentContributions > 0 && (
              <p className="pt-1 text-xs text-dark-text-muted">
                A empresa ainda contribui com {formatCurrency(employerInvestmentContributions)} de
                previdência — bônus que não reduz sua meta.
              </p>
            )}
          </dl>
        )}

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((s) => !diversification.some((d) => d.name === s)).map((s) => (
            <SuggestionChip key={s} label={s} onClick={() => handleAdd(s)} />
          ))}
        </div>

        <div className="flex items-end gap-2">
          <label className="app-form-label min-w-0 flex-1">Classe de ativo<input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd(newName)}
            placeholder="Ex.: renda fixa"
            className={`${inputClass} mt-1.5`}
          /></label>
          <PrimaryButton onClick={() => handleAdd(newName)} disabled={!newName.trim()}>
            <Plus size={15} />
          </PrimaryButton>
        </div>

        {diversification.length > 0 && (
          <div className="space-y-3">
            {diversification.map((slice) => {
              const allocation = investmentAllocation.find((a) => a.id === slice.id)
              return (
                <div key={slice.id} className="group">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="truncate text-sm font-medium text-dark-text">
                        {slice.name}
                      </span>
                      {unallocatedPct > 0 && (
                        <button
                          onClick={() => assignRemainingToSlice(slice.id)}
                          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-dark-text-muted opacity-100 transition-all hover:bg-primary-500/10 hover:text-primary-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                          title={`Somar os ${unallocatedPct}% que sobraram aqui`}
                        >
                          +{unallocatedPct}%
                        </button>
                      )}
                      <button
                        onClick={() => removeDiversificationSlice(slice.id)}
                        className="shrink-0 rounded p-1 text-dark-text-muted opacity-100 transition-all hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Remover ${slice.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      <div className="relative w-14">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={slice.percentage}
                          onChange={(e) =>
                            handlePercentageChange(slice.id, parseInt(e.target.value) || 0)
                          }
                          className="app-field w-full !rounded-lg py-1 pl-2 pr-4 text-right text-xs font-medium tabular-nums"
                          aria-label={`Percentual de ${slice.name}`}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-dark-text-muted">
                          %
                        </span>
                      </div>
                      <span className="w-24 text-right font-medium tabular-nums text-dark-text">
                        {allocation ? formatCurrency(allocation.amount) : '—'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={slice.percentage}
                    onChange={(e) => handlePercentageChange(slice.id, parseInt(e.target.value))}
                    aria-label={`Ajustar ${slice.name}`}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-dark-border accent-primary-500 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary-400 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-400"
                  />
                </div>
              )
            })}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-border-subtle pt-3 text-sm">
              <span className="text-dark-text-secondary">Distribuído</span>
              <span
                className={`font-semibold tabular-nums ${
                  totalPct > 100 ? 'text-rose-400' : 'text-dark-text'
                }`}
              >
                {totalPct}%
                {directInvestmentTarget > 0 &&
                  ` · ${formatCurrency((directInvestmentTarget * Math.min(100, totalPct)) / 100)}`}
              </span>
            </div>

            {totalPct !== 100 && diversification.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <SecondaryButton onClick={normalizeDiversification}>
                  <Scale size={14} />
                  Ajustar para 100%
                </SecondaryButton>
                <span className="text-xs text-dark-text-muted">
                  {totalPct > 100
                    ? 'Reduz os pesos proporcionalmente.'
                    : `Distribui os ${unallocatedPct}% restantes mantendo as proporções.`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
