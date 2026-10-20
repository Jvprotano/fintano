import { describe, expect, it } from 'vitest'
import { identifyLegacyInvoice } from './legacyInvoiceCommand'
import { backupV9ToRepository, createEmptyBackupV9, inspectBackupPayload, repositoryToBackupV9 } from './backupV7'
import { buildCardDataInvoices, cardDataPeople } from '../lib/cardData'
import { legacyInvoiceCash, type LegacyInvoiceIdentification, type PaidInvoiceSnapshot } from '../lib/cardCycleAccounting'
import type { CreditCardAccount, CreditCardEntry } from '../types'
import { createDefaultScenario } from '../lib/scenario'

const date = '2026-10-20T12:00:00.000Z'
function fixture() {
  const backup = createEmptyBackupV9(date)
  backup.cards.accounts = [{ id: 'itau', name: 'Itaú', closingDay: 0, dueDay: 5, limitCents: 0 }]
  backup.cards.statements = [{ id: 'old', accountId: null, dueMonth: '2026-09', paidAt: '2026-08-21T12:00:00.000Z',
    totalCents: 30000, personalTotalCents: 10000, spending: [] }]
  const document = backupV9ToRepository(backup)
  const scenario = createDefaultScenario('Atual')
  document.collections.scenarios = [scenario]
  document.collections.activeScenarioId = scenario.id
  return document
}
const identification: LegacyInvoiceIdentification = { recordedAt: date, reason: 'Extrato conferido',
  cards: [{ accountId: 'itau', total: 300, personalTotal: 100, others: [{ name: 'Mãe', amount: 200 }] }] }

describe('identificação de fatura antiga e consulta por pessoa', () => {
  it('conserva pagamento, caixa e coleções; identificação sobrevive ao backup v9 e alimenta Dados', () => {
    const before = fixture()
    const after = identifyLegacyInvoice(before, 'old', identification)
    const paid = after.collections.cardPaidInvoices as PaidInvoiceSnapshot[]
    expect(paid[0]).toEqual({ ...(before.collections.cardPaidInvoices as PaidInvoiceSnapshot[])[0], identification })
    expect(legacyInvoiceCash(paid[0], [], paid)).toEqual(legacyInvoiceCash((before.collections.cardPaidInvoices as PaidInvoiceSnapshot[])[0], [], []))
    expect({ ...after.collections, cardPaidInvoices: undefined }).toEqual({ ...before.collections, cardPaidInvoices: undefined })
    const exported = repositoryToBackupV9(after, date)
    expect(inspectBackupPayload(exported).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    const restored = backupV9ToRepository(exported)
    expect((restored.collections.cardPaidInvoices as PaidInvoiceSnapshot[])[0].identification).toEqual(identification)
    expect(buildCardDataInvoices(restored.collections.cardAccounts as CreditCardAccount[], [], restored.collections.cardPaidInvoices as PaidInvoiceSnapshot[], '2026-10', 'mãe')[0])
      .toMatchObject({ dueMonth: '2026-09', paid: true, total: 300, personalTotal: 100, nonPersonalTotal: 200, personTotal: 200 })
  })

  it('recusa somas divergentes, cartão repetido e referência inexistente; importação também recusa', () => {
    const document = fixture()
    expect(() => identifyLegacyInvoice(document, 'old', { ...identification, cards: [{ ...identification.cards[0], personalTotal: 99 }] })).toThrow()
    expect(() => identifyLegacyInvoice(document, 'old', { ...identification, cards: [...identification.cards, ...identification.cards] })).toThrow()
    expect(() => identifyLegacyInvoice(document, 'old', { ...identification, cards: [{ ...identification.cards[0], accountId: 'missing' }] })).toThrow()
    const backup = repositoryToBackupV9(identifyLegacyInvoice(document, 'old', identification), date)
    backup.cards.statements[0].identification!.cards[0].others[0].amountCents++
    expect(inspectBackupPayload(backup).issues.some((issue) => issue.code === 'legacy_identification_invalid')).toBe(true)
    expect((document.collections.cardPaidInvoices as PaidInvoiceSnapshot[])[0].identification).toBeUndefined()
  })

  it('soma um pagamento separado ao original identificado sem duplicar diferenças de calendário', () => {
    const document = identifyLegacyInvoice(fixture(), 'old', identification)
    const paid = document.collections.cardPaidInvoices as PaidInvoiceSnapshot[]
    paid[0].calendarAdjustments = [{ id: 'adjustment', accountId: 'itau', correctedAt: date, reason: 'Calendário', totalDelta: 50, personalDelta: 50, referenceTotal: 50, referencePersonalTotal: 50 }]
    paid.push({ id: 'extra', accountId: 'itau', dueMonth: '2026-09', total: 50, personalTotal: 50, paidAt: date, spending: [] })
    expect(buildCardDataInvoices(document.collections.cardAccounts as CreditCardAccount[], [], paid, '2026-10', 'Mãe')[0])
      .toMatchObject({ total: 350, personalTotal: 150, nonPersonalTotal: 200, personTotal: 200 })
  })

  it('conserva o valor pago ao filtrar pagas e marca como provisório se houver parcela aberta adicional', () => {
    const document = identifyLegacyInvoice(fixture(), 'old', identification)
    const paid = document.collections.cardPaidInvoices as PaidInvoiceSnapshot[]
    const accounts = document.collections.cardAccounts as CreditCardAccount[]
    const entries: CreditCardEntry[] = [{ id: 'extra', accountId: 'itau', dueMonth: '2026-09', cycle: 'current', cardName: 'Itaú', description: 'Diferença aberta', purchaseDate: '20/08', amount: 50, personalAmount: 50, remainingAmount: 0 }]
    expect(buildCardDataInvoices(accounts, entries, paid, '2026-10', 'Mãe', false)[0]).toMatchObject({ paid: true, total: 300, personTotal: 200 })
    expect(buildCardDataInvoices(accounts, entries, paid, '2026-10', 'Mãe', true)[0]).toMatchObject({ paid: false, total: 350, personTotal: 200 })
  })

  it('usa somente a parte não pessoal de compras mistas, ignora antecipações/créditos e conserva lacunas sem composição', () => {
    const accounts = [{ id: 'itau', name: 'Itaú', currentDueMonth: '2026-11' }] as CreditCardAccount[]
    const base: CreditCardEntry = { id: 'mixed', accountId: 'itau', dueMonth: '2026-11', cycle: 'current', cardName: 'Itaú', description: 'Compra', purchaseDate: '20/10', amount: 300, personalAmount: 100, remainingAmount: 0, ownerNote: ' Mãe ' }
    const entries = [base, { ...base, id: 'prepaid', amount: 500, personalAmount: 0, isPrepaid: true },
      { ...base, id: 'credit', amount: 20, personalAmount: 20, entryType: 'invoiceCredit' as const }]
    expect(cardDataPeople(entries, [])).toEqual(['Mãe'])
    expect(buildCardDataInvoices(accounts, entries, [], '2026-10', 'MÃE')[0]).toMatchObject({ total: 280, personalTotal: 80, nonPersonalTotal: 200, personTotal: 200, paid: false })
    expect(buildCardDataInvoices(accounts, [base], [], '2026-10', 'Pai')[0].personTotal).toBe(0)
    const paid: PaidInvoiceSnapshot = { id: 'paid', accountId: 'itau', dueMonth: '2026-11', total: 300, personalTotal: 100, paidAt: date, spending: [] }
    expect(buildCardDataInvoices(accounts, [], [paid], '2026-10', 'Mãe')[0].personTotal).toBeNull()
    expect(buildCardDataInvoices(accounts, [{ ...base, ownerNote: '' }], [], '2026-10', 'Mãe')[0].personTotal).toBeNull()
  })
})
