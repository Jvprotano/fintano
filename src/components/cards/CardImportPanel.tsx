import { useMemo, useState } from 'react'
import { Panel, PanelHeader, PrimaryButton, SecondaryButton } from '../ui'
import { formatCurrency, formatMonthLong, inputClass } from '../../lib/format'
import { parseSpreadsheetReport } from '../../lib/cardImport'
import { applyCardImport, reviewCardImport } from '../../data/cardImportCommand'
import { repositoryRevision } from '../../data/repositoryCommand'
import type { CreditCardAccount, CreditCardCycle, CreditCardEntry } from '../../types'
import { useFinancasStore } from '../../context/financasStore'

export function CardImportPanel({ text, onTextChange, cycle, onCycleChange, replace, onReplaceChange, currentDueMonth, nextDueMonth, account, entries, onImport }: {
  text: string; onTextChange: (value: string) => void
  cycle: CreditCardCycle; onCycleChange: (value: CreditCardCycle) => void
  replace: boolean; onReplaceChange: (value: boolean) => void
  currentDueMonth: string; nextDueMonth: string
  account?: CreditCardAccount; entries: CreditCardEntry[]; onImport: () => void
}) {
  const { thirdParties, cards } = useFinancasStore()
  const [revision, setRevision] = useState<string | null | undefined>()
  const [ignored, setIgnored] = useState<number[]>([])
  const [duplicates, setDuplicates] = useState<number[]>([])
  const [error, setError] = useState('')
  const report = useMemo(() => parseSpreadsheetReport(text), [text])
  const review = useMemo(() => account ? reviewCardImport(report, entries, account,
    cycle === 'current' ? currentDueMonth : nextDueMonth, replace, ignored, duplicates) : null,
  [report, entries, account, cycle, currentDueMonth, nextDueMonth, replace, ignored, duplicates])
  const destinationPaid = cards.paidInvoices.some((invoice) => invoice.accountId === account?.id && invoice.dueMonth === (cycle === 'current' ? currentDueMonth : nextDueMonth))
  const reset = () => { setRevision(undefined); setIgnored([]); setDuplicates([]); setError('') }
  const toggle = (line: number, list: number[], setter: (value: number[]) => void) => setter(list.includes(line) ? list.filter((value) => value !== line) : [...list, line])
  return <Panel>
    <PanelHeader title="Colar planilha do cartão" description="Cole Descrição, Data, Cartão, Fatura, É meu e demais colunas. Revise diferenças antes de salvar; linhas incertas podem ser corrigidas na colagem ou ignoradas." />
    <textarea aria-label="Conteúdo da planilha" value={text} onChange={(e) => { reset(); onTextChange(e.target.value) }}
      placeholder={'Descrição\tData\tCartão\tFatura\tÉ meu\nTotal Fitness\t06/10\tItaú\t100,00\t100,00'} className="app-field mt-4 min-h-[160px] w-full px-4 py-3 font-mono text-xs" />
    <div className="mt-3 flex items-end gap-3">
      <label className="block flex-1"><span className="app-form-label mb-1 block">Destino</span><select className={inputClass} value={cycle} onChange={(e) => { reset(); onCycleChange(e.target.value as CreditCardCycle) }}>
        <option value="current">Este ciclo · {formatMonthLong(currentDueMonth)}</option><option value="next">Próximo ciclo · {formatMonthLong(nextDueMonth)}</option>
      </select></label>
      <label className="flex items-center gap-2 p-3 text-sm text-dark-text-secondary"><input type="checkbox" checked={replace} onChange={(e) => { reset(); onReplaceChange(e.target.checked) }} />Substituir fatura de destino</label>
      <SecondaryButton disabled={destinationPaid || !review || report.length === 0} onClick={() => { setRevision(repositoryRevision()); setError('') }}>Revisar importação</SecondaryButton>
    </div>
    {destinationPaid && <p className="mt-3 text-xs text-primary-400">Esta fatura já foi paga. Selecione o próximo ciclo para importar novas compras.</p>}
    {revision !== undefined && review && !destinationPaid && <div className="mt-4 space-y-3 border-t border-dark-border pt-3">
      <p className="text-sm text-dark-text-secondary">{review.added} novas · {review.updated} alteradas · {review.unchanged} preservadas · {review.removed.length} removidas</p>
      <p className="text-xs tabular-nums text-dark-text-muted">Fatura: {formatCurrency(review.beforeTotal)} → {formatCurrency(review.afterTotal)}. Valores importados para {account?.name}.</p>
      <div className="max-h-80 space-y-2 overflow-y-auto">{review.rows.map((row) => <div key={row.line} className="flex items-center justify-between gap-4 rounded-lg bg-dark-surface px-3 py-2 text-xs">
        <div><strong className="text-dark-text">Linha {row.line} · {row.description}</strong><p className="mt-1 text-dark-text-muted">{row.status}</p></div>
        <div className="flex shrink-0 items-center gap-3">{row.amount !== undefined && <span className="tabular-nums">{formatCurrency(row.amount)}</span>}
          {report.find((value) => value.line === row.line)?.entry && <label><input type="checkbox" checked={!ignored.includes(row.line)} onChange={() => toggle(row.line, ignored, setIgnored)} /> Incluir</label>}
          {row.duplicate && <label><input type="checkbox" checked={duplicates.includes(row.line)} onChange={() => toggle(row.line, duplicates, setDuplicates)} /> Adicionar mesmo assim</label>}
        </div>
      </div>)}</div>
      {review.removed.length > 0 && <details className="text-xs text-dark-text-secondary"><summary className="cursor-pointer">Itens que sairão ({review.removed.length})</summary><div className="mt-2 space-y-1">{review.removed.map((entry) => <p key={entry.id}>{entry.description} · {entry.entryType ? 'abatimento' : 'compra'} · {formatCurrency(entry.amount)}{entry.sourceForecastOccurrenceId ? ' · vínculo com Futuro' : ''}{entry.isPrepaid ? ' · já antecipada' : ''}{thirdParties.records.some((row) => row.entryId === entry.id) ? ' · adiantamento/devoluções preservados em Terceiros' : ''}</p>)}</div></details>}
      {replace && <p className="text-xs text-dark-text-muted">A substituição alcança apenas esta fatura deste cartão. Recebimentos de terceiros já registrados são preservados.</p>}
      <PrimaryButton disabled={review.result.length === 0 || review.added + review.updated + review.removed.length === 0} onClick={() => {
        const saved = applyCardImport(review, revision)
        if (!saved.ok) { setError(saved.message); return }
        reset(); onImport()
      }}>Confirmar importação</PrimaryButton>
    </div>}
    {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
  </Panel>
}
