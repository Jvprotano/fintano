import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { Panel, PanelHeader, PrimaryButton, SecondaryButton, SegmentedControl, StatTile } from './ui'
import { useFinancasStore } from '../context/financasStore'
import { calculateFundingOutlook, cardDueMonthForOccurrence, coverageAtDate, upcomingOccurrences } from '../lib/forecastCoverage'
import { formatCurrency, formatMonthKey, inputClass } from '../lib/format'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import type { BudgetArea, CreditCardAccount, CreditCardEntry } from '../types'
import { addMonths } from '../lib/shared'
import { inferDueMonthFromPaymentDate } from '../lib/creditCards'

function OccurrenceAdjustment({ item, onSave, onCancel }: {
  item: ReconciledOccurrence
  onSave: (date: string, month: string, amount: number) => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(item.date ?? '')
  const [month, setMonth] = useState(item.month)
  const [amount, setAmount] = useState(item.amount)
  if (item.status === 'settled' || item.status === 'scheduled') return null
  return <div className="w-full">
    <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs text-dark-text-muted underline-offset-2 hover:text-dark-text hover:underline">
      {open ? 'Fechar ajuste' : 'Ajustar esta ocorrência'}
    </button>
    {open && <div className="mt-2 grid gap-2 rounded-lg border border-dark-border bg-dark-card p-3 sm:grid-cols-3">
      <label><span className="app-form-label mb-1 block">Novo mês</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setDate('') }} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Novo dia (opcional)</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (event.target.value) setMonth(event.target.value.slice(0, 7)) }} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Novo valor</span><CurrencyInput value={amount} onChange={setAmount} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <PrimaryButton disabled={!month || amount <= 0} onClick={() => { onSave(date, month, amount); setOpen(false) }}>Salvar ocorrência</PrimaryButton>
        <SecondaryButton tone="danger" onClick={onCancel}>Cancelar ocorrência</SecondaryButton>
      </div>
    </div>}
  </div>
}

function CardOccurrenceAction({ item, accounts, currentDueMonth, onAdd }: {
  item: ReconciledOccurrence
  accounts: CreditCardAccount[]
  currentDueMonth: string
  onAdd: (entry: Omit<CreditCardEntry, 'id'>) => void
}) {
  const dueMonth = cardDueMonthForOccurrence(item)
  const cycle = dueMonth === currentDueMonth ? 'current' as const :
    dueMonth === addMonths(currentDueMonth, 1) ? 'next' as const : null
  const [cardName, setCardName] = useState(accounts[0]?.name ?? '')
  const [budgetArea, setBudgetArea] = useState<BudgetArea>('desejos')
  const [purchaseDate, setPurchaseDate] = useState(todayKey)
  if (item.event.cashTreatment !== 'card' || item.status === 'scheduled' || item.status === 'settled') return null
  if (!cycle) return <p className="w-full text-xs text-dark-text-muted">O lançamento em Cartões fica disponível quando a fatura de {dueMonth ? formatMonthKey(dueMonth) : 'pagamento'} entrar no ciclo atual ou seguinte.</p>
  if (accounts.length === 0) return <p className="w-full text-xs text-dark-text-muted">Cadastre primeiro o cartão na aba Cartões.</p>
  return <div className="w-full rounded-lg border border-dark-border bg-dark-card p-3">
    <p className="text-xs text-dark-text-secondary">A cobrança já apareceu no cartão? Registre-a uma vez na fatura de {formatMonthKey(dueMonth!)}.</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label><span className="app-form-label mb-1 block">Cartão</span><select value={cardName} onChange={(event) => setCardName(event.target.value)} className={inputClass}>
        {accounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
      </select></label>
      <label><span className="app-form-label mb-1 block">Data real da compra</span><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className={inputClass} /></label>
      <label><span className="app-form-label mb-1 block">Área</span><select value={budgetArea} onChange={(event) => setBudgetArea(event.target.value as BudgetArea)} className={inputClass}>
        <option value="desejos">Desejos</option><option value="necessidades">Necessidades</option><option value="investimentos">Investimentos</option>
      </select></label>
      <SecondaryButton disabled={!cardName || !purchaseDate} onClick={() => onAdd({
        cycle, description: item.event.name, purchaseDate: purchaseDate.split('-').reverse().join('/'),
        cardName, amount: item.remainingAmount, personalAmount: item.remainingAmount,
        remainingAmount: 0, budgetArea, sourceForecastOccurrenceId: item.id,
      })}>Lançar no cartão</SecondaryButton>
    </div>
  </div>
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ForecastCommitments() {
  const { forecast, actuals, nextCycleAllocation, investments, cards } = useFinancasStore()
  const [months, setMonths] = useState<12 | 24 | 36>(24)
  const [groupId, setGroupId] = useState('all')
  const [queryDate, setQueryDate] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const today = todayKey()
  const occurrences = useMemo(() => upcomingOccurrences(
    forecast.events, actuals.months, forecast.currentMonth, months, today, cards.entries, cards.paidInvoices,
  ), [forecast.events, actuals.months, forecast.currentMonth, months, today, cards.entries, cards.paidInvoices])
  const groups = useMemo(() => {
    const usedGoals = new Set<string>()
    return [null, ...forecast.funds.map((fund) => {
      const goal = investments.goals.find((item) => item.id === fund.goalId && item.kind === 'funding')
      if (!goal || usedGoals.has(goal.id)) return { ...fund, reservedAmount: goal ? 0 : fund.reservedAmount }
      usedGoals.add(goal.id)
      return { ...fund, reservedAmount: goal.ownBalance }
    })]
  }, [forecast.funds, investments.goals])
  const outlooks = groups.map((fund) => calculateFundingOutlook(fund, occurrences, today))
    .filter((outlook) => outlook.pendingExpenses > 0.005 || outlook.expectedIncome > 0.005 || outlook.confirmedIncome > 0.005)
  const relevant = occurrences.filter((item) => groupId === 'all' ||
    (item.event.groupId ?? '') === groupId)
  const dated = relevant.filter((item) => !queryDate ||
    (item.date ? item.date <= queryDate : item.month <= queryDate.slice(0, 7)))
  const pending = dated.filter((item) => item.remainingAmount > 0.005)
  const income = pending.filter((item) => item.event.kind === 'income')
    .reduce((sum, item) => sum + item.remainingAmount, 0)
  const expense = pending.filter((item) => item.event.kind === 'expense' &&
    item.event.cashTreatment !== 'planned' && item.event.cashTreatment !== 'card')
    .reduce((sum, item) => sum + item.remainingAmount, 0)
  const monthlyReference = nextCycleAllocation.availableToAllocate -
    nextCycleAllocation.extraIncome + nextCycleAllocation.extraExpense

  const addGroup = () => {
    if (!newGroup.trim()) return
    forecast.addFund(newGroup)
    setNewGroup('')
  }

  return (
    <Panel>
      <PanelHeader title="Próximos compromissos" icon={<CalendarDays size={16} />}
        description="Cobertura das entradas e saídas futuras. O valor reservado é informado por você; esta visão não representa saldo bancário." />

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <StatTile label="Entradas ainda previstas" value={formatCurrency(income)} detail="não são caixa recebido" tone="neutral" />
        <StatTile label="Saídas extraordinárias pendentes" value={formatCurrency(expense)} detail="fora do plano e da fatura" tone="neutral" />
        <StatTile label="Diferença no período" value={formatCurrency(income - expense)} detail="a ordem dos vencimentos importa" tone="neutral" />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-dark-border-subtle bg-dark-surface/40 p-4">
          <h4 className="text-sm font-semibold text-dark-text">Grupos e dinheiro reservado</h4>
          <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">Ex.: Viagem 2027. Informe apenas o valor que já separou para esse compromisso. Ele não é somado ao patrimônio. Quando uma entrada for recebida, atualize a reserva ou a meta vinculada para destiná-la ao grupo.</p>
          <div className="mt-3 space-y-2">
            {forecast.funds.map((fund) => {
              const outlook = outlooks.find((item) => item.fundId === fund.id)
              const linkedGoal = investments.goals.find((item) => item.id === fund.goalId && item.kind === 'funding')
              return <div key={fund.id} className="rounded-lg border border-dark-border-subtle bg-dark-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="min-w-0 truncate text-sm text-dark-text">{fund.name}</strong>
                  <button type="button" onClick={() => forecast.removeFund(fund.id)} aria-label={`Remover grupo ${fund.name}`}
                    className="rounded-md p-2 text-dark-text-muted hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={14} /></button>
                </div>
                <label className="mt-2 block"><span className="app-form-label mb-1 block">Usar saldo de meta</span>
                  <select value={linkedGoal ? fund.goalId : ''} onChange={(event) => forecast.updateFund(fund.id, { goalId: event.target.value })} className={inputClass}>
                    <option value="">Informar valor manualmente</option>
                    {investments.goals.filter((goal) => goal.kind === 'funding' &&
                      (goal.id === fund.goalId || !forecast.funds.some((other) => other.id !== fund.id && other.goalId === goal.id)))
                      .map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                  </select>
                </label>
                {linkedGoal ? <p className="mt-2 text-xs text-dark-text-secondary">Saldo próprio da meta: {formatCurrency(linkedGoal.ownBalance)}. Valores que a meta apenas acompanha em outros investimentos não entram aqui.</p>
                  : <label className="mt-2 block"><span className="app-form-label mb-1 block">Já reservado</span>
                    <CurrencyInput value={fund.reservedAmount} onChange={(value) => forecast.updateFund(fund.id, { reservedAmount: value })} />
                  </label>}
                {outlook && <p className="mt-2 text-xs text-dark-text-secondary">
                  Para os vencimentos: <strong className="tabular-nums text-dark-text">{formatCurrency(outlook.requiredMonthlyBase)}/mês</strong>
                  {outlook.expectedIncome > 0 && <> · se as demais entradas chegarem, {formatCurrency(outlook.requiredMonthlyIfReceived)}/mês</>}
                  {outlook.immediateShortfallBase > 0 && <> · falta imediata {formatCurrency(outlook.immediateShortfallBase)}</>}
                </p>}
              </div>
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="min-w-0 flex-1"><span className="app-form-label mb-1 block">Novo grupo</span>
              <input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addGroup()}
                placeholder="Ex.: Viagem 2027" className={inputClass} />
            </label>
            <PrimaryButton className="self-end" onClick={addGroup} disabled={!newGroup.trim()}><Plus size={14} /> Criar grupo</PrimaryButton>
          </div>
        </div>
        <div className="rounded-xl border border-dark-border-subtle bg-dark-surface/40 p-4">
          <h4 className="text-sm font-semibold text-dark-text">Quanto separar</h4>
          {outlooks.length === 0 ? <p className="mt-2 text-sm text-dark-text-muted">Cadastre uma saída futura para calcular a cobertura.</p> : (
            <ul className="mt-3 space-y-3">
              {outlooks.filter((item) => item.pendingExpenses > 0).map((outlook) => <li key={outlook.fundId ?? 'ungrouped'} className="border-b border-dark-border-subtle pb-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm text-dark-text">{outlook.fundName}</strong>
                  <span className="font-semibold tabular-nums text-dark-text">{formatCurrency(outlook.requiredMonthlyBase)}/mês</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">
                  {formatCurrency(outlook.pendingExpenses)} pendentes · {formatCurrency(outlook.reservedAmount)} já reservados
                  {outlook.firstUncoveredDate && ` · primeiro prazo sem cobertura: ${outlook.firstUncoveredDate.split('-').reverse().join('/')}`}
                  {outlook.monthOnly && ' · há datas conhecidas apenas por mês'}
                </p>
                {!occurrences.some((item) => (item.event.groupId ?? null) === outlook.fundId && item.event.cashTreatment === 'card') &&
                  outlook.requiredMonthlyBase > Math.max(0, monthlyReference) + 0.005 &&
                  <p className="mt-1 text-xs text-amber-300">Acima da folga de referência do próximo Ciclo ({formatCurrency(Math.max(0, monthlyReference))}).</p>}
              </li>)}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-dark-text-muted">Cálculo conservador: depósitos no dia 1 dos próximos meses; entradas não confirmadas só entram no cenário alternativo. A comparação com o próximo Ciclo é uma referência de planejamento.</p>
        </div>
      </div>

      <div className="mt-5 border-t border-dark-border-subtle pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><h4 className="text-sm font-semibold text-dark-text">Agenda</h4>
            <p className="mt-1 text-xs text-dark-text-muted">Data da cobrança e mês de pagamento da fatura aparecem separadamente.</p></div>
          <SegmentedControl options={[{ value: 12 as const, label: '12m' }, { value: 24 as const, label: '24m' }, { value: 36 as const, label: '36m' }]}
            value={months} onChange={setMonths} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label><span className="app-form-label mb-1 block">Grupo</span>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className={inputClass}>
              <option value="all">Todos</option><option value="">Sem grupo</option>
              {forecast.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </label>
          <label><span className="app-form-label mb-1 block">Consultar até a data</span>
            <input type="date" min={today} value={queryDate} onChange={(event) => setQueryDate(event.target.value)} className={inputClass} />
          </label>
        </div>
        {queryDate && <p className="mt-2 text-xs text-dark-text-muted">Valores sem dia cadastrado podem ocorrer em qualquer data do mês; a consulta os mostra como incertos.</p>}
        {queryDate && <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {groups.filter((fund) => groupId === 'all' || (fund?.id ?? '') === groupId).map((fund) => {
            const coverage = coverageAtDate(fund, occurrences, queryDate)
            return <div key={fund?.id ?? 'ungrouped'} className="rounded-lg border border-dark-border-subtle bg-dark-card p-3">
              <p className="text-xs text-dark-text-muted">Cobertura atribuída até {queryDate.split('-').reverse().join('/')} · {fund?.name ?? 'Sem grupo'}</p>
              <strong className={`mt-1 block text-lg tabular-nums ${coverage.base < 0 ? 'text-amber-300' : 'text-dark-text'}`}>{formatCurrency(coverage.base)}</strong>
              <p className="mt-1 text-xs text-dark-text-muted">Se todas as entradas previstas chegarem: {formatCurrency(coverage.ifReceived)}.
                Sem novos depósitos mensais.{coverage.hasMonthOnly && ' Eventos sem dia usam ordem conservadora.'}</p>
            </div>
          })}
        </div>}
        {dated.length === 0 ? <p className="mt-4 text-sm text-dark-text-muted">Nenhuma ocorrência nesse recorte.</p> : (
          <ul className="mt-3 space-y-1.5">
            {dated.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-dark-border-subtle bg-dark-surface/50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-dark-text">{item.event.name}</p>
                <p className="mt-0.5 text-xs text-dark-text-muted">
                  {item.date ? item.date.split('-').reverse().join('/') : `${formatMonthKey(item.month)} · dia não informado`}
                  {item.event.cashTreatment === 'card' && ` · ${cardDueMonthForOccurrence(item) ? `fatura de ${formatMonthKey(cardDueMonthForOccurrence(item)!)}` : 'mês da fatura não informado'}`}
                  {item.event.cashTreatment === 'planned' && ' · já no plano'}
                  {item.event.groupId && ` · ${forecast.funds.find((fund) => fund.id === item.event.groupId)?.name ?? 'grupo'}`}
                  {item.status === 'partial' && ` · parcial: ${formatCurrency(item.paidAmount)} registrado`}
                  {item.status === 'scheduled' && ' · lançado no cartão'}
                  {item.status === 'settled' && ' · liquidado'}
                  {item.status === 'overdue' && ' · atrasado'}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-dark-text">{item.event.kind === 'income' ? '+' : '−'} {formatCurrency(item.amount)}</span>
              <OccurrenceAdjustment item={item} onSave={(date, month, amount) => forecast.updateOccurrence(item.event.id, item.originalMonth, { date: date || undefined, month, amount })}
                onCancel={() => forecast.updateOccurrence(item.event.id, item.originalMonth, { cancelled: true })} />
              <CardOccurrenceAction item={item} accounts={cards.accounts} currentDueMonth={cards.settings.currentDueMonth ?? inferDueMonthFromPaymentDate(cards.settings.paymentDate)}
                onAdd={cards.addEntry} />
            </li>)}
          </ul>
        )}
      </div>
    </Panel>
  )
}
