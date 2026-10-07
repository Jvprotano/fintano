import type { ExtraIncomeEntry, LedgerEntry, LedgerEntryKind, LedgerKindSource } from '../types'

export type LedgerOwner = 'holding' | 'goal' | 'debt'
const LEDGER_KINDS: LedgerEntryKind[] = [
  'opening_balance', 'contribution', 'withdrawal', 'transfer_in', 'transfer_out',
  'balance_increase', 'amortization', 'adjustment',
]
export const isLedgerEntryKind = (value: unknown): value is LedgerEntryKind =>
  LEDGER_KINDS.includes(value as LedgerEntryKind)

/** Classificação conservadora aplicada apenas a entradas sem tipo legado. */
export function classifyLegacyLedgerEntry(
  entry: Pick<LedgerEntry, 'amount' | 'note'>,
  owner: LedgerOwner,
): { kind: LedgerEntryKind; kindSource: LedgerKindSource } {
  const note = normalizeText(entry.note ?? '')
  if (entry.amount > 0 && (note === 'saldo inicial' || note === 'aporte inicial')) {
    return { kind: 'opening_balance', kindSource: 'legacy_ambiguous' }
  }
  if (owner === 'debt') {
    return { kind: entry.amount < 0 ? 'amortization' : 'balance_increase', kindSource: 'legacy_inferred' }
  }
  return { kind: entry.amount < 0 ? 'withdrawal' : 'contribution', kindSource: 'legacy_inferred' }
}

export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** A data real é escolhida no calendário local; meio-dia evita troca de dia por fuso. */
export function ledgerOperationDates(occurredOn?: string) {
  const recordedAt = nowIso()
  const candidate = occurredOn ? new Date(`${occurredOn}T12:00:00.000Z`) : null
  const validDay = occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) &&
    candidate && !Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === occurredOn
  const date = validDay ? candidate.toISOString() : recordedAt
  return { date, recordedAt }
}

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeExtraIncomeEntries(raw: unknown): ExtraIncomeEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const entry = item as Partial<ExtraIncomeEntry> | undefined
      return {
        id: typeof entry?.id === 'string' ? entry.id : '',
        name: typeof entry?.name === 'string' ? entry.name.trim() : '',
        amount: Math.max(0, finiteNumber(entry?.amount)),
        sourceEventId:
          typeof entry?.sourceEventId === 'string' && entry.sourceEventId
            ? entry.sourceEventId
            : undefined,
        ...(typeof entry?.sourceOccurrenceId === 'string' && entry.sourceOccurrenceId
          ? { sourceOccurrenceId: entry.sourceOccurrenceId } : {}),
        ...(typeof entry?.occurredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.occurredAt)
          ? { occurredAt: entry.occurredAt } : {}),
      }
    })
    .filter((entry) => entry.id && entry.name && entry.amount > 0)
}

/** Mês de competência (AAAA-MM) de uma data — o padrão é hoje. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function localDateKey(date: Date = new Date()): string {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

/** AAAA-MM deslocado em `count` meses. */
export function addMonths(month: string, count: number): string {
  const [year, index] = month.split('-').map(Number)
  if (!year || !index) return month
  const total = (year * 12 + (index - 1)) + count
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Distância em meses entre dois AAAA-MM (b − a). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return 0
  return (ty - fy) * 12 + (tm - fm)
}

export function normalizeLedger(raw: unknown, fallbackDate = nowIso(), owner: LedgerOwner = 'holding'): LedgerEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((tx: Partial<LedgerEntry> | undefined) => {
      const cycleMonth =
        typeof tx?.cycleMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(tx.cycleMonth)
          ? tx.cycleMonth
          : undefined
      const classification = isLedgerEntryKind(tx?.kind)
        ? { kind: tx!.kind, kindSource: tx?.kindSource }
        : classifyLegacyLedgerEntry({ amount: finiteNumber(tx?.amount), note: tx?.note }, owner)
      return {
        id: tx?.id || uid(),
        amount: finiteNumber(tx?.amount),
        kind: classification.kind,
        kindSource: classification.kindSource,
        date: tx?.date || fallbackDate,
        recordedAt: tx?.recordedAt && Number.isFinite(Date.parse(tx.recordedAt)) ? tx.recordedAt : undefined,
        operationId: tx?.operationId,
        cashTreatment: tx?.cashTreatment,
        linkedCostId: tx?.linkedCostId,
        note: tx?.note?.trim() || undefined,
        cycleMonth,
      }
    })
    .filter((tx) => tx.amount !== 0)
}

/**
 * Competência financeira do lançamento. Dados antigos não tinham ciclo;
 * nesses casos preservamos o comportamento histórico usando o mês da data.
 */
export function ledgerEntryCycleMonth(entry: LedgerEntry): string {
  return entry.cycleMonth ?? entry.date.slice(0, 7)
}

export function ledgerBalance(transactions: LedgerEntry[]): number {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0)
}

/** Remove acentos e caixa — usado em buscas e comparações de nome. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
