import { useState, type FormEvent } from 'react'
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  Check,
  ClipboardCheck,
  Minus,
  Plus,
  RotateCcw,
  Wand2,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { EmptyState, Panel, PanelHeader, SecondaryButton, Tag } from './ui'
import { formatCurrency, formatMonthLong } from '../lib/format'
import { useActualsStore, useCardsStore, useForecastStore, useMetrics } from '../context/financasStore'
import { COST_CATEGORY_COLORS, COST_CATEGORY_LABELS } from '../types/constants'
import { ActualCashEntries } from './ActualCashEntries'
import { reconcileOccurrence } from '../lib/forecastCoverage'

// ---------------------------------------------------------------------------
// Realizado do mês.
//
// O cartão já entrega o realizado — a fatura é a lista do que aconteceu. Débito
// e boleto não: a luz orçada em R$ 200 vem R$ 260 e o plano nunca soube. Sem
// isto, o "custo médio" do histórico é a média dos planos, e a meta da reserva
// de emergência herda o mesmo otimismo.
//
// Campo vazio significa "não sei ainda, use o planejado" — nunca zero.
// ---------------------------------------------------------------------------

type AdjustmentMode = 'add' | 'subtract'

export function CostAdjustmentControl({
  costName,
  onAdjust,
}: {
  costName: string
  onAdjust: (delta: number) => boolean
}) {
  const [mode, setMode] = useState<AdjustmentMode | null>(null)
  const [amount, setAmount] = useState(0)

  const open = (nextMode: AdjustmentMode) => {
    setAmount(0)
    setMode((current) => (current === nextMode ? null : nextMode))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!mode || amount <= 0) return
    if (!onAdjust(mode === 'add' ? amount : -amount)) return
    setAmount(0)
    setMode(null)
  }

  const action = mode === 'add' ? 'adicionar' : 'diminuir'

  return (
    <div className="flex shrink-0 items-center gap-1">
      {mode && (
        <form onSubmit={submit} className="flex items-center gap-1">
          <div className="w-24">
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              placeholder="0,00"
              className="!py-1 !pl-8 !pr-1.5 !text-xs"
              autoFocus
              ariaLabel={`Valor para ${action} em ${costName}`}
            />
          </div>
          <button
            type="submit"
            disabled={amount <= 0}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-dark-border-subtle bg-dark-input px-1.5 text-xs font-semibold text-dark-text-secondary transition-colors hover:border-primary-500/40 hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`Confirmar valor para ${action} em ${costName}`}
            title="Confirmar ajuste"
          >
            <Check size={11} />
            OK
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={() => open('add')}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-primary-400 transition-colors hover:bg-primary-500/10 ${
          mode === 'add' ? 'bg-primary-500/10 ring-1 ring-primary-500/30' : ''
        }`}
        aria-label={`Adicionar valor a ${costName}`}
        title="Adicionar ao custo"
        aria-pressed={mode === 'add'}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => open('subtract')}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-400 transition-colors hover:bg-rose-500/10 ${
          mode === 'subtract' ? 'bg-rose-500/10 ring-1 ring-rose-500/30' : ''
        }`}
        aria-label={`Diminuir valor de ${costName}`}
        title="Diminuir do custo"
        aria-pressed={mode === 'subtract'}
      >
        <Minus size={14} />
      </button>
    </div>
  )
}

export function ActualsPanel({ onGoToCards, onGoToPlanning }: { onGoToCards: () => void; onGoToPlanning: () => void }) {
  const actuals = useActualsStore()
  const forecast = useForecastStore()
  const cards = useCardsStore()
  const metrics = useMetrics()
  const { summary } = actuals
  const {
    rows,
    effectiveCosts,
    confirmedCosts,
    pendingCosts,
    plannedCosts,
    variance,
    informedCount,
    effectiveWants,
    confirmedWants,
    pendingWants,
    plannedWants,
    wantsVariance,
    informedWantsCount,
    wantRows,
    extraIncome,
    extraExpenses,
  } = summary
  const today = new Date().toISOString().slice(0, 10)
  const cycleEvents = forecast.monthOccurrences
    .map((occurrence) => reconcileOccurrence(occurrence, actuals.months, today, cards.entries, cards.paidInvoices))
  const pending = cycleEvents
    .filter((occurrence) => occurrence.remainingAmount > 0.005)
  const expectedIncome = pending.filter((occurrence) => occurrence.event.kind === 'income')
  const expectedExpenses = pending.filter((occurrence) => occurrence.event.kind === 'expense' &&
    occurrence.event.cashTreatment !== 'planned' && occurrence.event.cashTreatment !== 'card')

  return (
    <Panel>
      <PanelHeader
        title={`Realizado de ${formatMonthLong(summary.month)}`}
        icon={<ClipboardCheck size={16} />}
        description="Registre o que entrou, o que saiu e os Desejos destinados fora do cartão."
        actions={
          <>
            <span className="text-right">
              <span className="block text-xs uppercase tracking-wider text-dark-text-muted">
                Custos do mês
              </span>
              <strong className="block text-lg font-semibold tabular-nums text-dark-text">
                {formatCurrency(confirmedCosts)}
              </strong>
            </span>
            {(rows.length > 0 || wantRows.length > 0) && (
              <SecondaryButton onClick={() => actuals.fillFromPlan()}>
                <Wand2 size={14} />
                Confirmar pendentes como no plano
              </SecondaryButton>
            )}
            {informedCount > 0 && (
              <SecondaryButton onClick={() => actuals.clearCosts()} tone="danger">
                <RotateCcw size={14} />
                Limpar custos
              </SecondaryButton>
            )}
          </>
        }
      />

      <div className="mt-4 rounded-xl border border-dark-border bg-dark-surface/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-dark-text">Folha recebida</h3>
            <p className="text-xs text-dark-text-muted">Plano em conta: {formatCurrency(metrics.paycheckInAccount)}. Sem confirmação, não entra no caixa realizado.</p>
          </div>
          <SecondaryButton onClick={() => actuals.setPaycheck({ amount: metrics.paycheckInAccount,
            payrollInvestment: metrics.investmentDeductions,
            employerInvestment: metrics.employerInvestmentContributions })}>
            <Check size={14} /> Confirmar como no plano
          </SecondaryButton>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="app-form-label">Recebido em conta
            <span className="mt-1 block"><CurrencyInput value={summary.paycheck?.amount ?? 0}
              showZero={summary.paycheck !== null} onEmpty={() => actuals.setPaycheck(null)}
              onChange={(amount) => actuals.setPaycheck({ amount,
                payrollInvestment: summary.paycheck?.payrollInvestment ?? 0,
                employerInvestment: summary.paycheck?.employerInvestment ?? 0 })} /></span>
          </label>
          <label className="app-form-label">Previdência descontada
            <span className="mt-1 block"><CurrencyInput value={summary.paycheck?.payrollInvestment ?? 0}
              onChange={(payrollInvestment) => actuals.setPaycheck({ amount: summary.paycheck?.amount ?? 0,
                payrollInvestment, employerInvestment: summary.paycheck?.employerInvestment ?? 0 })} /></span>
          </label>
          <label className="app-form-label">Contrapartida recebida
            <span className="mt-1 block"><CurrencyInput value={summary.paycheck?.employerInvestment ?? 0}
              onChange={(employerInvestment) => actuals.setPaycheck({ amount: summary.paycheck?.amount ?? 0,
                payrollInvestment: summary.paycheck?.payrollInvestment ?? 0, employerInvestment })} /></span>
          </label>
        </div>
        <p className="mt-2 text-xs text-dark-text-muted">{summary.paycheck ? 'Folha confirmada neste ciclo.' : 'Folha ainda não confirmada.'}</p>
      </div>

      {cycleEvents.length > 0 && <details className="mt-4 rounded-lg border border-dark-border-subtle px-3 py-2.5">
        <summary className="cursor-pointer text-sm text-dark-text-secondary marker:text-dark-text-muted">
          {cycleEvents.length} {cycleEvents.length === 1 ? 'evento previsto' : 'eventos previstos'} neste ciclo
        </summary>
        <ul className="mt-3 space-y-2 border-t border-dark-border-subtle pt-3">
          {cycleEvents.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 flex-1 text-dark-text">{item.event.name}</span>
            <span className="tabular-nums text-dark-text-secondary">{formatCurrency(item.status === 'settled' ? item.paidAmount : item.remainingAmount)} {item.status === 'settled' ? 'realizado' : 'restante'}</span>
            {item.event.cashTreatment === 'card' && item.status !== 'settled' && <SecondaryButton onClick={onGoToCards}>Ver Cartões</SecondaryButton>}
            {item.event.cashTreatment === 'planned' && <SecondaryButton onClick={onGoToPlanning}>Ver Planejar</SecondaryButton>}
          </li>)}
        </ul>
      </details>}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <ActualCashEntries
          key={`${summary.month}-income`}
          title="Entradas extras recebidas"
          description="Banco de horas, bônus, venda ou qualquer dinheiro fora do salário recorrente."
          icon={<BanknoteArrowUp size={15} />}
          tone="income"
          entries={extraIncome}
          expected={expectedIncome}
          currentMonth={summary.month}
          onAdd={actuals.addExtraIncome}
          onUpdate={(id, amount) => actuals.updateExtraIncome(id, { amount })}
          onRemove={actuals.removeExtraIncome}
        />
        <ActualCashEntries
          key={`${summary.month}-expense`}
          title="Saídas extraordinárias pagas"
          description="IPVA, seguro, manutenção ou outra saída que não faz parte dos custos recorrentes."
          icon={<BanknoteArrowDown size={15} />}
          tone="expense"
          entries={extraExpenses}
          expected={expectedExpenses}
          currentMonth={summary.month}
          onAdd={actuals.addExtraExpense}
          onUpdate={(id, amount) => actuals.updateExtraExpense(id, { amount })}
          onRemove={actuals.removeExtraExpense}
        />
      </div>

      <div className="mt-5 border-t border-dark-border-subtle pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-dark-text">Desejos fora do cartão</h3>
            <p className="mt-0.5 text-xs text-dark-text-muted">
              Quanto você realmente destinou por conta, PIX, débito ou boleto neste ciclo.
            </p>
          </div>
          {informedWantsCount > 0 && (
            <SecondaryButton onClick={() => actuals.clearWants()} tone="danger">
              <RotateCcw size={14} />
              Limpar desejos
            </SecondaryButton>
          )}
        </div>

        {wantRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<ClipboardCheck size={24} />} title="Nenhum Desejo fora do cartão">
              Em Planejar, marque como Conta a categoria que precisa de realizado próprio. O que
              estiver no cartão já vem da fatura.
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="mt-4 space-y-1.5">
              {wantRows.map((row) => {
                const off = row.actual !== null && Math.abs(row.variance) > 0.005
                return (
                  <li
                    key={row.want.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-dark-surface px-3 py-2"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-dark-text">{row.want.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
                        <span>plano {formatCurrency(row.planned)}</span>
                        <Tag>fora do cartão</Tag>
                      </p>
                    </div>
                    {off && (
                      <span
                        className={`shrink-0 text-xs font-medium tabular-nums ${
                          row.variance > 0 ? 'text-rose-400' : 'text-primary-400'
                        }`}
                      >
                        {row.variance > 0 ? '+' : '−'} {formatCurrency(Math.abs(row.variance))}
                      </span>
                    )}
                    <div className="w-32 shrink-0">
                      <CurrencyInput
                        value={row.actual ?? 0}
                        showZero={row.actual !== null}
                        onEmpty={() => actuals.setWantActual(row.want.id, null)}
                        onChange={(value) => actuals.setWantActual(row.want.id, value)}
                        placeholder={row.planned.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        className="!py-1.5"
                      />
                    </div>
                    {row.actual === null && <button type="button"
                      onClick={() => actuals.setWantActual(row.want.id, row.planned)}
                      className="rounded-md px-2 py-1 text-xs text-primary-300 hover:bg-primary-500/10">
                      Confirmar plano
                    </button>}
                    <button
                      type="button"
                      onClick={() => actuals.setWantActual(row.want.id, null)}
                      disabled={row.actual === null}
                      className="shrink-0 rounded-md p-1.5 text-dark-text-muted transition-colors hover:text-dark-text disabled:opacity-0"
                      title="Voltar a usar o valor planejado"
                      aria-label={`Limpar o realizado de ${row.want.name}`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>

            <p className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
              {informedWantsCount === 0 ? (
                <>
                  Nenhum valor confirmado ainda. O plano prevê{' '}
                  {formatCurrency(plannedWants)}; confirme antes de fechar.
                </>
              ) : (
                <>
                  {informedWantsCount} de {wantRows.length}{' '}
                  {wantRows.length === 1 ? 'item informado' : 'itens informados'}. Total do ciclo{' '}
                  <strong className="text-dark-text">{formatCurrency(confirmedWants)} confirmado</strong>,{' '}
                  {formatCurrency(pendingWants)} pendente; estimativa total {formatCurrency(effectiveWants)}.{' '}
                  <strong className={wantsVariance > 0 ? 'text-rose-400' : 'text-primary-400'}>
                    {Math.abs(wantsVariance) <= 0.005
                      ? 'igual ao plano'
                      : `${wantsVariance > 0 ? 'acima' : 'abaixo'} em ${formatCurrency(Math.abs(wantsVariance))}`}
                  </strong>
                  . O realizado do cartão permanece exclusivamente na fatura.
                </>
              )}
            </p>
          </>
        )}
      </div>

      <div className="mt-5 border-t border-dark-border-subtle pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-dark-text">Custos em conta</h3>
          <span className="text-xs text-dark-text-muted">
            Débito e boleto; cartão já vem da fatura.
          </span>
          <SecondaryButton onClick={onGoToCards}>Conferir cartão</SecondaryButton>
        </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<ClipboardCheck size={24} />} title="Nenhum custo fixo cadastrado">
            Cadastre seus custos no planejamento para poder informar aqui quanto cada um veio de
            fato neste mês.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-1.5">
            {rows.map((row) => {
              const off = row.actual !== null && Math.abs(row.variance) > 0.005
              return (
                <li
                  key={row.cost.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-dark-surface px-3 py-2"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: COST_CATEGORY_COLORS[row.cost.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dark-text">{row.cost.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
                      {COST_CATEGORY_LABELS[row.cost.category]}
                      <span>plano {formatCurrency(row.planned)}</span>
                      {row.cost.paidWith === 'card' && <Tag>no cartão</Tag>}
                    </p>
                  </div>
                  {off && (
                    <span
                      className={`shrink-0 text-xs font-medium tabular-nums ${
                        row.variance > 0 ? 'text-rose-400' : 'text-primary-400'
                      }`}
                    >
                      {row.variance > 0 ? '+' : '−'} {formatCurrency(Math.abs(row.variance))}
                    </span>
                  )}
                  <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">
                    <div className="w-32 shrink-0">
                      <CurrencyInput
                        value={row.actual ?? 0}
                        showZero={row.actual !== null}
                        onEmpty={() => actuals.setActual(row.cost.id, null)}
                        onChange={(value) => actuals.setActual(row.cost.id, value)}
                        placeholder={row.planned.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        className="!py-1.5"
                      />
                    </div>
                    {row.actual === null && <button type="button"
                      onClick={() => actuals.setActual(row.cost.id, row.planned)}
                      className="rounded-md px-2 py-1 text-xs text-primary-300 hover:bg-primary-500/10">
                      Confirmar plano
                    </button>}
                    <CostAdjustmentControl
                      costName={row.cost.name}
                      onAdjust={(delta) =>
                        actuals.setActual(row.cost.id, Math.max(0, (row.actual ?? 0) + delta))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => actuals.setActual(row.cost.id, null)}
                      disabled={row.actual === null}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-dark-text-muted transition-colors hover:bg-white/[0.04] hover:text-dark-text disabled:opacity-0"
                      title="Voltar a usar o valor planejado"
                      aria-label={`Limpar o realizado de ${row.cost.name}`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
            {informedCount === 0 ? (
              <>
                  Nenhum valor confirmado ainda. O plano prevê{' '}
                  {formatCurrency(plannedCosts)}; confirme antes de fechar.
              </>
            ) : (
              <>
                {informedCount} de {rows.length}{' '}
                {rows.length === 1 ? 'item informado' : 'itens informados'}. Contra o plano de{' '}
                {formatCurrency(plannedCosts)}, o mês está{' '}
                {formatCurrency(confirmedCosts)} confirmado e {formatCurrency(pendingCosts)} pendente; estimativa total {formatCurrency(effectiveCosts)}.{' '}
                <strong className={variance > 0 ? 'text-rose-400' : 'text-primary-400'}>
                  {variance > 0 ? 'acima' : 'abaixo'} em {formatCurrency(Math.abs(variance))}
                </strong>
                .
              </>
            )}
          </p>
        </>
      )}
      </div>
    </Panel>
  )
}
