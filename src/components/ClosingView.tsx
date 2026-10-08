import { useState } from 'react'
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { ActualsPanel } from './ActualsPanel'
import {
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  StatTile,
} from './ui'
import { formatCurrency, formatDate, formatMonthLong, inputClass } from '../lib/format'
import { useFinancasStore } from '../context/financasStore'
import { cycleSalaryMonth } from '../lib/activeCycle'
import { usePersistenceStatus } from '../hooks/usePersistenceStatus'
import { repositoryRevision } from '../data/repositoryCommand'
import { uid } from '../lib/shared'
import { pendingCardInvoices } from '../lib/cardCycleView'
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
    planComparison,
    cashFlow,
    financialCycle,
    actuals,
    cards,
    cardCycleAccounting,
    investmentActuals,
    nextCycleAllocation,
    forecast,
    movementSources,
    closeCurrentMonth,
  } = useFinancasStore()
  const { currentMonth, isCurrentMonthClosed } = history
  const [note, setNote] = useState('')
  const [showCloseReview, setShowCloseReview] = useState(false)
  const [closeReviewRevision, setCloseReviewRevision] = useState<string | null>(null)
  const [closeOperationId, setCloseOperationId] = useState('')
  const [closeError, setCloseError] = useState('')
  const persistence = usePersistenceStatus()

  const missingActualRows = actuals.summary.rows.filter((row) => row.actual === null)
  const missingWantActualRows = actuals.summary.wantRows.filter((row) => row.actual === null)
  const confirmedFromPlan = actuals.summary.rows.filter((row) => row.origin === 'confirmed_from_plan').length +
    actuals.summary.wantRows.filter((row) => row.origin === 'confirmed_from_plan').length +
    (actuals.summary.paycheck?.origin === 'confirmed_from_plan' ? 1 : 0)
  const closingInvoiceDue = cardCycleAccounting.invoiceFormedByCycle.personalTotal
  const closingInvoiceTotal = cardCycleAccounting.invoiceFormedByCycle.total
  const invoiceKnown = cardCycleAccounting.invoiceFormedByCycle.amountKnown
  const closingInvoiceAlreadyPaid = cardCycleAccounting.invoiceFormedByCycle.paid
  const currentInvoiceKnown = cardCycleAccounting.invoiceThisCycle.amountKnown
  const incomeKnown = actuals.summary.paycheck !== null
  const cashCompositionKnown = incomeKnown && currentInvoiceKnown
  const closingReady = actuals.summary.paycheck !== null && missingActualRows.length === 0 &&
    missingWantActualRows.length === 0 && invoiceKnown && currentInvoiceKnown
  const pendingInvoices = pendingCardInvoices(cards.entries, cards.paidInvoices, cards.accounts, cardCycleAccounting.invoiceFormedByCycle.dueMonth)
  const pendingInvoiceTotal = pendingInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const canPayClosingInvoiceTogether = invoiceKnown && pendingInvoices.length > 0 && pendingInvoices.every((invoice) => invoice.known)
  const listedPersonal = cardCycleAccounting.spendingThisCycle.spentPersonalTotal
  const stillDuePersonal = cardCycleAccounting.spendingThisCycle.duePersonalTotal
  const prepaidPersonal = Math.max(0, listedPersonal - stillDuePersonal)
  const salaryMonth = cycleSalaryMonth(activeCycle.month)

  const finishClose = (payInvoice: boolean) => {
    if (persistence.hasError) return
    const result = closeCurrentMonth(currentMonth, note, {
      payInvoice: payInvoice && canPayClosingInvoiceTogether,
      expectedRevision: closeReviewRevision,
      operationId: closeOperationId,
    })
    if (!result.ok) { setCloseError(result.message); return }
    setNote('')
    setCloseError('')
    setShowCloseReview(false)
  }

  const allocationReliable = invoiceKnown
  const nextExpectedIncome = occurrencesInMonth(forecast.events, nextCycleAllocation.month)
    .filter((item) => item.event.kind === 'income' && !item.event.confirmed)
    .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months,
      new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices, movementSources).remainingAmount, 0)
  const allocationWithUncertainIncome = nextCycleAllocation.availableToAllocate + nextExpectedIncome
  const laterThanInvoice = occurrencesInMonth(forecast.events, nextCycleAllocation.month)
    .filter((item) => item.event.kind === 'income' && item.date &&
      Number(item.date.slice(8, 10)) > activeCycle.cycle.cardDueHintDay)
    .reduce((sum, item) => sum + reconcileOccurrence(item, actuals.months,
      new Date().toISOString().slice(0, 10), cards.entries, cards.paidInvoices, movementSources).remainingAmount, 0)
  const allocationTone = nextCycleAllocation.shortfall > 0.005 ? 'negative' : 'accent'
  const allocationPlanDelta = nextCycleAllocation.afterPlannedWants
  const costsStatus = evaluateBudgetCeiling(
    planComparison.costs,
    actuals.summary.effectiveCosts,
  )
  const invoiceStatus = evaluateBudgetCeiling(planComparison.card, closingInvoiceDue)
  const wantsStatus = evaluateBudgetCeiling(
    planComparison.wants,
    actuals.summary.effectiveWants,
  )
  const investmentStatus = evaluateGoalProgress(
    planComparison.invested,
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
              cashCompositionKnown
                ? formatCurrency(financialCycle.discretionaryAvailable)
                : '—'
            }
            detail="após fatura, contas e aporte incluindo pendências do plano"
            tone={!cashCompositionKnown ? 'neutral' : financialCycle.discretionaryShortfall > 0 ? 'negative' : 'accent'}
          />
          <StatTile
            label="Renda recebida"
            value={formatCurrency(cashFlow.paycheck + cashFlow.extraIncome)}
            detail={
              `${actuals.summary.paycheck ? 'folha confirmada' : 'folha ainda não confirmada'}${cashFlow.extraIncome > 0 ? ` · ${formatCurrency(cashFlow.extraIncome)} extras` : ''}${cashFlow.investmentWithdrawals > 0 ? ' · resgates não são renda' : ''}`
            }
            tone={cashFlow.paycheck + cashFlow.extraIncome > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Compromissos antes de Desejos"
            value={currentInvoiceKnown ? formatCurrency(financialCycle.commitmentsBeforeWants) : '—'}
            detail="inclui contas pendentes e aporte ainda não executado"
          />
          <StatTile
            label="Após Desejos destinados"
            value={cashCompositionKnown ? formatCurrency(financialCycle.remainingAfterWants) : '—'}
            detail={`${formatCurrency(cashFlow.wantsOnAccount)} efetivamente destinados fora do cartão`}
            tone={!cashCompositionKnown ? 'neutral' : financialCycle.remainingAfterWants < -0.005 ? 'negative' : financialCycle.remainingAfterWants > 0.005 ? 'positive' : 'neutral'}
          />
        </div>

        {currentInvoiceKnown && (
          <dl className="mt-3 grid gap-x-5 gap-y-2 rounded-lg border border-dark-border-subtle bg-dark-surface/35 px-3 py-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Fatura anterior</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.invoiceToPay)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Contas comprometidas</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(financialCycle.costsCommitted)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Aporte líquido reservado</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(financialCycle.directInvestmentCommitted)}</dd>
            </div>
            {financialCycle.withdrawalsForCycle > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-text-muted">Recursos de resgates, além da renda</dt>
                <dd className="tabular-nums text-dark-text">{formatCurrency(financialCycle.withdrawalsForCycle)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dark-text-muted">Extraordinários pagos/pendentes</dt>
              <dd className="tabular-nums text-dark-text">{formatCurrency(financialCycle.extraExpenseCommitted)}</dd>
            </div>
            {cashFlow.cardAdvancePaid > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dark-text-muted">Cartão pago antecipadamente</dt>
                <dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.cardAdvancePaid)}</dd>
              </div>
            )}
            {cashFlow.debtExtraPayments > 0 && <div className="flex items-center justify-between gap-3"><dt className="text-dark-text-muted">Amortizações extraordinárias</dt><dd className="tabular-nums text-dark-text">{formatCurrency(cashFlow.debtExtraPayments)}</dd></div>}
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
              label="Base para alocar"
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
                  ? `${formatCurrency(nextCycleAllocation.extraIncome)} em entradas confirmadas`
                  : 'somente salário do plano'
              }
            />
            <StatTile
              label={`Minha parte da fatura de ${formatMonthLong(nextCycleAllocation.month)}`}
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
            Há {formatCurrency(nextExpectedIncome)} em entradas ainda não confirmadas. Se ocorrerem,
            a verba para alocar sobe para {formatCurrency(allocationWithUncertainIncome)}.
            Confira as datas em Futuro: sem dia de recebimento e vencimento, esta prévia não assegura a cobertura de uma cobrança.
          </p>}
          {laterThanInvoice > 0.005 && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-dark-text-secondary">
            {formatCurrency(laterThanInvoice)} em entradas têm data posterior ao dia de vencimento indicado para o cartão.
            Esse dinheiro não cobre a fatura na data; confira o calendário em Cartões e Futuro.
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
              <span className="text-xs text-dark-text-muted">Fechado. Revise correções no Histórico.</span>
            ) : (
              <PrimaryButton
                onClick={() => { setCloseReviewRevision(repositoryRevision()); setCloseOperationId(uid()); setCloseError(''); setShowCloseReview(true) }}
                disabled={persistence.hasError}
              >
                <CalendarCheck size={15} />
                Revisar e fechar
              </PrimaryButton>
            )
          }
        />
        {closeError && isCurrentMonthClosed && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{closeError}</p>}

        {planComparison.fixedAt && <p className="mt-4 text-xs text-dark-text-muted">Comparação com o plano fixado em {formatDate(planComparison.fixedAt)}.</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Movimentos extraordinários"
            value={formatCurrency(
              actuals.summary.extraIncomeTotal - actuals.summary.extraExpenseTotal - cashFlow.debtExtraPayments,
            )}
            detail={`entrou ${formatCurrency(actuals.summary.extraIncomeTotal)} · saiu ${formatCurrency(actuals.summary.extraExpenseTotal + cashFlow.debtExtraPayments)}`}
            tone={
              actuals.summary.extraIncomeTotal - actuals.summary.extraExpenseTotal - cashFlow.debtExtraPayments > 0.005
                ? 'positive'
                : actuals.summary.extraExpenseTotal + cashFlow.debtExtraPayments - actuals.summary.extraIncomeTotal > 0.005
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
                  planComparison.costs,
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
                  planComparison.wants,
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
                      comparison={formatPlanComparison(planComparison.card, closingInvoiceDue)}
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
                  planComparison.invested,
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

            {actuals.summary.paycheck === null && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs text-amber-100/85">
              Confirme a folha recebida em Realizado, inclusive se o valor foi zero.
            </div>}
            {confirmedFromPlan > 0 && <div className="mt-3 rounded-lg border border-primary-500/20 bg-primary-500/[0.05] px-3 py-2.5 text-xs text-dark-text-secondary">
              {confirmedFromPlan} {confirmedFromPlan === 1 ? 'valor foi confirmado' : 'valores foram confirmados'} a partir do plano.
              Essa origem permanece registrada no Realizado e no backup.
            </div>}

            {missingActualRows.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs leading-relaxed text-amber-100/85">
                <strong className="text-amber-200">Confirme antes de fechar:</strong>{' '}
                {missingActualRows.map((row) => row.cost.name).join(', ')}.
              </div>
            )}

            {missingWantActualRows.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs leading-relaxed text-amber-100/85">
                <strong className="text-amber-200">
                  Confirme Desejos fora do cartão antes de fechar:
                </strong>{' '}
                {missingWantActualRows.map((row) => row.want.name).join(', ')}.
              </div>
            )}

            {(!invoiceKnown || !currentInvoiceKnown) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5 text-xs text-rose-100/90">
                <span>Confira as faturas do ciclo e do próximo vencimento antes de fechar; valor desconhecido não é zero.</span>
                <SecondaryButton onClick={onGoToCards}>Ir para Cartões</SecondaryButton>
              </div>
            )}

            {pendingInvoices.length > 0 && <div className="mt-3 rounded-lg border border-dark-border bg-dark-surface p-3 text-sm">
              <p className="font-medium">Faturas pendentes a confirmar</p>
              {pendingInvoices.map((invoice) => <div key={`${invoice.accountId}-${invoice.dueMonth}`} className="mt-2 flex justify-between gap-3 text-xs"><span>{invoice.cardName} · {formatMonthLong(invoice.dueMonth)}</span><span className="tabular-nums">{invoice.known ? formatCurrency(invoice.total) : 'Valor não informado'}</span></div>)}
              <p className="mt-2 text-xs text-dark-text-muted">Inclui anteriores em aberto. Faturas já pagas serão preservadas, sem novo pagamento.</p>
            </div>}
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
              <SecondaryButton disabled={!closingReady} onClick={() => finishClose(false)}>
                Fechar apenas o ciclo
              </SecondaryButton>
              {canPayClosingInvoiceTogether && (
                <PrimaryButton disabled={!closingReady} onClick={() => finishClose(true)}>
                  <CheckCircle2 size={15} />
                  Confirmar pendentes e virar ciclo ({formatCurrency(pendingInvoiceTotal)})
                </PrimaryButton>
              )}
              {pendingInvoices.length === 0 && closingInvoiceAlreadyPaid && (
                <PrimaryButton disabled={!closingReady} onClick={() => finishClose(false)}>
                  <CheckCircle2 size={15} />
                  Virar ciclo — faturas já pagas
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
            {closeError && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{closeError}</p>}
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
