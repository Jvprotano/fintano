import { useId, useState } from 'react'
import { FileDown } from 'lucide-react'
import type { CreditCardAccount } from '../../types'
import type { CycleCardEntry } from '../../lib/cardCycleView'
import { cardFilterError, type CardEntryFilters } from '../../lib/cardEntryFilters'
import { buildCardReport, CARD_REPORT_VALUES, type CardReportValue } from '../../lib/cardReport'
import { FormField, SecondaryButton } from '../ui'

export function CardReportExport({ entries, accounts, filters, cycleMonth }: {
  entries: CycleCardEntry[]
  accounts: CreditCardAccount[]
  filters: CardEntryFilters
  cycleMonth: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState<CardReportValue>('total')
  const [error, setError] = useState('')
  const id = useId()
  const openReport = () => {
    setError('')
    if (!entries.length || cardFilterError(filters)) return
    const report = window.open('', '_blank')
    if (!report) {
      setError('O navegador bloqueou o relatório. Permita abrir novas abas para o FinTano e tente novamente.')
      return
    }
    report.opener = null
    report.document.open()
    report.document.write(buildCardReport({ entries, accounts, filters, cycleMonth, value }))
    report.document.close()
    report.document.getElementById('print-report')?.addEventListener('click', () => report.print())
    report.focus()
  }
  return <div className="space-y-3 border-b border-dark-border-subtle px-4 py-3">
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs text-dark-text-muted">Exporte os lançamentos abaixo com os filtros e a ordenação atuais.</p>
      <SecondaryButton onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={id}><FileDown size={15} />Exportar relatório</SecondaryButton>
    </div>
    {expanded && <div id={id} className="space-y-3 rounded-xl border border-dark-border bg-dark-surface/60 p-4">
      <div className="flex items-end gap-4">
        <FormField label="Valores no relatório" className="w-72"><select value={value} onChange={(event) => setValue(event.target.value as CardReportValue)} className="app-field w-full px-3 py-2.5 text-sm">{Object.entries(CARD_REPORT_VALUES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField>
        <SecondaryButton onClick={openReport} disabled={!entries.length || !!cardFilterError(filters)}>Abrir relatório para PDF</SecondaryButton>
      </div>
      <p className="text-xs text-dark-text-secondary">Para enviar à sua mãe, filtre por ela e escolha Parte de outras pessoas. Na nova aba, use Salvar PDF / Imprimir e escolha Salvar como PDF.</p>
      {value === 'others' && <p className="text-xs text-dark-text-muted">A parte de outras pessoas é o valor da compra menos Minha parte. O texto de pessoa/observação filtra compras, sem dividir valores entre pessoas.</p>}
      {!entries.length && <p className="text-xs text-dark-text-muted">Nenhum lançamento para exportar. Ajuste os filtros.</p>}
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    </div>}
  </div>
}
