import { useState } from 'react'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { useInvestmentsStore } from '../context/financasStore'
import { CURRENCY_LABELS, EXCHANGE_SOURCE_URL, FOREIGN_CURRENCIES, effectiveExchangeRate, exchangeDateLabel, exchangeQuoteIsOld } from '../lib/exchange'
import { inputClass } from '../lib/format'
import type { CurrencyExchangeSettings, ForeignCurrency } from '../types'
import { Card } from './Card'
import { FormField, PrimaryButton, SecondaryButton } from './ui'

const rateText = (rate?: number | null) => rate == null ? 'Sem cotação' : `R$ ${rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`

function CurrencyEditor({ currency, row, onClose }: { currency: ForeignCurrency; row: CurrencyExchangeSettings; onClose: () => void }) {
  const { exchange } = useInvestmentsStore()
  const [manual, setManual] = useState(row.manualRate !== undefined)
  const [rate, setRate] = useState(row.manualRate?.toString() ?? '')
  const [costs, setCosts] = useState(row.costsPct.toString())
  const [error, setError] = useState('')
  const [initial] = useState(row)
  return <form className="mt-4 space-y-3 border-t border-dark-border-subtle pt-4" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} onSubmit={(event) => {
    event.preventDefault()
    const manualRate = manual ? Number(rate.replace(',', '.')) : undefined
    const costsPct = Number(costs.replace(',', '.'))
    if (manual && (!manualRate || !Number.isFinite(manualRate) || manualRate <= 0) || !Number.isFinite(costsPct) || costsPct < 0 || costsPct > 100) {
      setError('Informe uma cotação positiva e custos entre 0% e 100%.'); return
    }
    if (!exchange.saveCurrency(currency, { manualRate, costsPct }, initial)) { setError('Os ajustes mudaram ou não puderam ser salvos. Feche e reabra para conferir.'); return }
    onClose()
  }}>
    <label className="flex items-center gap-2 text-sm text-dark-text-secondary"><input type="checkbox" className="app-checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} /> Usar meu custo efetivo por {currency}</label>
    {manual ? <FormField label={`Custo total em reais para comprar 1 ${currency}`}><input autoFocus inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Ex.: 6,2500" className={inputClass} required /></FormField>
      : <FormField label="Custos estimados sobre a PTAX (%)"><input autoFocus inputMode="decimal" value={costs} onChange={(event) => setCosts(event.target.value)} placeholder="Ex.: 5" className={inputClass} required /></FormField>}
    <p className="text-xs leading-relaxed text-dark-text-muted">{manual ? 'Informe o custo final da sua instituição, já com tarifas e tributos. O acréscimo estimado da PTAX não será somado novamente.' : 'Inclua sua estimativa de tarifas e tributos. Zero usa apenas a referência, que pode ser menor que o custo da compra.'}</p>
    {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
    <div className="flex gap-2"><PrimaryButton type="submit">Salvar cotação</PrimaryButton><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton></div>
  </form>
}

function CurrencyRow({ currency }: { currency: ForeignCurrency }) {
  const { exchange } = useInvestmentsStore()
  const [editing, setEditing] = useState(false)
  const row = exchange.settings.currencies[currency]
  const effective = effectiveExchangeRate(currency, exchange.settings)
  const old = exchangeQuoteIsOld(row.manualRate ? row.manualUpdatedAt : row.reference?.date)
  return <div className="rounded-xl border border-dark-border-subtle bg-dark-surface/40 p-4">
    <div className="flex items-start justify-between gap-3"><div>
      <h3 className="text-sm font-semibold text-dark-text">{CURRENCY_LABELS[currency]} <span className="font-normal text-dark-text-muted">· {currency}</span></h3>
      <p className="mt-2 text-lg font-semibold tabular-nums text-dark-text">{rateText(effective)} <span className="text-xs font-normal text-dark-text-muted">/ {currency}</span></p>
      <p className="mt-1 text-xs text-dark-text-secondary">{row.manualRate ? `Custo manual · informado em ${exchangeDateLabel(row.manualUpdatedAt)}` : `PTAX + ${row.costsPct.toLocaleString('pt-BR')}% de custos estimados`}</p>
    </div><SecondaryButton onClick={() => setEditing(!editing)}>{editing ? 'Fechar ajustes' : 'Ajustar'}</SecondaryButton></div>
    <p className="mt-3 text-xs text-dark-text-muted">{row.reference ? `Banco Central: ${rateText(row.reference.rate)} · fechamento de ${exchangeDateLabel(row.reference.date)}` : 'Referência automática ainda indisponível. Atualize ou informe seu custo manual.'}</p>
    {(effective === null || old) && <p className="mt-2 text-xs text-amber-200">{effective === null ? 'Metas nesta moeda aguardam uma cotação para calcular progresso e necessidade em reais.' : 'Cotação informada há mais de quatro dias. Confira antes de decidir.'}</p>}
    {editing && <CurrencyEditor currency={currency} row={row} onClose={() => setEditing(false)} />}
  </div>
}

export function ExchangeSettingsPanel() {
  const { exchange } = useInvestmentsStore()
  const [error, setError] = useState('')
  return <Card collapsible defaultCollapsed storageKey="settings-exchange" title="Cotações para metas" icon={<ArrowLeftRight size={17} />}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-dark-text-secondary">Custo em reais de cada unidade estrangeira. Atualiza as metas e o planejamento; seus saldos e movimentos continuam em reais.</p>
      <SecondaryButton onClick={() => void exchange.refresh()} disabled={exchange.refreshing}><RefreshCw size={14} className={exchange.refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />{exchange.refreshing ? 'Atualizando…' : 'Atualizar cotações'}</SecondaryButton>
    </div>
    <label className="mt-4 flex items-center gap-2 text-sm text-dark-text-secondary"><input type="checkbox" className="app-checkbox" checked={exchange.settings.autoUpdate} onChange={(event) => {
      setError(exchange.setAutoUpdate(event.target.checked) ? '' : 'Não foi possível salvar a atualização automática.')
    }} /> Buscar automaticamente ao abrir e a cada seis horas</label>
    <div className="mt-4 grid grid-cols-2 gap-4">{FOREIGN_CURRENCIES.map((currency) => <CurrencyRow key={currency} currency={currency} />)}</div>
    {(exchange.error || error) && <p role="alert" className="mt-3 text-sm text-amber-200">{error || exchange.error}</p>}
    <p className="mt-3 text-xs leading-relaxed text-dark-text-muted"><a href={EXCHANGE_SOURCE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">Banco Central · PTAX de venda</a>, último fechamento disponível, sem consulta em tempo real. A referência não inclui os custos da sua compra. A margem de segurança é definida em cada meta. Nenhum valor é convertido ou movimentado automaticamente.</p>
  </Card>
}
