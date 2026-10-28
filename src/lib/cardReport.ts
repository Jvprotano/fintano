import type { CreditCardAccount } from '../types'
import type { CycleCardEntry } from './cardCycleView'
import type { CardEntryFilters } from './cardEntryFilters'
import { formatCardDueDate } from './creditCards'
import { formatCurrency, formatDate, formatMonthLong } from './format'
import { BUDGET_AREA_LABELS } from '../types/constants'

export const CARD_REPORT_VALUES = {
  total: 'Valor inteiro das compras',
  personal: 'Minha parte',
  others: 'Parte de outras pessoas',
} as const
export type CardReportValue = keyof typeof CARD_REPORT_VALUES

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const money = (cents: number) => escape(formatCurrency(cents / 100))

export function cardReportFilters(filters: CardEntryFilters, accounts: CreditCardAccount[]): string[] {
  const labels: string[] = []
  if (filters.search) labels.push(`Busca: ${filters.search}`)
  if (filters.accountId) labels.push(`Cartão: ${accounts.find((account) => account.id === filters.accountId)?.name ?? filters.accountId}`)
  if (filters.observation) labels.push(`Pessoa ou observação: ${filters.observation}`)
  if (filters.share) labels.push(`Participação: ${{ mine: 'Com parte minha', others: 'Com parte de outras pessoas', 'only-mine': 'Só minhas', 'only-others': 'Só de outras pessoas', shared: 'Compartilhadas' }[filters.share]}`)
  if (filters.kind) labels.push(`Tipo: ${{ single: 'Compras sem parcelamento', installment: 'Compras parceladas', recurring: 'Assinaturas recorrentes', credit: 'Abatimentos' }[filters.kind]}`)
  if (filters.area) labels.push(`Área: ${filters.area === 'unclassified' ? 'Compras sem área' : BUDGET_AREA_LABELS[filters.area]}`)
  if (filters.payment) labels.push(`Pagamento: ${{ open: 'Em aberto (sem antecipação)', paid: 'Em fatura paga', prepaid: 'Compras antecipadas' }[filters.payment]}`)
  if (filters.dateFrom) labels.push(`Data da compra de: ${filters.dateFrom}`)
  if (filters.dateTo) labels.push(`Data da compra até: ${filters.dateTo}`)
  if (filters.minAmount !== null) labels.push(`Valor mínimo da linha: ${formatCurrency(filters.minAmount)}`)
  if (filters.maxAmount !== null) labels.push(`Valor máximo da linha: ${formatCurrency(filters.maxAmount)}`)
  return labels
}

/** Documento de leitura: usa exatamente as linhas e a ordem da consulta, sem gravar fatos. */
export function buildCardReport({ entries, accounts, filters, cycleMonth, value, generatedAt = new Date() }: {
  entries: CycleCardEntry[]
  accounts: CreditCardAccount[]
  filters: CardEntryFilters
  cycleMonth: string
  value: CardReportValue
  generatedAt?: Date
}) {
  const amount = (entry: CycleCardEntry) => {
    const total = Math.round(entry.amount * 100)
    const personal = Math.round(entry.personalAmount * 100)
    return value === 'total' ? total : value === 'personal' ? personal : Math.max(0, total - personal)
  }
  const purchases = entries.filter((entry) => !entry.entryType)
  const credits = entries.filter((entry) => entry.entryType === 'invoiceCredit')
  const total = purchases.reduce((sum, entry) => sum + amount(entry), 0)
  const prepaid = purchases.filter((entry) => entry.isPrepaid).reduce((sum, entry) => sum + amount(entry), 0)
  const filterLabels = cardReportFilters(filters, accounts)
  const title = `Cartões · ${formatMonthLong(cycleMonth)}`
  const summary = `<div class="total"><span>Total das compras · ${escape(CARD_REPORT_VALUES[value])}</span><strong>${money(total)}</strong></div>`
  const rows = entries.map((entry) => {
    const credit = entry.entryType === 'invoiceCredit'
    const account = accounts.find((account) => account.id === entry.accountId)
    const due = entry.dueMonth ? formatCardDueDate(entry.dueMonth, account?.dueDay ?? 0) : null
    const dueLabel = due ?? (entry.dueMonth ? `${formatMonthLong(entry.dueMonth)} (dia não informado)` : 'Não informado')
    const status = [credit ? 'Abatimento' : '', entry.paidAt ? `Fatura paga em ${formatDate(entry.paidAt)}` : '', entry.isPrepaid ? 'Compra antecipada' : ''].filter(Boolean).join(' · ')
    return `<tr><td>${escape(entry.purchaseDate || '—')}</td><td><b>${escape(entry.description)}</b>${status ? `<small>${escape(status)}</small>` : ''}</td><td>${escape(entry.cardName)}<small>Venc.: ${escape(dueLabel)}</small></td><td>${entry.isRecurring ? 'Assinatura' : entry.installmentCurrent && entry.installmentTotal ? `${entry.installmentCurrent}/${entry.installmentTotal}` : '—'}</td><td>${escape([entry.ownerName, entry.ownerNote].filter(Boolean).join(' · ') || '—')}</td><td class="money">${credit ? value === 'total' ? `− ${money(Math.round(entry.amount * 100))}<small>Abatimento separado</small>` : '—<small>Sem atribuição pessoal</small>' : money(amount(entry))}</td></tr>`
  }).join('')
  const creditTotal = credits.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;color:#18241e;background:#eef1ef;font:14px/1.45 'Segoe UI',Arial,sans-serif}main{max-width:1000px;margin:24px auto;background:white;padding:36px}h1{font-size:25px;margin:4px 0}p{margin:8px 0}.muted,small{color:#526158}.brand{font-size:12px;letter-spacing:.12em}small{display:block;font-size:11px;margin-top:3px}button{border:0;border-radius:6px;background:#116344;color:white;padding:12px 18px;font:inherit;cursor:pointer}.toolbar{max-width:1000px;margin:20px auto;display:flex;align-items:center;gap:16px}.filters{font-size:12px;padding:12px 0;border-top:1px solid #ccd5cf;overflow-wrap:anywhere}.total{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:2px solid #314b3d;border-bottom:1px solid #ccd5cf;padding:16px 0;margin:18px 0;break-inside:avoid}.total strong{font-size:25px;white-space:nowrap;font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th{text-align:left;font-size:11px;background:#f1f4f2}th,td{padding:10px 7px;border-bottom:1px solid #dce2de;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:11%}th:nth-child(2){width:27%}th:nth-child(3){width:20%}th:nth-child(4){width:9%}th:nth-child(5){width:16%}th:last-child{width:17%}.money{text-align:right;font-variant-numeric:tabular-nums}.money small{white-space:normal}thead{display:table-header-group}tr{break-inside:avoid}footer{font-size:12px;margin-top:16px;break-inside:avoid}@page{size:A4 portrait;margin:14mm}@media print{body{background:white;font-size:12px}main{margin:0;padding:0;max-width:none}.toolbar{display:none}h1{font-size:22px}}
    </style></head><body><div class="toolbar"><button type="button" id="print-report">Salvar PDF / Imprimir</button><span>Escolha “Salvar como PDF” na janela de impressão para enviar o arquivo.</span></div><main><header><span class="brand">FINTANO · RELATÓRIO DE CARTÕES</span><h1>${escape(title)}</h1><p>${entries.length} lançamento(s) · Valores: <b>${escape(CARD_REPORT_VALUES[value])}</b></p><p class="muted">Gerado em ${escape(generatedAt.toLocaleString('pt-BR'))}</p></header><div class="filters">${filterLabels.length ? filterLabels.map(escape).join(' · ') : 'Sem filtros · todos os lançamentos do ciclo'}</div>${summary}<table><thead><tr><th>Compra</th><th>Descrição</th><th>Cartão / vencimento</th><th>Parcela</th><th>Pessoa / observação</th><th class="money">${escape(CARD_REPORT_VALUES[value])}</th></tr></thead><tbody>${rows}</tbody></table>${summary}<footer><p>Os valores são das compras filtradas, incluindo compras de faturas pagas e antecipadas; não representam saldo a pagar.</p>${prepaid > 0 ? `<p>Já antecipado nas compras acima (${escape(CARD_REPORT_VALUES[value])}): ${money(prepaid)}.</p>` : ''}${credits.length ? `<p>Abatimentos do recorte: ${money(creditTotal)}, apresentados separadamente e não descontados do total de compras. Não há atribuição de abatimentos à parte pessoal ou de outras pessoas.</p>` : ''}${value === 'others' ? '<p>Parte de outras pessoas = valor da compra menos minha parte. O filtro de pessoa/observação seleciona lançamentos; não divide valores entre diferentes pessoas.</p>' : ''}</footer></main></body></html>`
}
