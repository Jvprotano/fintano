import { useId, useState } from 'react'
import { ChevronDown, Filter, Search } from 'lucide-react'
import type { CreditCardAccount } from '../../types'
import type { CycleCardEntry } from '../../lib/cardCycleView'
import { cardFilterError, EMPTY_CARD_FILTERS, type CardEntryFilters as Filters } from '../../lib/cardEntryFilters'
import { BUDGET_AREAS, BUDGET_AREA_LABELS } from '../../types/constants'
import { CurrencyInput } from '../CurrencyInput'
import { FormField, SecondaryButton } from '../ui'

export function CardEntryFilters({ filters, onChange, accounts, entries }: {
  filters: Filters
  onChange: (filters: Filters) => void
  accounts: CreditCardAccount[]
  entries: CycleCardEntry[]
}) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value })
  const active = Object.values(filters).filter((value) => value !== '' && value !== null).length
  const advanced = ['kind', 'area', 'payment', 'dateFrom', 'dateTo', 'minAmount', 'maxAmount'] as const
  const advancedCount = advanced.filter((key) => filters[key] !== '' && filters[key] !== null).length
  const observations = [...new Set(entries.flatMap((entry) => [entry.ownerName, entry.ownerNote]).filter((value): value is string => !!value?.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const field = 'app-field w-full px-3 py-2.5 text-sm'
  const error = cardFilterError(filters)
  return <div className="space-y-3 border-b border-dark-border-subtle p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm font-medium text-dark-text-secondary"><Filter size={15} />Filtros{active > 0 && ` · ${active} ativos`}</span>
      <div className="flex items-center gap-3">
        {active > 0 && <button type="button" onClick={() => onChange({ ...EMPTY_CARD_FILTERS })} className="text-xs text-dark-text-secondary hover:text-dark-text">Limpar filtros</button>}
        <SecondaryButton onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={`${id}-advanced`}>
          {expanded ? 'Menos filtros' : 'Mais filtros'}{advancedCount > 0 && ` (${advancedCount})`}<ChevronDown size={14} className={expanded ? 'rotate-180' : ''} />
        </SecondaryButton>
      </div>
    </div>
    <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.8fr)_minmax(180px,1fr)_minmax(180px,1fr)] gap-3">
      <FormField label="Buscar lançamentos">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted" /><input data-card-search value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Ex.: mercado, farmácia…" className={`${field} pl-9`} /></div>
      </FormField>
      <FormField label="Cartão"><select value={filters.accountId} onChange={(event) => update('accountId', event.target.value)} className={field}><option value="">Todos os cartões</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></FormField>
      <FormField label="Pessoa ou observação"><input value={filters.observation} onChange={(event) => update('observation', event.target.value)} list={`${id}-observations`} placeholder="Ex.: Mãe, viagem…" className={field} /><datalist id={`${id}-observations`}>{observations.map((text) => <option key={text} value={text} />)}</datalist></FormField>
      <FormField label="Participação na compra"><select value={filters.share} onChange={(event) => update('share', event.target.value as Filters['share'])} className={field}>
        <option value="">Todas as participações</option><option value="mine">Com parte minha</option><option value="others">Com parte de outras pessoas</option><option value="only-mine">Só minhas</option><option value="only-others">Só de outras pessoas</option><option value="shared">Compartilhadas</option>
      </select></FormField>
    </div>
    <div id={`${id}-advanced`} hidden={!expanded} className="space-y-3 border-t border-dark-border-subtle pt-3">
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Tipo de lançamento"><select value={filters.kind} onChange={(event) => update('kind', event.target.value as Filters['kind'])} className={field}><option value="">Todos os tipos</option><option value="single">Compras sem parcelamento</option><option value="installment">Compras parceladas</option><option value="recurring">Assinaturas recorrentes</option><option value="credit">Abatimentos</option></select></FormField>
        <FormField label="Área"><select value={filters.area} onChange={(event) => update('area', event.target.value as Filters['area'])} className={field}><option value="">Todas as áreas</option><option value="unclassified">Compras sem área</option>{BUDGET_AREAS.map((area) => <option key={area} value={area}>{BUDGET_AREA_LABELS[area]}</option>)}</select></FormField>
        <FormField label="Pagamento"><select value={filters.payment} onChange={(event) => update('payment', event.target.value as Filters['payment'])} className={field}><option value="">Todos os estados</option><option value="open">Em aberto (sem antecipação)</option><option value="paid">Em fatura paga</option><option value="prepaid">Compras antecipadas</option></select></FormField>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <FormField label="Data da compra · de"><input value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} placeholder="Ex.: 01/10" className={field} /></FormField>
        <FormField label="Data da compra · até"><input value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} placeholder="Ex.: 31/10" className={field} /></FormField>
        <FormField label="Valor mínimo"><CurrencyInput ariaLabel="Valor mínimo" value={filters.minAmount ?? 0} showZero={filters.minAmount !== null} onChange={(value) => update('minAmount', value)} onEmpty={() => update('minAmount', null)} placeholder="Sem mínimo" /></FormField>
        <FormField label="Valor máximo"><CurrencyInput ariaLabel="Valor máximo" value={filters.maxAmount ?? 0} showZero={filters.maxAmount !== null} onChange={(value) => update('maxAmount', value)} onEmpty={() => update('maxAmount', null)} placeholder="Sem máximo" /></FormField>
      </div>
      <p className="text-xs leading-relaxed text-dark-text-muted">Datas inclusivas em DD/MM, ou DD/MM/AAAA para exigir ano registrado. Sem ano, 20/12 a 10/01 cruza dezembro. Datas ausentes ou inválidas ficam fora do intervalo. O valor é o da linha na fatura (parcela), não o total da compra parcelada.</p>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    <p className="text-xs text-dark-text-muted">Os filtros se combinam e afetam somente a lista do ciclo selecionado e seus totais abaixo.</p>
  </div>
}
