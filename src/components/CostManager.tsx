import { useState, type ReactNode } from 'react'
import { CreditCard, Landmark, Plus, Receipt, SlidersHorizontal, Trash2, Users } from 'lucide-react'
import { Card } from './Card'
import { CurrencyInput } from './CurrencyInput'
import { HeaderMetric } from './HeaderMetric'
import { Meter, PrimaryButton, SegmentedControl, SuggestionChip, Tag } from './ui'
import { formatCurrency, inputClass, selectClass } from '../lib/format'
import { personalCostValue } from '../lib/scenario'
import { useCardsStore, useMetrics, useScenarioStore } from '../context/financasStore'
import type { CostCategory, PaymentMethod } from '../types'
import {
  BUDGET_AREA_COLORS,
  COST_CATEGORIES,
  COST_CATEGORY_COLORS,
  COST_CATEGORY_LABELS,
} from '../types/constants'

const QUICK_SUGGESTIONS: { cat: CostCategory; name: string }[] = [
  { cat: 'moradia', name: 'Aluguel' },
  { cat: 'moradia', name: 'Condomínio' },
  { cat: 'contas', name: 'Energia' },
  { cat: 'contas', name: 'Internet' },
  { cat: 'contas', name: 'Celular' },
  { cat: 'alimentacao', name: 'Supermercado' },
  { cat: 'transporte', name: 'Combustível' },
  { cat: 'saude', name: 'Academia' },
]

const PAYMENT_OPTIONS: { value: PaymentMethod; label: ReactNode }[] = [
  {
    value: 'account',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Landmark size={12} />
        Conta
      </span>
    ),
  },
  {
    value: 'card',
    label: (
      <span className="inline-flex items-center gap-1.5">
        <CreditCard size={12} />
        Cartão
      </span>
    ),
  },
]

export function CostManager() {
  const { costs, addCost, updateCost, removeCost } = useScenarioStore()
  const metrics = useMetrics()
  const { summary } = useCardsStore()

  const [name, setName] = useState('')
  const [value, setValue] = useState(0)
  const [category, setCategory] = useState<CostCategory>('moradia')
  const [sharedAmount, setSharedAmount] = useState(0)
  const [sharedWith, setSharedWith] = useState('')
  const [splitting, setSplitting] = useState(false)
  const [paidWith, setPaidWith] = useState<PaymentMethod>('account')
  const [editingId, setEditingId] = useState<string | null>(null)

  const {
    totalCosts,
    totalCostsGross,
    totalCostsShared,
    costsOnCard,
    availableForBudget,
    selectedModel,
  } = metrics
  const necessidadesTarget = metrics.budgetAllocation.necessidades
  const remaining = necessidadesTarget - totalCosts
  const realized = summary.personalByArea.necessidades
  const selectedCat = COST_CATEGORIES.find((c) => c.key === category)

  const handleAdd = () => {
    if (!name.trim() || value <= 0) return
    addCost({
      name: name.trim(),
      value,
      category,
      sharedAmount: splitting ? Math.min(sharedAmount, value) : 0,
      sharedWith: splitting ? sharedWith : '',
      paidWith,
    })
    setName('')
    setValue(0)
    setSharedAmount(0)
    setSharedWith('')
    setSplitting(false)
  }

  const sortedCosts = [...costs].sort((a, b) => personalCostValue(b) - personalCostValue(a))

  return (
    <Card
      title="Custos fixos"
      icon={<Receipt size={17} />}
      collapsible
      storageKey="costs"
      headerExtra={
        totalCosts > 0 ? (
          <HeaderMetric
            amount={totalCosts}
            baseAmount={availableForBudget}
            targetShare={selectedModel.necessidades}
            label="Total"
            tone="slate"
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        {necessidadesTarget > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-dark-text-muted">
                Meta de necessidades: {formatCurrency(necessidadesTarget)}
              </span>
              <span
                className={`font-medium tabular-nums ${
                  remaining >= 0 ? 'text-primary-400' : 'text-rose-400'
                }`}
              >
                {remaining >= 0
                  ? `${formatCurrency(remaining)} de folga`
                  : `${formatCurrency(-remaining)} acima`}
              </span>
            </div>
            <Meter value={totalCosts} max={necessidadesTarget} color={BUDGET_AREA_COLORS.necessidades} />
            {(realized > 0 || costsOnCard > 0) && (
              <p className="mt-1.5 text-xs leading-relaxed text-dark-text-muted">
                {costsOnCard > 0 && (
                  <>
                    <strong className="text-dark-text-secondary">
                      {formatCurrency(costsOnCard)}
                    </strong>{' '}
                    deste plano passa no cartão.{' '}
                  </>
                )}
                {realized > 0 && (
                  <>
                    A fatura já registrou {formatCurrency(realized)} em necessidades — é o mesmo
                    dinheiro do plano aparecendo realizado, não um gasto a mais.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {totalCostsShared > 0 && (
          <p className="rounded-lg bg-dark-surface px-3 py-2 text-xs text-dark-text-secondary">
            Contas de {formatCurrency(totalCostsGross)} no total —{' '}
            <strong className="text-dark-text">{formatCurrency(totalCostsShared)}</strong> são de
            terceiros e ficam fora do seu orçamento.
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {QUICK_SUGGESTIONS.filter((s) => !costs.some((c) => c.name === s.name)).map((s) => (
            <SuggestionChip
              key={s.name}
              label={s.name}
              onClick={() => {
                setCategory(s.cat)
                setName(s.name)
              }}
            />
          ))}
        </div>

        <div className="rounded-lg border border-dark-border bg-dark-surface/60 p-3">
          <p className="mb-3 text-sm font-semibold text-dark-text">Novo custo fixo</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="app-form-label">Nome<input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Ex.: aluguel"
              className={`${inputClass} mt-1.5`}
            /></label>
            <label className="app-form-label">Categoria<select
              value={category}
              onChange={(e) => setCategory(e.target.value as CostCategory)}
              className={`${selectClass} mt-1.5`}
            >
              {COST_CATEGORIES.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select></label>
          </div>
          {selectedCat && (
            <p className="mt-1.5 px-1 text-xs text-dark-text-muted">Ex: {selectedCat.hint}</p>
          )}
          <div className="mt-2 flex items-end gap-2">
            <label className="app-form-label min-w-0 flex-1">Valor cheio da conta<span className="mt-1.5 block"><CurrencyInput value={value} onChange={setValue} /></span></label>
            <PrimaryButton onClick={handleAdd} disabled={!name.trim() || value <= 0}>
              <Plus size={15} />
              Adicionar
            </PrimaryButton>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-xs text-dark-text-muted">Pago por</span>
              <SegmentedControl
                options={PAYMENT_OPTIONS}
                value={paidWith}
                onChange={setPaidWith}
                className="w-40"
              />
            </label>
            <button
              type="button"
              onClick={() => setSplitting((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                splitting ? 'text-primary-300' : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              <Users size={13} />
              {splitting ? 'Não dividir esta conta' : 'Dividir com outra pessoa'}
            </button>
          </div>

          {splitting && (
            <div className="mt-2 grid gap-2 border-t border-dark-border-subtle pt-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-dark-text-muted">
                  Parte da outra pessoa
                </span>
                <CurrencyInput value={sharedAmount} onChange={setSharedAmount} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-text-muted">Com quem</span>
                <input
                  type="text"
                  value={sharedWith}
                  onChange={(e) => setSharedWith(e.target.value)}
                  placeholder="ex.: Ana"
                  className={inputClass}
                />
              </label>
              {value > 0 && (
                <p className="text-xs text-dark-text-muted sm:col-span-2">
                  Entra no orçamento:{' '}
                  <strong className="tabular-nums text-dark-text">
                    {formatCurrency(Math.max(0, value - Math.min(sharedAmount, value)))}
                  </strong>
                </p>
              )}
            </div>
          )}
        </div>

        {sortedCosts.length > 0 && (
          <ul className="space-y-1.5">
            {sortedCosts.map((cost) => {
              const personal = personalCostValue(cost)
              const shared = cost.sharedAmount ?? 0
              const isEditing = editingId === cost.id

              return (
                <li key={cost.id} className="group rounded-lg bg-dark-surface px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: COST_CATEGORY_COLORS[cost.category] }}
                      />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-dark-text">
                          {cost.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
                          {COST_CATEGORY_LABELS[cost.category]}
                          {cost.paidWith === 'card' && (
                            <Tag>
                              <CreditCard size={10} />
                              no cartão
                            </Tag>
                          )}
                          {shared > 0 && (
                            <Tag>
                              <Users size={10} />
                              {formatCurrency(shared)} de {cost.sharedWith || 'outra pessoa'}
                            </Tag>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="text-right">
                        <span className="block text-sm font-medium tabular-nums text-dark-text">
                          {formatCurrency(personal)}
                        </span>
                        {shared > 0 && (
                          <span className="block text-xs tabular-nums text-dark-text-muted">
                            de {formatCurrency(cost.value)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setEditingId(isEditing ? null : cost.id)}
                        className="rounded-md p-1.5 text-dark-text-muted opacity-100 transition-all hover:text-dark-text [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Editar ${cost.name}`}
                        title="Forma de pagamento e rateio"
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        onClick={() => removeCost(cost.id)}
                        className="rounded-md p-1.5 text-dark-text-muted opacity-100 transition-all hover:bg-rose-500/10 hover:text-rose-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Remover ${cost.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-2.5 grid gap-2 border-t border-dark-border-subtle pt-2.5 sm:grid-cols-3">
                      <label className="block sm:col-span-3">
                        <span className="mb-1 block text-xs text-dark-text-muted">
                          Pago por — o que passa no cartão só sai da conta quando a fatura vence
                        </span>
                        <SegmentedControl
                          options={PAYMENT_OPTIONS}
                          value={cost.paidWith ?? 'account'}
                          onChange={(next) => updateCost(cost.id, { paidWith: next })}
                          className="max-w-52"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-dark-text-muted">
                          Valor cheio
                        </span>
                        <CurrencyInput
                          value={cost.value}
                          onChange={(next) => updateCost(cost.id, { value: next })}
                          className="!py-1.5"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-dark-text-muted">
                          Parte de terceiros
                        </span>
                        <CurrencyInput
                          value={shared}
                          onChange={(next) =>
                            updateCost(cost.id, {
                              sharedAmount: Math.min(next, cost.value) || undefined,
                            })
                          }
                          className="!py-1.5"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-dark-text-muted">Com quem</span>
                        <input
                          type="text"
                          value={cost.sharedWith ?? ''}
                          onChange={(e) =>
                            updateCost(cost.id, { sharedWith: e.target.value || undefined })
                          }
                          placeholder="ex.: Ana"
                          className={`${inputClass} !py-1.5`}
                        />
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
