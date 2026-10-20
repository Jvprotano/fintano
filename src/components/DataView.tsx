import { useMemo, useState } from 'react'
import { ChartNoAxesCombined, CreditCard } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCardsStore, useFinancasStore } from '../context/financasStore'
import { buildCardDataInvoices, cardDataMonths, cardInvoiceChange, type CardDataMetric } from '../lib/cardData'
import { addMonths } from '../lib/shared'
import { formatCurrency, formatCurrencyShort, formatMonthKey, inputClass } from '../lib/format'
import { INVESTMENT_CLASS_PRESET_COLORS } from '../types/constants'
import { EmptyState, FormField, Panel, PanelHeader } from './ui'

type Period = '6' | '12' | 'all' | 'custom'
const validMonth = (month: string) => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)

export function DataView() {
  const { accounts, entries, paidInvoices } = useCardsStore()
  const { activeCycle } = useFinancasStore()
  const [metric, setMetric] = useState<CardDataMetric>('personalTotal')
  const [includeOpen, setIncludeOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('12')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null)

  const allInvoices = useMemo(
    () => buildCardDataInvoices(accounts, entries, paidInvoices, activeCycle.month),
    [accounts, entries, paidInvoices, activeCycle.month],
  )
  const eligible = allInvoices.filter((invoice) => includeOpen || invoice.paid)
  const lastMonth = eligible.at(-1)?.dueMonth ?? activeCycle.month
  const firstMonth = eligible[0]?.dueMonth ?? lastMonth
  const end = period === 'custom' ? customRange.end : lastMonth
  const start = period === 'custom' ? customRange.start
    : period === 'all' ? firstMonth : addMonths(lastMonth, -(Number(period) - 1))
  const rangeValid = validMonth(start) && validMonth(end) && start <= end
  const selected = accounts.filter((account) => selectedIds === null || selectedIds.includes(account.id))
  const invoices = rangeValid ? eligible.filter((invoice) => invoice.dueMonth >= start && invoice.dueMonth <= end
    && selected.some((account) => account.id === invoice.accountId)) : []
  const byKey = new Map(invoices.map((invoice) => [`${invoice.accountId}:${invoice.dueMonth}`, invoice]))
  const months = rangeValid ? cardDataMonths(start, end) : []
  const series = selected.map((account) => ({ ...account,
    key: `card${accounts.indexOf(account)}`,
    color: INVESTMENT_CLASS_PRESET_COLORS[accounts.indexOf(account) % INVESTMENT_CLASS_PRESET_COLORS.length],
  }))
  const chartData = months.map((month) => ({ month,
    ...Object.fromEntries(series.map((account) => [account.key, byKey.get(`${account.id}:${month}`)?.[metric] ?? null])),
  }))
  const hasValues = invoices.some((invoice) => invoice[metric] !== null)
  const legacyCount = rangeValid ? paidInvoices.filter((invoice) => !invoice.accountId
    && invoice.dueMonth >= start && invoice.dueMonth <= end).length : 0
  const metricLabel = metric === 'personalTotal' ? 'Minha parte da fatura' : 'Total da fatura ao banco'
  const changeRange = (key: 'start' | 'end', value: string) => {
    setCustomRange({ start, end, [key]: value })
    setPeriod('custom')
  }
  const toggleCard = (id: string) => setSelectedIds((current) => {
    const ids = current ?? accounts.map((account) => account.id)
    return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
  })

  return <Panel>
    <PanelHeader title="Evolução dos cartões" icon={<ChartNoAxesCombined size={16} />}
      description="Compare as faturas de cada cartão por mês de vencimento." />

    <div className="mt-5 grid grid-cols-3 gap-3 xl:grid-cols-5">
      <FormField label="Período">
        <select className={inputClass} value={period} onChange={(event) => {
          if (event.target.value === 'custom') setCustomRange({ start, end })
          setPeriod(event.target.value as Period)
        }}>
          <option value="6">6 meses</option><option value="12">12 meses</option>
          <option value="all">Todo o histórico</option><option value="custom">Personalizado</option>
        </select>
      </FormField>
      <FormField label="Vencimento inicial">
        <input className={inputClass} type="month" min="1900-01" max="2099-12" value={start}
          onChange={(event) => changeRange('start', event.target.value)} />
      </FormField>
      <FormField label="Vencimento final">
        <input className={inputClass} type="month" min="1900-01" max="2099-12" value={end}
          onChange={(event) => changeRange('end', event.target.value)} />
      </FormField>
      <FormField label="Valor comparado">
        <select className={inputClass} value={metric} onChange={(event) => setMetric(event.target.value as CardDataMetric)}>
          <option value="personalTotal">Minha parte da fatura</option><option value="total">Total ao banco</option>
        </select>
      </FormField>
      <FormField label="Faturas">
        <select className={inputClass} value={includeOpen ? 'all' : 'paid'} onChange={(event) => setIncludeOpen(event.target.value === 'all')}>
          <option value="paid">Somente pagas</option><option value="all">Pagas e em aberto</option>
        </select>
      </FormField>
    </div>
    <fieldset className="mt-4">
      <legend className="app-form-label mb-2">Cartões</legend>
      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((account, index) => {
          const active = selected.some((item) => item.id === account.id)
          return <button key={account.id} type="button" aria-pressed={active} onClick={() => toggleCard(account.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${active
              ? 'border-dark-border bg-dark-hover text-dark-text' : 'border-dark-border-subtle text-dark-text-muted hover:bg-dark-surface'}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active
              ? INVESTMENT_CLASS_PRESET_COLORS[index % INVESTMENT_CLASS_PRESET_COLORS.length] : 'var(--color-dark-text-muted)' }} />
            {account.name}
          </button>
        })}
        {accounts.length > 1 && <button type="button" className="rounded-lg px-3 py-2 text-xs text-dark-text-secondary hover:bg-dark-surface"
          onClick={() => setSelectedIds(selected.length === accounts.length ? [] : null)}>
          {selected.length === accounts.length ? 'Limpar seleção' : 'Selecionar todos'}
        </button>}
      </div>
    </fieldset>

    <div className="mt-5 border-t border-dark-border-subtle pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-dark-text">{metricLabel}</h2>
        {rangeValid && <span className="text-xs text-dark-text-muted">{formatMonthKey(start)} — {formatMonthKey(end)} · por vencimento</span>}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">
        {metric === 'personalTotal' ? 'Sua parcela da fatura, após abatimentos e antecipações.' : 'Valor devido ao banco, incluindo a parte não pessoal, após abatimentos e antecipações.'}
        {' '}Parcelas aparecem na fatura correspondente, não no mês da compra. Lacunas são dados ausentes, não zero.
        {includeOpen && ' Em aberto: valores provisórios até o pagamento; inclui até a fatura do ciclo ativo de cada cartão.'}
      </p>
    </div>

    <div className="mt-4" aria-live="polite">
      {!rangeValid ? <EmptyState title="Revise o período">Informe os dois meses, com o início anterior ou igual ao fim.</EmptyState>
        : !accounts.length ? <EmptyState title="Nenhum cartão cadastrado" icon={<CreditCard size={20} />}>Cadastre seus cartões em Configurações. As faturas registradas ficarão disponíveis aqui.</EmptyState>
        : !selected.length ? <EmptyState title="Selecione um cartão">Use os botões acima para escolher os cartões que deseja comparar.</EmptyState>
        : !hasValues ? <EmptyState title="Sem valores para estes filtros">Escolha outro período ou inclua faturas em aberto. As faturas pagas aparecem conforme os pagamentos forem registrados. Totais antigos desconhecidos não são estimados.</EmptyState>
        : <>
          <div className="h-80 min-w-0" role="img" aria-label={`Gráfico de linhas de ${metricLabel.toLowerCase()} por vencimento: ${selected.map((account) => account.name).join(', ')}. Valores na tabela abaixo.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 18, left: 0, bottom: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--color-dark-border-subtle)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} minTickGap={30}
                  tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 12 }} tickFormatter={formatMonthKey} />
                <YAxis width={78} axisLine={false} tickLine={false} domain={[0, 'auto']}
                  tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 12 }} tickFormatter={(value) => formatCurrencyShort(Number(value))} />
                <Tooltip contentStyle={{ background: 'var(--color-dark-surface)', border: '1px solid var(--color-dark-border)', borderRadius: 12 }}
                  labelStyle={{ color: 'var(--color-dark-text)', marginBottom: 6 }}
                  itemStyle={{ fontSize: 12 }} labelFormatter={(month) => formatMonthKey(String(month))}
                  formatter={(value, name, item) => {
                    const account = series.find((row) => row.key === item.dataKey)
                    const invoice = account ? byKey.get(`${account.id}:${item.payload.month}`) : undefined
                    return [formatCurrency(Number(value)), `${name} · ${invoice?.paid ? 'Paga' : 'Em aberto'}`]
                  }} />
                {series.map((account) => <Line key={account.id} dataKey={account.key} name={account.name} type="linear"
                  stroke={account.color} strokeWidth={2.2} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }}
                  connectNulls={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="pb-3 text-left text-xs text-dark-text-secondary">Última fatura no período · comparação com o mês de vencimento imediatamente anterior</caption>
              <thead className="border-b border-dark-border text-xs text-dark-text-muted">
                <tr><th scope="col" className="pb-2 font-medium">Cartão</th><th scope="col" className="pb-2 font-medium">Última fatura</th>
                  <th scope="col" className="pb-2 text-right font-medium">Valor</th><th scope="col" className="pb-2 pl-4 text-right font-medium">Mês anterior</th>
                  <th scope="col" className="pb-2 pl-4 text-right font-medium">Variação</th></tr>
              </thead>
              <tbody className="divide-y divide-dark-border-subtle">
                {series.map((account) => {
                  const latest = invoices.filter((invoice) => invoice.accountId === account.id).at(-1)
                  const previous = latest ? byKey.get(`${account.id}:${addMonths(latest.dueMonth, -1)}`) : undefined
                  const change = latest ? cardInvoiceChange(latest, previous, metric) : null
                  return <tr key={account.id}>
                    <th scope="row" className="py-3 pr-4 font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: account.color }} />{account.name}</th>
                    <td className="py-3 text-dark-text-secondary">{latest ? <>{formatMonthKey(latest.dueMonth)}<span className="ml-2 text-xs text-dark-text-muted">{latest.paid ? 'Paga' : 'Em aberto'}</span></> : 'Sem registro'}</td>
                    <td className="py-3 text-right">{latest?.[metric] != null ? formatCurrency(latest[metric]) : '—'}</td>
                    <td className="py-3 pl-4 text-right text-dark-text-secondary">{previous?.[metric] != null ? formatCurrency(previous[metric]) : '—'}</td>
                    <td className="py-3 pl-4 text-right">{change ? <span className={change.delta < 0 ? 'text-primary-400' : 'text-dark-text'}>
                      {change.delta > 0 ? '+' : ''}{formatCurrency(change.delta)}
                      <span className="ml-1.5 text-xs">{change.percent !== null ? `(${change.percent > 0 ? '+' : ''}${change.percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : '(base zero)'}</span>
                    </span> : <span className="text-xs text-dark-text-muted">Sem comparação</span>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <details className="mt-4 border-t border-dark-border-subtle pt-3">
            <summary className="w-fit cursor-pointer rounded text-sm text-dark-text-secondary hover:text-dark-text">Ver valores por mês</summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <caption className="sr-only">{metricLabel} por mês de vencimento e cartão. Traço indica ausência de valor conhecido.</caption>
                <thead className="sticky top-0 bg-dark-card text-xs text-dark-text-muted"><tr>
                  <th scope="col" className="py-2 font-medium">Vencimento</th>
                  {series.map((account) => <th key={account.id} scope="col" className="py-2 pl-4 text-right font-medium">{account.name}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-dark-border-subtle">
                  {[...months].reverse().map((month) => <tr key={month}>
                    <th scope="row" className="py-2 font-normal text-dark-text-secondary">{formatMonthKey(month)}</th>
                    {series.map((account) => {
                      const invoice = byKey.get(`${account.id}:${month}`)
                      return <td key={account.id} className="py-2 pl-4 text-right">{invoice?.[metric] != null
                        ? <>{formatCurrency(invoice[metric])}<span className="ml-2 text-xs text-dark-text-muted">{invoice.paid ? 'Paga' : 'Em aberto'}</span></> : <span className="text-dark-text-muted">—</span>}</td>
                    })}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </>}
    </div>
    {legacyCount > 0 && <p className="mt-4 text-xs leading-relaxed text-dark-text-muted">{legacyCount} {legacyCount === 1 ? 'fatura antiga sem cartão identificado não participa' : 'faturas antigas sem cartão identificado não participam'} desta comparação. Consulte os agregados no Histórico.</p>}
  </Panel>
}
