import { useState } from 'react'
import type { FinancialGoal, GoalCurrency, GoalSummary } from '../types'
import { useInvestmentsStore } from '../context/financasStore'
import { repositoryRevision } from '../data/repositoryCommand'
import { CURRENCY_LABELS, effectiveExchangeRate, exchangeDateLabel, exchangeQuoteIsOld, goalTargetInBrl } from '../lib/exchange'
import { formatCurrency, inputClass } from '../lib/format'
import { CurrencyInput } from './CurrencyInput'
import { PrimaryButton, SecondaryButton } from './ui'

export type GoalTargetDraft = Pick<FinancialGoal, 'targetAmount' | 'currency' | 'marginPct' | 'targetMonth'>

export function GoalTargetFields({ value, onChange }: { value: GoalTargetDraft; onChange: (value: GoalTargetDraft) => void }) {
  const { exchange } = useInvestmentsStore()
  const currency = value.currency ?? 'BRL'
  const foreign = currency !== 'BRL'
  const rate = effectiveExchangeRate(currency, exchange.settings)
  const row = foreign ? exchange.settings.currencies[currency] : null
  const old = row && exchangeQuoteIsOld(row.manualRate ? row.manualUpdatedAt : row.reference?.date)
  return <div className="space-y-2">
    <div className={`grid items-start gap-3 ${foreign ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <label className="block"><span className="app-form-label mb-1 block">Moeda do objetivo</span><select value={currency} className={inputClass} onChange={(event) => onChange({ ...value, currency: event.target.value as GoalCurrency, targetAmount: 0, marginPct: 0 })}>
        {(['BRL', 'EUR', 'USD'] as const).map((code) => <option key={code} value={code}>{CURRENCY_LABELS[code]} · {code}</option>)}
      </select></label>
      <label className="block"><span className="app-form-label mb-1 block">Valor-alvo ({currency})</span><CurrencyInput currency={currency} value={value.targetAmount} onChange={(targetAmount) => onChange({ ...value, targetAmount })} placeholder="Ex.: 5.000,00" /></label>
      <label className="block"><span className="app-form-label mb-1 block">Dinheiro pronto até</span><input type="month" value={value.targetMonth ?? ''} onChange={(event) => onChange({ ...value, targetMonth: event.target.value || undefined })} className={inputClass} /></label>
      {foreign && <label className="block"><span className="app-form-label mb-1 block">Margem de segurança (%)</span><input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={value.marginPct ?? 0} onChange={(event) => onChange({ ...value, marginPct: Math.min(100, Math.max(0, Number(event.target.value))) })} placeholder="Ex.: 5" className={inputClass} /></label>}
    </div>
    {foreign && <p className={`text-xs leading-relaxed ${rate === null || old ? 'text-amber-200' : 'text-dark-text-muted'}`}>{rate === null ? 'Sem cotação: configure esta moeda em Configurações → Cotações para metas. O objetivo será salvo, mas progresso e necessidade em reais ficam pendentes.' : <>
      Necessidade estimada: <strong>{formatCurrency(goalTargetInBrl(value, exchange.settings))}</strong>{(value.marginPct ?? 0) > 0 ? `, incluindo ${value.marginPct}% de margem` : ', sem margem de segurança'}. Custo utilizado: R$ {rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/{currency}{row?.manualRate ? ' · manual' : ` · PTAX de ${exchangeDateLabel(row?.reference?.date)}${row?.costsPct ? ` + ${row.costsPct}% de custos` : ', sem custos adicionais'}`}.{old && ' Cotação antiga; confira em Configurações.'}
    </>}</p>}
    <p className="text-xs text-dark-text-muted">Prazo opcional: escolha quando os recursos precisam estar preparados. Ao trocar a moeda, informe o novo alvo; os saldos guardados continuam em reais.</p>
  </div>
}

function TargetDraft({ goal, onClose }: { goal: GoalSummary; onClose: () => void }) {
  const { updateGoal } = useInvestmentsStore()
  const [value, setValue] = useState<GoalTargetDraft>({ currency: goal.currency, targetAmount: goal.targetAmount, targetMonth: goal.targetMonth, marginPct: goal.marginPct })
  const [revision] = useState(repositoryRevision)
  const [error, setError] = useState('')
  return <form className="space-y-3 rounded-lg border border-dark-border bg-dark-input/25 p-3" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} onSubmit={(event) => {
    event.preventDefault()
    if (!Number.isFinite(value.targetAmount) || value.targetAmount < 0 || value.currency !== 'BRL' && value.targetAmount === 0) { setError('Informe um valor válido; objetivos em moeda estrangeira precisam ser maiores que zero.'); return }
    if (!updateGoal(goal.id, value, revision)) { setError('Os dados mudaram ou não puderam ser salvos. Seu rascunho foi mantido; cancele e reabra para conferir.'); return }
    onClose()
  }}>
    <GoalTargetFields value={value} onChange={setValue} />
    {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
    <div className="flex gap-2"><PrimaryButton type="submit">Salvar objetivo</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
  </form>
}

export function GoalTargetEditor({ goal }: { goal: GoalSummary }) {
  const [editing, setEditing] = useState(false)
  const { exchange } = useInvestmentsStore()
  const row = goal.currency && goal.currency !== 'BRL' ? exchange.settings.currencies[goal.currency] : null
  const date = row?.manualRate ? row.manualUpdatedAt : row?.reference?.date
  return editing ? <TargetDraft goal={goal} onClose={() => setEditing(false)} /> : <div>
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-dark-text-secondary">Objetivo: {formatCurrency(goal.targetAmount, goal.currency)}{(goal.marginPct ?? 0) > 0 ? ` + ${goal.marginPct}% de margem` : ''}{row ? ` · ${formatCurrency(goal.targetAmountBrl)} estimados` : ''}</p>
      <SecondaryButton onClick={() => setEditing(true)}>Editar objetivo e prazo</SecondaryButton>
    </div>
    {row && <p className={`mt-2 text-xs ${exchangeQuoteIsOld(date) ? 'text-amber-200' : 'text-dark-text-muted'}`}>{goal.exchangeRate === null ? 'Cotação pendente em Configurações.' : `Custo utilizado: R$ ${goal.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/${goal.currency} · ${row.manualRate ? 'manual' : `PTAX + ${row.costsPct}% de custos`} · ${exchangeDateLabel(date)}.${exchangeQuoteIsOld(date) ? ' Cotação antiga; confira em Configurações.' : ''}`}</p>}
  </div>
}
