import type { CycleCardEntry } from './cardCycleView'
import { formatCurrency, formatDate, formatMonthLong } from './format'

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const money = (cents: number) => escape(formatCurrency(cents / 100))

/** Documento de leitura: usa exatamente as linhas e a ordem da consulta, sem gravar fatos. */
export function buildCardReport({ entries, generatedAt = new Date() }: {
  entries: CycleCardEntry[]
  generatedAt?: Date
}) {
  const amount = (entry: CycleCardEntry) => Math.round(entry.amount * 100)
  const purchases = entries.filter((entry) => !entry.entryType)
  const credits = entries.filter((entry) => entry.entryType === 'invoiceCredit')
  const total = purchases.reduce((sum, entry) => sum + amount(entry), 0)
  const dueMonths = [...new Set(entries.flatMap((entry) => entry.dueMonth ? [entry.dueMonth] : []))].sort()
  const reference = dueMonths.length ? `Vencimento em ${dueMonths.map(formatMonthLong).join(' e ')}` : 'Vencimento não informado'
  const title = 'Relatório de cartões'
  const summary = `<div class="total"><span>Total das compras</span><strong>${money(total)}</strong></div>`
  const rows = entries.map((entry) => {
    const credit = entry.entryType === 'invoiceCredit'
    const status = [credit ? 'Abatimento' : '', entry.paidAt ? `Fatura paga em ${formatDate(entry.paidAt)}` : '', entry.isPrepaid ? 'Compra antecipada' : ''].filter(Boolean).join(' · ')
    return `<tr><td>${escape(entry.purchaseDate || '—')}</td><td><b>${escape(entry.description)}</b>${status ? `<small>${escape(status)}</small>` : ''}</td><td>${escape(entry.cardName)}</td><td>${entry.isRecurring ? 'Assinatura' : entry.installmentCurrent && entry.installmentTotal ? `${entry.installmentCurrent}/${entry.installmentTotal}` : '—'}</td><td>${escape([entry.ownerName, entry.ownerNote].filter(Boolean).join(' · ') || '—')}</td><td class="money">${credit ? '− ' : ''}${money(amount(entry))}</td></tr>`
  }).join('')
  const creditTotal = credits.reduce((sum, entry) => sum + amount(entry), 0)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;color:#18241e;background:#eef1ef;font:14px/1.45 'Segoe UI',Arial,sans-serif}main{max-width:1000px;margin:24px auto;background:white;padding:36px}h1{font-size:25px;margin:4px 0}p{margin:8px 0}.muted,small{color:#526158}.brand{font-size:12px;letter-spacing:.12em}small{display:block;font-size:11px;margin-top:3px}button{border:0;border-radius:6px;background:#116344;color:white;padding:12px 18px;font:inherit;cursor:pointer}.toolbar{max-width:1000px;margin:20px auto}.total{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:2px solid #314b3d;border-bottom:1px solid #ccd5cf;padding:16px 0;margin:18px 0;break-inside:avoid}.total strong{font-size:25px;white-space:nowrap;font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th{text-align:left;font-size:11px;background:#f1f4f2}th,td{padding:10px 7px;border-bottom:1px solid #dce2de;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:11%}th:nth-child(2){width:29%}th:nth-child(3){width:18%}th:nth-child(4){width:9%}th:nth-child(5){width:16%}th:last-child{width:17%}.money{text-align:right;font-variant-numeric:tabular-nums}thead{display:table-header-group}tr{break-inside:avoid}footer{color:#68756d;font-size:10px;text-align:right;margin-top:24px;break-inside:avoid}@page{size:A4 portrait;margin:14mm}@media print{body{background:white;font-size:12px}main{margin:0;padding:0;max-width:none}.toolbar{display:none}h1{font-size:22px}}
    </style></head><body><div class="toolbar"><button type="button" id="print-report">Salvar PDF / Imprimir</button></div><main><header><span class="brand">FINTANO</span><h1>${escape(title)}</h1><p class="muted">Referência: ${escape(reference)}</p></header>${summary}<table><thead><tr><th>Compra</th><th>Descrição</th><th>Cartão</th><th>Parcela</th><th>Pessoa / observação</th><th class="money">Valor</th></tr></thead><tbody>${rows}</tbody></table>${summary}${credits.length ? `<p>Abatimentos: ${money(creditTotal)}</p>` : ''}<footer>Gerado em ${escape(generatedAt.toLocaleString('pt-BR'))}</footer></main></body></html>`
}
