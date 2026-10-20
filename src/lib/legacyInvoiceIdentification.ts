import type { LegacyInvoiceIdentification } from './cardCycleAccounting'
import { normalizeText } from './shared'

/** Mesma conferência no formulário, no comando e no backup (em centavos). */
export function legacyInvoiceIdentificationError(
  raw: unknown, accountIds: Set<string>, total: number | null, personalTotal: number, cents = false,
): string | null {
  const value = raw as LegacyInvoiceIdentification | undefined
  if (!value || typeof value.recordedAt !== 'string' || !Number.isFinite(Date.parse(value.recordedAt)) ||
    typeof value.reason !== 'string' || !value.reason.trim() || !Array.isArray(value.cards) || !value.cards.length) {
    return 'Informe os cartões e o motivo da identificação.'
  }
  const factor = cents ? 1 : 100
  const money = (row: object, key: string): number => {
    const amount = (row as Record<string, unknown>)[cents ? `${key}Cents` : key]
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 ||
      Math.abs(amount * factor - Math.round(amount * factor)) > 0.000001) return NaN
    const result = Math.round(amount * factor)
    return Number.isSafeInteger(result) ? result : NaN
  }
  const used = new Set<string>()
  let sum = 0, personal = 0
  for (const row of value.cards) {
    if (!row || !accountIds.has(row.accountId) || used.has(row.accountId) || !Array.isArray(row.others)) return 'Escolha cartões existentes, sem repetir o mesmo cartão.'
    used.add(row.accountId)
    const bank = money(row, 'total'), mine = money(row, 'personalTotal')
    if (!Number.isFinite(bank) || !Number.isFinite(mine) || mine > bank) return 'Informe valores válidos; minha parte não pode superar o total do cartão.'
    const names = new Set<string>()
    let others = 0
    for (const person of row.others) {
      if (!person || typeof person.name !== 'string' || !person.name.trim() || names.has(normalizeText(person.name))) return 'Informe o nome de cada pessoa, sem repetições no cartão.'
      names.add(normalizeText(person.name))
      const amount = money(person, 'amount')
      if (!Number.isFinite(amount) || amount <= 0) return 'Informe um valor positivo para cada pessoa.'
      others += amount
    }
    if (mine + others !== bank) return 'Minha parte e a parte das outras pessoas precisam somar o total de cada cartão.'
    sum += bank
    personal += mine
  }
  if (personal !== Math.round(personalTotal * factor) || total !== null && sum !== Math.round(total * factor)) {
    return 'A soma dos cartões deve conferir com o total original e com a minha parte original. Inclua todos os cartões desse pagamento.'
  }
  return null
}
