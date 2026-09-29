import { useState } from 'react'
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { ActualsPanel } from './ActualsPanel'
import {
  ConfirmButton,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  StatTile,
} from './ui'
import { formatCurrency, formatMonthLong, inputClass } from '../lib/format'
import { useFinancasStore } from '../context/financasStore'
import { cycleSalaryMonth } from '../lib/activeCycle'
import { usePersistenceStatus } from '../hooks/usePersistenceStatus'
import { occurrencesInMonth } from '../lib/forecast'
import { reconcileOccurrence } from '../lib/forecastCoverage'
import {
  evaluateBudgetCeiling,
  evaluateGoalProgress,
  type PlanStatus,
} from '../lib/planStatus'

function formatPlanComparison(planned: number, actual: number) {
  const delta = actual - planned
  if (Math.abs(delta) <= 0.005) return `planejado ${formatCurrency(planned)} · no planejado`
  return `planejado ${formatCurrency(planned)} · ${formatCurrency(Math.abs(delta))} ${delta > 0 ? 'acima' : 'abaixo'}`
}

const statusClasses: Record<PlanStatus['tone'], string> = {
  neutral: 'bg-white/[0.05] text-dark-text-muted',
  positive: 'bg-primary-500/10 text-primary-300',
  warning: 'bg-amber-500/10 text-amber-300',
  caution: 'bg-orange-500/10 text-orange-300',
  negative: 'bg-rose-500/10 text-rose-300',
}

function PlanComparisonDetail({
  comparison,
  status,
  suffix,
}: {
  comparison: string
  status: PlanStatus
  suffix?: string
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>
        {comparison}
        {suffix}
      </span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${statusClasses[status.tone]}`}
      >
        {status.label}
      </span>
    </span>
  )
}

export function ClosingView({
  onGoToCards,
  onGoToPlanning,
}: {
  onGoToCards: () => void
  onGoToPlanning: () => void
}) {
  const {
    activeCycle,
    history,
    metrics,
    cashFlow,
    financialCycle,
    actuals,
    cards,
    cardCycleAccounting,
    investmentActuals,
    nextCycleAllocation,
    forecast,
    closeCurrentMonth,
  } = useFinancasStore()
  const { currentMonth, isCurrentMonthClosed } = history
  const [note, setNote] = useState('')
  const [showCloseReview, setShowCloseReview] = useState(false)
  const persistence = usePersistenceStatus()

  const missingActualRows = actuals.summary.rows.filter((row) => row.actual === null)
  const missingWantActualRows = actuals.summary.wantRows.filter((row) => row.actual === null)
  const closingInvoiceDue = cardCycleAccounting.invoiceFormedByCycle.personalTotal
  const closingInvoiceTotal = cardCycleAccounting.invoiceFormedByCycle.total
  const invoiceKnown = cardCycleAccounting.invoiceFormedByCycle.amountKnown
  const closingInvoiceAlreadyPaid = cardCycleAccounting.invoiceFormedByCycle.paid
  const currentInvoiceKnown = cardCycleAccounting.invoiceThisCycle.amountKnown
  const currentDueMonth = cards.settings.currentDueMonth ?? activeCycle.month
  const canPayClosingInvoiceTogether =
    invoiceKnown &&
    !closingInvoiceAlreadyPaid &&
    currentDueMonth === cardCycleAccounting.invoiceFormedByCycle.dueMonth
  const listedPersonal = cardCycleAccounting.spendingThisCycle.spentPersonalTotal
  const stillDuePersonal = cardCycleAccounting.spendingThisCycle.duePersonalTotal
  const prepaidPersonal = Math.max(0, listedPersonal - stillDuePersonal)
  const salaryMonth = cycleSalaryMonth(activeCycle.month)

  const finishClose = (payInvoice: boolean) => {
    if (persistence.hasError) return
    if (!actuals.fillFromPlan(currentMonth)) return
    if (!closeCurrentMonth(currentMonth, note)) return
    if (payInvoice && canPayClosingInvoiceTogether) cards.payInvoice()
    setNote('')
    setShowCloseReview(false)
  }

  const handleReclose = () => {
    if (persistence.hasError) return
    if (!actuals.fillFromPlan(currentMonth)) return
    if (!closeCurrentMonth(currentMonth, note)) return
    setNote('')
  }

  if (metrics.availableForBudget <= 0) {
    return (
      <div className="app-panel-shadow flex flex-col items-center rounded-2xl border border-dark-border bg-dark-card/95 px-6 py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-dark-text">Comece pelo salário</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-dark-text-muted">
          Informe sua renda e seus custos em Planejar para montar o ciclo.
        </p>
        <PrimaryButton className="mt-6" onClick={onGoToPlanning}>
          Ir para Planejar
        </PrimaryButton>
      </div>
    )
  }

  const allocationReliable = invoiceKnown
  const nextExpectedIncome = occurrencesInMonth(forecast.events, nextCycleAllocation.month)
    .filter((item) => item.event.kind === 'income' && !item.event.confirmed)
    .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months,
      new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices).remainingAmount, 0)
  const allocationWithoutUncertainIncome = nextCycleAllocation.availableToAllocate - nextExpectedIncome
  const allocationTone = nextCycleAllocation.shortfall > 0.005 ? 'negative' :
    nextExpectedIncome > 0.005 ? 'neutral' : 'accent'
  const allocationPlanDelta = nextCycleAllocation.afterPlannedWants
  const costsStatus = evaluateBudgetCeiling(
    actuals.summary.plannedCosts,
    actuals.summary.effectiveCosts,
  )
  const invoiceStatus = evaluateBudgetCeiling(metrics.plannedOnCard, closingInvoiceDue)
  const wantsStatus = evaluateBudgetCeiling(
    actuals.summary.plannedWants,
    actuals.summary.effectiveWants,
  )
  const investmentStatus = evaluateGoalProgress(
    metrics.totalPlannedInvestment,
    investmentActuals.total,
  )

  return (
    <div className="space-y-4">
      <Panel className="border-primary-500/25 bg-primary-500/[0.04]">
        <PanelHeader
          title={`Ciclo ${formatMonthLong(activeCycle.month)}`}
          icon={<CalendarCheck size={16} />}
          description={`O salário do fim de ${formatMonthLong(salaryMonth)} financia este ciclo. Desejos ficam fora dos compromissos-base para mostrar quanto ainda pode ser alocado.`}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Disponível para Desejos"
            value={
              currentInvoiceKnown
                ? formatCurrency(financialCycle.discretionaryAvailable)
                : '—'
            }
            detail="após fatura anterior, contas, aporte e extraordinários"
            tone={!currentInvoiceKnown ? 'neutral' : financialCycle.discretionaryShortfall > 0 ? 'negative' : 'accent'}
          />
          <StatTile
            label="Entrou no ciclo"
            value={formatCurrency(cashFlow.totalIn)}
            detail={
              cashFlow.extraIncome > 0.005
                ? `${formatCurrency(cashFlow.paycheck)} de salário + ${formatCurrency(cashFlow.extraIncome)} extras`
                : 'salário líquido na conta'
            }
            tone={cashFlow.totalIn > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Compromissos antes de Desejos"
            value={currentInvoiceKnown ? formatCurrency(financialCycle.commitmentsBeforeWants) : '—'}
            detail="fatura anterior, contas atuais, aporte e extraordinários"
          />
          <StatTile
            label="Depois dos Desejos realizados"
            value={currentInvoiceKnown ? formatCurrency(financialCycle.cashAfterDue) : '—'}
            detail={`${formatCurrency(cashFlow.wantsOnAccount)} efetivamente destinados fora do cartão`}
            tone={!currentInvoiceKnown ? 'neutral' : financialCycle.cashAfterDue < -0.005 ? 'negative' : financialCycle.cashAfterDue > 0.005 ? 'positive' : 'neutral'}
          />
        </div>

        {currentInvoiceKnown && (
          <dl className="mt-3 grid gap-x-5 gap-y-2 rounded-lg border border-dark-border-subtle bg-dark-surface/35 px-3 py-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Fatura anterior</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.invoiceToPay)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Contas atuais</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.costsOnAccount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Aporte realizado pela conta</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.directInvestment)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Extraordinários pagos</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.extraExpense)}</dd>
            </div>
            {cashFlow.cardAdvancePaid > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-text-muted">Cartão pago antecipadamente</dt>
                <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.cardAdvancePaid)}</dd>
              </div>
            )}
          </dl>
        )}

        {!currentInvoiceKnown && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-3 text-xs leading-relaxed text-amber-100/90 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
              A fatura que vence neste ciclo ainda não tem valor confiável. O FinTano não calcula
              um livre incompleto.
            </span>
            <SecondaryButton onClick={onGoToCards}>Conferir cartões</SecondaryButton>
          </div>
        )}
      </Panel>

      {allocationReliable && (
        <Panel>
          <PanelHeader
            title={`Prévia de ${formatMonthLong(nextCycleAllocation.month)}`}
            icon={<Sparkles size={15} />}
            description="Planejamento do próximo salário, depois da fatura formada agora, contas e aporte-base."
            actions={<SecondaryButton onClick={onGoToPlanning}>Ajustar planejamento</SecondaryButton>}
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Disponível para alocar"
              value={formatCurrency(
                nextCycleAllocation.shortfall > 0
                  ? -nextCycleAllocation.shortfall
                  : nextCycleAllocation.pool,
              )}
              detail={
                Math.abs(allocationPlanDelta) <= 0.005
                  ? 'cobre exatamente os desejos planejados'
                  : allocationPlanDelta > 0
                    ? `${formatCurrency(allocationPlanDelta)} além dos desejos planejados`
                    : `${formatCurrency(Math.abs(allocationPlanDelta))} abaixo dos desejos planejados`
              }
              tone={allocationTone}
            />
            <StatTile
              label="Entradas previstas"
              value={formatCurrency(nextCycleAllocation.totalIncome)}
              detail={
                nextCycleAllocation.extraIncome > 0.005
                  ? `${formatCurrency(nextCycleAllocation.extraIncome)} em extras previstos`
                  : 'somente salário recorrente'
              }
            />
            <StatTile
              label={`Fatura de ${formatMonthLong(nextCycleAllocation.month)}`}
              value={formatCurrency(nextCycleAllocation.invoice)}
              detail={closingInvoiceAlreadyPaid ? 'já paga, mas consumiu este caixa' : 'formada pelo ciclo atual'}
            />
            <StatTile
              label="Custos + aporte-base"
              value={formatCurrency(
                nextCycleAllocation.costsOnAccount +
                  nextCycleAllocation.baseInvestment +
                  nextCycleAllocation.extraExpense,
              )}
              detail="antes dos desejos planejados"
            />
          </div>

          {nextCycleAllocation.extraExpense > 0.005 && (
            <p className="mt-3 text-xs leading-relaxed text-dark-text-muted">
              A prévia reserva {formatCurrency(nextCycleAllocation.extraExpense)} de saídas
              extraordinárias previstas.
            </p>
          )}
          {nextExpectedIncome > 0.005 && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-dark-text-secondary">
            Esta prévia depende de {formatCurrency(nextExpectedIncome)} em entradas ainda não confirmadas.
            Sem elas, o valor para alocar seria {formatCurrency(allocationWithoutUncertainIncome)}.
            Confira as datas em Futuro antes de assumir que cobrem uma cobrança.
          </p>}
        </Panel>
      )}

      <ActualsPanel onGoToCards={onGoToCards} onGoToPlanning={onGoToPlanning} />

      <Panel>
        <PanelHeader
          title={`Fechamento de ${formatMonthLong(activeCycle.month)}`}
          icon={<CalendarCheck size={16} />}
          description="Só o necessário para congelar o mês no Histórico."
          actions={
            isCurrentMonthClosed ? (
              <ConfirmButton onConfirm={handleReclose} confirmLabel="Substituir" tone="primary">
                Refechar
              </ConfirmButton>
            ) : (
              <PrimaryButton
                onClick={() => setShowCloseReview(true)}
                disabled={persistence.hasError}
              >
                <CalendarCheck size={15} />
                Revisar e fechar
              </PrimaryButton>
            )
          }
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Movimentos extraordinários"
            value={formatCurrency(
              actuals.summary.extraIncomeTotal - actuals.summary.extraExpenseTotal,
            )}
            detail={`entrou ${formatCurrency(actuals.summary.extraIncomeTotal)} · saiu ${formatCurrency(actuals.summary.extraExpenseTotal)}`}
            tone={
              actuals.summary.extraIncomeTotal - actuals.summary.extraExpenseTotal > 0.005
                ? 'positive'
                : actuals.summary.extraExpenseTotal - actuals.summary.extraIncomeTotal > 0.005
                  ? 'negative'
                  : 'neutral'
            }
          />
          <StatTile
            label="Custos do mês"
            value={formatCurrency(actuals.summary.effectiveCosts)}
            detail={
              <PlanComparisonDetail
                comparison={formatPlanComparison(
                  actuals.summary.plannedCosts,
                  actuals.summary.effectiveCosts,
                )}
                status={costsStatus}
                suffix={
                  missingActualRows.length > 0
                    ? ` · ${missingActualRows.length} sem realizado`
                    : ''
                }
              />
            }
            tone={costsStatus.tone}
          />
          <StatTile
            label="Desejos fora do cartão"
            value={formatCurrency(actuals.summary.effectiveWants)}
            detail={
              <PlanComparisonDetail
                comparison={formatPlanComparison(
                  actuals.summary.plannedWants,
                  actuals.summary.effectiveWants,
                )}
                status={wantsStatus}
                suffix={
                  missingWantActualRows.length > 0
                    ? ` · ${missingWantActualRows.length} sem realizado`
                    : ''
                }
              />
            }
            tone={wantsStatus.tone}
          />
          <StatTile
            label="Minha parte da fatura"
            value={invoiceKnown ? formatCurrency(closingInvoiceDue) : '—'}
            detail={
              invoiceKnown
                ? (
                    <PlanComparisonDetail
                      comparison={formatPlanComparison(metrics.plannedOnCard, closingInvoiceDue)}
                      status={invoiceStatus}
                      suffix={` · pagar em ${formatMonthLong(cardCycleAccounting.invoiceFormedByCycle.dueMonth)}`}
                    />
                  )
                : 'confira Cartões antes de fechar'
            }
            tone={invoiceKnown ? invoiceStatus.tone : 'neutral'}
          />
          <StatTile
            label="Investido no ciclo"
            value={formatCurrency(investmentActuals.total)}
            detail={
              <PlanComparisonDetail
                comparison={formatPlanComparison(
                  metrics.totalPlannedInvestment,
                  investmentActuals.total,
                )}
                status={investmentStatus}
                suffix={` · ${investmentActuals.savingsRate.toFixed(1)}% da base · empresa ${formatCurrency(investmentActuals.employer)} · creditado ${formatCurrency(investmentActuals.creditedTotal)}`}
              />
            }
            tone={investmentStatus.tone}
          />
        </div>

        {showCloseReview && !isCurrentMonthClosed && (
          <div className="mt-4 rounded-xl border border-dark-border-subtle bg-dark-surface/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-dark-text">
                  Confirmar {formatMonthLong(activeCycle.month)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">
                  Histórico: custos {formatCurrency(actuals.summary.effectiveCosts)} · desejos fora
                  do cartão {formatCurrency(actuals.summary.effectiveWants)} · fatura pessoal{' '}
                  {invoiceKnown ? formatCurrency(closingInvoiceDue) : 'não recuperada'} · investido{' '}
                  {formatCurrency(investmentActuals.total)}
                  {investmentActuals.employer > 0.005 && (
                    <>
                      {' '}· empresa {formatCurrency(investmentActuals.employer)} · total creditado{' '}
                      {formatCurrency(investmentActuals.creditedTotal)}
                    </>
                  )}
                  {actuals.summary.extraIncomeTotal > 0.005 && (
                    <> · extras recebidos {formatCurrency(actuals.summary.extraIncomeTotal)}</>
                  )}
                  {actuals.summary.extraExpenseTotal > 0.005 && (
                    <> · extraordinários pagos {formatCurrency(actuals.summary.extraExpenseTotal)}</>
                  )}
                  {cashFlow.cardAdvancePaid > 0.005 && (
                    <> · cartão pago avulso {formatCurrency(cashFlow.cardAdvancePaid)}</>
                  )}
                  .
                </p>
              </div>
              {closingInvoiceAlreadyPaid && (
                <span className="rounded-lg bg-primary-500/15 px-3 py-1.5 text-xs font-semibold text-primary-300">
                  Fatura de {formatMonthLong(cardCycleAccounting.invoiceFormedByCycle.dueMonth)} já paga
                </span>
              )}
            </div>

            {invoiceKnown && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-dark-card px-3 py-2 text-xs text-dark-text-secondary">
                  <span className="block text-dark-text-muted">Fatura total</span>
                  <strong className="mt-0.5 block text-sm tabular-nums text-dark-text">
                    {closingInvoiceTotal !== null ? formatCurrency(closingInvoiceTotal) : '—'}
                  </strong>
                  {closingInvoiceTotal !== null && (
                    <span className="mt-0.5 block text-xs text-dark-text-muted">
                      terceiros {formatCurrency(Math.max(0, closingInvoiceTotal - closingInvoiceDue))}
                    </span>
                  )}
                </div>
                <div className="rounded-lg bg-dark-card px-3 py-2 text-xs text-dark-text-secondary">
                  <span className="block text-dark-text-muted">Antecipado fora da fatura</span>
                  <strong className="mt-0.5 block text-sm tabular-nums text-dark-text">
                    {formatCurrency(prepaidPersonal)}
                  </strong>
                  <span className="mt-0.5 block text-xs text-dark-text-muted">
                    não será somado novamente
                  </span>
                </div>
              </div>
            )}

            {missingActualRows.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs leading-relaxed text-amber-100/85">
                <strong className="text-amber-200">Usando o planejamento em:</strong>{' '}
                {missingActualRows.map((row) => row.cost.name).join(', ')}.
              </div>
            )}

            {missingWantActualRows.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs leading-relaxed text-amber-100/85">
                <strong className="text-amber-200">
                  Desejos fora do cartão usando o planejamento:
                </strong>{' '}
                {missingWantActualRows.map((row) => row.want.name).join(', ')}.
              </div>
            )}

            {!invoiceKnown && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5 text-xs text-rose-100/90">
                <span>Confira a fatura antes de fechar para não gravar um valor incompleto.</span>
                <SecondaryButton onClick={onGoToCards}>Ir para Cartões</SecondaryButton>
              </div>
            )}

            <label className="mt-3 block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-dark-text-muted">
                Nota do ciclo (opcional)
              </span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="ex.: viagem, bônus, gasto excepcional"
                className={inputClass}
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SecondaryButton onClick={() => finishClose(false)}>
                Fechar apenas o ciclo
              </SecondaryButton>
              {canPayClosingInvoiceTogether && (
                <PrimaryButton onClick={() => finishClose(true)}>
                  <CheckCircle2 size={15} />
                  Fechar + pagar fatura ({formatCurrency(closingInvoiceDue)})
                </PrimaryButton>
              )}
              {closingInvoiceAlreadyPaid && (
                <PrimaryButton onClick={() => finishClose(false)}>
                  <CheckCircle2 size={15} />
                  Fechar ciclo — fatura já paga
                </PrimaryButton>
              )}
              <button
                type="button"
                onClick={() => setShowCloseReview(false)}
                className="ml-auto rounded-lg px-3 py-2 text-sm text-dark-text-muted transition-colors hover:text-dark-text"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
          Salário recebido no fim de {formatMonthLong(salaryMonth)} financia{' '}
          {formatMonthLong(activeCycle.month)}. A fatura que encerra este ciclo vence em{' '}
          {formatMonthLong(cardCycleAccounting.invoiceFormedByCycle.dueMonth)}; pagar a fatura não
          muda o ciclo por si só.
        </p>
      </Panel>
    </div>
  )
}
