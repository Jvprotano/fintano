import { useState } from 'react'
import { Plus, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { Card } from './Card'
import { CurrencyInput } from './CurrencyInput'
import { HeaderMetric } from './HeaderMetric'
import { PrimaryButton, SegmentedControl } from './ui'
import { formatCurrency, inputClass, selectClass } from '../lib/format'
import { useInvestmentsStore, useMetrics, useScenarioStore } from '../context/financasStore'
import type { DeductionType } from '../types'
import { DEDUCTION_TYPE_LABELS, INVESTMENT_DEDUCTION_TYPES } from '../types/constants'

const isInvestmentType = (t: DeductionType) => INVESTMENT_DEDUCTION_TYPES.includes(t)

export function IncomePanel() {
  const {
    salaryNet,
    setSalaryNet,
    salaryInputMode,
    setSalaryInputMode,
    deductions,
    addDeduction,
    removeDeduction,
    updateDeductionEmployerContribution,
    updateDeductionHolding,
  } = useScenarioStore()
  const { summary: investmentsSummary } = useInvestmentsStore()
  const { paycheckInAccount, totalDeductions, availableForBudget } = useMetrics()

  const [name, setName] = useState('')
  const [value, setValue] = useState(0)
  const [employerContribution, setEmployerContribution] = useState(0)
  const [linkedHoldingId, setLinkedHoldingId] = useState('')
  const [type, setType] = useState<DeductionType>('previdencia_privada')
  const isTakeHome = salaryInputMode === 'take_home'
  const isInvestment = isInvestmentType(type)

  const handleAdd = () => {
    if (!name.trim() || value <= 0) return
    addDeduction(
      name.trim(),
      value,
      type,
      isInvestment ? employerContribution : 0,
      isInvestment && linkedHoldingId ? linkedHoldingId : undefined,
    )
    setName('')
    setValue(0)
    setEmployerContribution(0)
    setLinkedHoldingId('')
  }

  return (
    <Card
      title="Renda"
      icon={<Wallet size={17} />}
      collapsible
      storageKey="income"
      headerExtra={
        salaryNet > 0 ? (
          <HeaderMetric amount={availableForBudget} label="Base" tone="primary" baseAmount={0} />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="salary"
            className="mb-1.5 block text-sm font-medium text-dark-text-secondary"
          >
            Salário mensal
          </label>
          <CurrencyInput id="salary" value={salaryNet} onChange={setSalaryNet} />
          <SegmentedControl
            className="mt-2"
            value={salaryInputMode}
            onChange={setSalaryInputMode}
            options={[
              { value: 'before_payroll_deductions', label: 'Antes dos descontos' },
              { value: 'take_home', label: 'Valor que cai na conta' },
            ]}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-dark-text-muted">
            {isTakeHome
              ? 'O valor informado já é líquido: os descontos abaixo não são abatidos de novo, e a previdência em folha volta a contar como investimento na base.'
              : 'Os descontos abaixo serão abatidos do valor informado. Benefícios saem da base do orçamento; previdência continua contando como investimento.'}
          </p>
        </div>

        <div className="space-y-3 border-t border-dark-border-subtle pt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-dark-text-secondary">Descontos em folha</h3>
            {totalDeductions > 0 && (
              <span className="text-xs tabular-nums text-dark-text-muted">
                {formatCurrency(totalDeductions)}/mês
              </span>
            )}
          </div>

          {deductions.length > 0 && (
            <ul className="space-y-1.5">
              {deductions.map((deduction) => {
                const investment = isInvestmentType(deduction.type)
                const contribution = deduction.employerContribution ?? 0

                return (
                  <li key={deduction.id} className="group rounded-lg bg-dark-surface px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-dark-text">
                          {deduction.name}
                          {investment && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-300">
                              <TrendingUp size={10} />
                              Investimento
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-dark-text-muted">
                          {DEDUCTION_TYPE_LABELS[deduction.type]}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-sm font-medium tabular-nums text-dark-text">
                          {formatCurrency(deduction.value)}
                        </span>
                        <button
                          onClick={() => removeDeduction(deduction.id)}
                          className="rounded-md p-1.5 text-dark-text-muted opacity-100 transition-all hover:bg-rose-500/10 hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`Remover ${deduction.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {investment && (
                      <div className="mt-2 grid gap-2 border-t border-dark-border-subtle pt-2 text-xs sm:grid-cols-2">
                        <label className="text-dark-text-muted">
                          <span className="mb-1 block">Empresa contribui</span>
                          <CurrencyInput
                            value={contribution}
                            onChange={(next) =>
                              updateDeductionEmployerContribution(deduction.id, next)
                            }
                            className="!py-1.5 !text-xs"
                          />
                        </label>
                        <label className="text-dark-text-muted">
                          <span className="mb-1 block">Posição patrimonial</span>
                          <select
                            value={deduction.linkedHoldingId ?? ''}
                            onChange={(event) =>
                              updateDeductionHolding(deduction.id, event.target.value || undefined)
                            }
                            className={`${selectClass} !py-1.5 !text-xs`}
                          >
                            <option value="">Não vinculada</option>
                            {investmentsSummary.allHoldings.map((holding) => (
                              <option key={holding.id} value={holding.id}>
                                {holding.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className="tabular-nums text-dark-text-secondary sm:col-span-2">
                          Total creditado/mês:{' '}
                          <strong className="text-dark-text">
                            {formatCurrency(deduction.value + contribution)}
                          </strong>
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="rounded-lg border border-dark-border bg-dark-surface/60 p-3">
            <p className="mb-3 text-sm font-semibold text-dark-text">Novo desconto em folha</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="app-form-label">Nome<input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Ex.: Previdência XP"
                className={`${inputClass} mt-1.5`}
              /></label>
              <label className="app-form-label">Tipo<select
                value={type}
                onChange={(e) => setType(e.target.value as DeductionType)}
                className={`${selectClass} mt-1.5`}
              >
                {(Object.entries(DEDUCTION_TYPE_LABELS) as [DeductionType, string][]).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ),
                )}
              </select></label>
              <label className="app-form-label">Seu desconto<span className="mt-1.5 block"><CurrencyInput value={value} onChange={setValue} /></span></label>
              {isInvestment && (
                <>
                  <label className="app-form-label">Contrapartida da empresa<span className="mt-1.5 block"><CurrencyInput
                    value={employerContribution}
                    onChange={setEmployerContribution}
                  /></span></label>
                  <label className="app-form-label">Posição patrimonial<select
                    value={linkedHoldingId}
                    onChange={(event) => setLinkedHoldingId(event.target.value)}
                    className={`${selectClass} mt-1.5`}
                    aria-label="Posição patrimonial vinculada"
                  >
                    <option value="">Posição patrimonial (opcional)</option>
                    {investmentsSummary.allHoldings.map((holding) => (
                      <option key={holding.id} value={holding.id}>
                        {holding.name}
                      </option>
                    ))}
                  </select></label>
                </>
              )}
            </div>
            <PrimaryButton
              onClick={handleAdd}
              disabled={!name.trim() || value <= 0}
              className="mt-2 w-full"
            >
              <Plus size={15} />
              Adicionar desconto
            </PrimaryButton>
          </div>
        </div>

        {salaryNet > 0 && (
          <dl className="grid grid-cols-2 gap-2 border-t border-dark-border-subtle pt-4 text-sm">
            <div className="rounded-lg bg-dark-surface px-3 py-2.5">
              <dt className="text-xs text-dark-text-muted">Cai na conta</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-dark-text">
                {formatCurrency(paycheckInAccount)}
              </dd>
            </div>
            <div className="rounded-lg bg-primary-500/10 px-3 py-2.5">
              <dt className="text-xs text-primary-300">Base do orçamento</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-primary-300">
                {formatCurrency(availableForBudget)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </Card>
  )
}
