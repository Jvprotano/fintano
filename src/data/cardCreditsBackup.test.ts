import { describe, expect, it } from 'vitest'
import type { CreditCardEntry, CreditCardSettings } from '../types'
import { calculateCreditCardSummary } from '../lib/creditCards'
import { addMonths } from '../lib/shared'
import { backupV7ToRepository, createEmptyBackupV7, repositoryToBackupV7 } from './backupV7'

describe('abatimentos avulsos no backup v7', () => {
  it('preserva o abatimento ativo e o registro de uma fatura paga', () => {
    const backup = createEmptyBackupV7()
    const dueMonth = backup.cards.currentDueMonth
    const spendingMonth = addMonths(dueMonth, -1)
    backup.cards.accounts = [{ id: 'card-1', name: 'Itaú', closingDay: 28, dueDay: 5, limitCents: 500_000 }]
    backup.cards.charges = [
      { id: 'purchase', accountId: 'card-1', description: 'Compra', purchaseDate: '10/09', spendingMonth, dueMonth, amountCents: 10_000, personalAmountCents: 10_000, remainingAmountCents: 0 },
      { id: 'credit', accountId: 'card-1', description: 'Pontos', purchaseDate: '28/09', spendingMonth, dueMonth, amountCents: 3_000, personalAmountCents: 3_000, remainingAmountCents: 0, entryType: 'invoiceCredit', creditSource: 'reward', cashCycleMonth: spendingMonth },
    ]
    backup.cards.statements = [{
      id: 'statement-old', accountId: null, dueMonth: '2026-08', totalCents: 7_000, personalTotalCents: 7_000,
      paidAt: '2026-08-05T12:00:00.000Z', spending: [],
      credits: [{ id: 'old-credit', accountId: 'card-1', description: 'Pagamento antecipado', date: '02/08', amountCents: 3_000, source: 'payment', cashCycleMonth: spendingMonth }],
    }]

    const repository = backupV7ToRepository(backup)
    const entries = repository.collections.cardEntries as CreditCardEntry[]
    expect(calculateCreditCardSummary(entries, repository.collections.cardSettings as CreditCardSettings).currentTotal).toBe(70)
    const exported = repositoryToBackupV7(repository)
    expect(exported.cards.charges.find((charge) => charge.id === 'credit')).toMatchObject({ entryType: 'invoiceCredit', creditSource: 'reward', amountCents: 3_000, cashCycleMonth: spendingMonth })
    expect(exported.cards.statements[0].credits).toEqual(backup.cards.statements[0].credits)
  })
})
