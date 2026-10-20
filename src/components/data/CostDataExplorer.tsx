import { useMemo, useState } from 'react'
import { ChartNoAxesCombined } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useActualsStore, useFinancasStore, useHistoryStore, useScenarioStore } from '../../context/financasStore'
import { cardDataMonths } from '../../lib/cardData'
import { buildCostDataCycles, type CostDataCategory } from '../../lib/costData'
import { addMonths } from '../../lib/shared'
import { formatCurrency, formatCurrencyShort, formatMonthKey, inputClass } from '../../lib/format'
import { CHART_PALETTE, COST_CATEGORIES, COST_CATEGORY_COLORS, INVESTMENT_CLASS_PRESET_COLORS } from '../../types/constants'
import { EmptyState, FormField, Panel, PanelHeader } from '../ui'

type Period = '6' | '12' | 'all' | 'custom'
const validMonth = (month: string) => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)
const categories = [...COST_CATEGORIES.map((row) => ({ ...row, color: COST_CATEGORY_COLORS[row.key] })),
  { key: 'unclassified', label: 'Sem categoria', color: CHART_PALETTE.muted }] as const

export function CostDataExplorer() {
  const { months: actuals } = useActualsStore()
  const { snapshots } = useHistoryStore()
  const { monthlyPlans, scenarios } = useScenarioStore()
  const { activeCycle } = useFinancasStore()
  const cycles = useMemo(() => buildCostDataCycles(actuals, snapshots, monthlyPlans, scenarios),
    [actuals, snapshots, monthlyPlans, scenarios])
  const [period, setPeriod] = useState<Period>('12')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [category, setCategory] = useState<CostDataCategory | 'all'>('all')
  const [detail, setDetail] = useState(false)
  const [includeOngoing, setIncludeOngoing] = useState(true)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const eligible = cycles.filter((row) => includeOngoing || row.closed)
  const lastMonth = eligible.at(-1)?.month ?? activeCycle.month
  const firstMonth = eligible[0]?.month ?? lastMonth
  const end = period === 'custom' ? customRange.end : lastMonth
  const start = period === 'custom' ? customRange.start
    : period === 'all' ? firstMonth : addMonths(lastMonth, -(Number(period) - 1))
  const rangeValid = validMonth(start) && validMonth(end) && start <= end
  const filtered = rangeValid ? eligible.filter((row) => row.month >= start && row.month <= end) : []
  const availableCategories = categories.filter((cat) => cycles.some((row) => Object.hasOwn(row.categories, cat.key)
    || row.items.some((item) => item.category === cat.key)))
  const items = [...new Map(filtered.flatMap((row) => row.items)
    .filter((item) => category === 'all' || item.category === category).map((item) => [item.id, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id))
  const series = detail ? items.map((item, index) => ({ id: item.id, key: `item${index}`,
    name: items.some((other) => other.id !== item.id && other.name === item.name) ? `${item.name} · ${item.id}` : item.name,
    color: INVESTMENT_CLASS_PRESET_COLORS[index % INVESTMENT_CLASS_PRESET_COLORS.length] }))
    : availableCategories.filter((cat) => category === 'all' || category === cat.key)
      .map((cat) => ({ id: cat.key, key: cat.key, name: cat.label, color: cat.color }))
  const selected = series.filter((row) => !hiddenIds.includes(row.id))
  const months = rangeValid ? cardDataMonths(start, end) : []
  const byMonth = new Map(filtered.map((row) => [row.month, row]))
  const amountFor = (month: string, id: string): number | null => {
    const cycle = byMonth.get(month)
    if (!cycle) return null
    if (!detail) return cycle.categories[id as CostDataCategory] ?? null
    return cycle.items.find((item) => item.id === id && (category === 'all' || item.category === category))?.amount ?? null
  }
  const chartData = months.map((month) => ({ month,
    ...Object.fromEntries(selected.map((row) => [row.key, amountFor(month, row.id)])),
  }))
  const hasValues = months.some((month) => selected.some((row) => amountFor(month, row.id) !== null))
  const hasOngoing = filtered.some((row) => !row.closed)
  const missingDetails = detail && filtered.some((row) => row.closed && availableCategories.some((cat) => {
    if (category !== 'all' && category !== cat.key) return false
    const total = row.categories[cat.key]
    const recorded = row.items.filter((item) => item.category === cat.key)
    return total !== undefined && (!recorded.length || Math.round(recorded.reduce((sum, item) => sum + item.amount, 0) * 100) !== Math.round(total * 100))
  }))
  const changeRange = (key: 'start' | 'end', value: string) => {
    setCustomRange({ start, end, [key]: value })
    setPeriod('custom')
  }
  const status = (month: string) => byMonth.get(month)?.closed ? 'Fechado' : 'Em andamento · parcial'

  return <Panel>
    <PanelHeader title="Evolução dos custos fixos" icon={<ChartNoAxesCombined size={16} />}
      description="Compare seus custos em conta por competência e veja quais contas mudaram ao longo do tempo." />
    <div className="mt-5 grid grid-cols-3 gap-3 xl:grid-cols-6">
      <FormField label="Período">
        <select className={inputClass} value={period} onChange={(event) => {
          if (event.target.value === 'custom') setCustomRange({ start, end })
          setPeriod(event.target.value as Period)
        }}><option value="6">6 meses</option><option value="12">12 meses</option>
          <option value="all">Todo o histórico</option><option value="custom">Personalizado</option></select>
      </FormField>
      <FormField label="Competência inicial"><input className={inputClass} type="month" min="1900-01" max="2099-12"
        value={start} onChange={(event) => changeRange('start', event.target.value)} /></FormField>
      <FormField label="Competência final"><input className={inputClass} type="month" min="1900-01" max="2099-12"
        value={end} onChange={(event) => changeRange('end', event.target.value)} /></FormField>
      <FormField label="Categoria"><select className={inputClass} value={category} onChange={(event) => {
        setCategory(event.target.value as CostDataCategory | 'all'); setHiddenIds([])
      }}><option value="all">Todas as categorias</option>
        {availableCategories.map((cat) => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
      </select></FormField>
      <FormField label="Detalhamento"><select className={inputClass} value={detail ? 'items' : 'categories'} onChange={(event) => {
        setDetail(event.target.value === 'items'); setHiddenIds([])
      }}><option value="categories">Por categoria</option><option value="items">Por custo</option></select></FormField>
      <FormField label="Ciclos"><select className={inputClass} value={includeOngoing ? 'all' : 'closed'}
        onChange={(event) => setIncludeOngoing(event.target.value === 'all')}>
        <option value="all">Todos os ciclos</option><option value="closed">Somente fechados</option>
      </select></FormField>
    </div>
    {series.length > 0 && <fieldset className="mt-4">
      <legend className="app-form-label mb-2">{detail ? 'Custos' : 'Categorias'}</legend>
      <div className="flex flex-wrap items-center gap-2">{series.map((row) => {
        const active = !hiddenIds.includes(row.id)
        return <button key={row.id} type="button" aria-pressed={active}
          onClick={() => setHiddenIds((ids) => active ? [...ids, row.id] : ids.filter((id) => id !== row.id))}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${active
            ? 'border-dark-border bg-dark-hover text-dark-text' : 'border-dark-border-subtle text-dark-text-muted hover:bg-dark-surface'}`}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? row.color : 'var(--color-dark-text-muted)' }} />{row.name}
        </button>
      })}</div>
    </fieldset>}
    <div className="mt-5 border-t border-dark-border-subtle pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-dark-text">Custos em conta · {detail ? 'por custo' : 'por categoria'}</h2>
        {rangeValid && <span className="text-xs text-dark-text-muted">{formatMonthKey(start)} — {formatMonthKey(end)} · por competência</span>}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-dark-text-muted">
        {detail ? 'Valores registrados em cada custo no Ciclo, inclusive os arquivados. Ajustes já fazem parte do total.'
          : 'Categorias dos fechamentos preservados; nos ciclos em andamento, soma dos custos já registrados.'}
        {' '}Somente sua parte paga em conta, sem faturas, Desejos ou descontos em folha. Lacunas são dados ausentes, não zero.
        {hasOngoing && ' Em andamento: valores parciais, que ainda podem aumentar até o fechamento.'}
      </p>
      {missingDetails && <p className="mt-2 text-xs leading-relaxed text-dark-text-secondary">Há fechamentos sem detalhamento completo por custo. Os itens disponíveis são mostrados sem repartir ou estimar a diferença; consulte o total em Por categoria.</p>}
    </div>
    <div className="mt-4" aria-live="polite">
      {!rangeValid ? <EmptyState title="Revise o período">Informe os dois meses, com o início anterior ou igual ao fim.</EmptyState>
        : !series.length || (!hasValues && selected.length > 0) ? <EmptyState title="Sem valores para estes filtros">Escolha outro período, categoria ou detalhamento. Registre os custos no Ciclo; valores do plano não são pagamentos. Fechamentos antigos podem ter apenas o total por categoria.</EmptyState>
        : !selected.length ? <EmptyState title={detail ? 'Selecione um custo' : 'Selecione uma categoria'}>Use os botões acima para escolher o que deseja comparar.</EmptyState>
        : <>
          <div className="h-80 min-w-0" role="img" aria-label={`Gráfico de evolução dos custos em conta por competência: ${selected.map((row) => row.name).join(', ')}. Valores na tabela abaixo.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 18, left: 0, bottom: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--color-dark-border-subtle)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} minTickGap={30}
                  tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 12 }} tickFormatter={formatMonthKey} />
                <YAxis width={78} axisLine={false} tickLine={false} domain={[0, 'auto']}
                  tick={{ fill: 'var(--color-dark-text-muted)', fontSize: 12 }} tickFormatter={(value) => formatCurrencyShort(Number(value))} />
                <Tooltip contentStyle={{ background: 'var(--color-dark-surface)', border: '1px solid var(--color-dark-border)', borderRadius: 12 }}
                  labelStyle={{ color: 'var(--color-dark-text)', marginBottom: 6 }} itemStyle={{ fontSize: 12 }}
                  labelFormatter={(month) => `${formatMonthKey(String(month))} · ${status(String(month))}`}
                  formatter={(value, name) => [formatCurrency(Number(value)), name]} />
                {selected.map((row) => <Line key={row.id} dataKey={row.key} name={row.name} type="linear" stroke={row.color}
                  strokeWidth={2.2} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-4 border-t border-dark-border-subtle pt-3">
            <summary className="w-fit cursor-pointer rounded text-sm text-dark-text-secondary hover:text-dark-text">Ver valores por mês</summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <caption className="sr-only">Custos em conta por competência. Traço indica ausência de valor conhecido; em andamento indica valor parcial.</caption>
                <thead className="sticky top-0 bg-dark-card text-xs text-dark-text-muted"><tr>
                  <th scope="col" className="py-2 font-medium">Competência</th>
                  {selected.map((row) => <th key={row.id} scope="col" className="py-2 pl-4 text-right font-medium">{row.name}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-dark-border-subtle">{[...months].reverse().map((month) => <tr key={month}>
                  <th scope="row" className="whitespace-nowrap py-2 font-normal text-dark-text-secondary">{formatMonthKey(month)}
                    {byMonth.has(month) && <span className="ml-2 text-xs text-dark-text-muted">{status(month)}</span>}</th>
                  {selected.map((row) => <td key={row.id} className="whitespace-nowrap py-2 pl-4 text-right">
                    {amountFor(month, row.id) !== null ? formatCurrency(amountFor(month, row.id)!) : <span className="text-dark-text-muted">—</span>}
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>}
    </div>
  </Panel>
}
