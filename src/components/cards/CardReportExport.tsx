import { useState } from 'react'
import { FileDown } from 'lucide-react'
import type { CycleCardEntry } from '../../lib/cardCycleView'
import { cardFilterError, type CardEntryFilters } from '../../lib/cardEntryFilters'
import { buildCardReport } from '../../lib/cardReport'
import { SecondaryButton } from '../ui'

export function CardReportExport({ entries, filters }: {
  entries: CycleCardEntry[]
  filters: CardEntryFilters
}) {
  const [error, setError] = useState('')
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
    report.document.write(buildCardReport({ entries }))
    report.document.close()
    report.document.getElementById('print-report')?.addEventListener('click', () => report.print())
    report.focus()
  }
  return <div className="space-y-3 border-b border-dark-border-subtle px-4 py-3">
    <div className="flex justify-end">
      <SecondaryButton onClick={openReport} disabled={!entries.length || !!cardFilterError(filters)}><FileDown size={15} />Exportar relatório</SecondaryButton>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
  </div>
}
