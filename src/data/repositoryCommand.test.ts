import { describe, expect, it } from 'vitest'
import { payInvoiceInDocument } from '../hooks/useCreditCards'
import { closeCycleInDocument } from './closingCommand'
import type { MonthlySnapshot } from '../types'
import { readRepositoryDocument, REPOSITORY_STORAGE_KEY, writeRepositoryDocument } from './repository'
import { repositoryRevision, runRepositoryCommand } from './repositoryCommand'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  failWrite = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) {
    if (this.failWrite && key === REPOSITORY_STORAGE_KEY) throw new Error('write refused')
    this.values.set(key, value)
  }
}

function cardStorage() {
  const storage = new MemoryStorage()
  writeRepositoryDocument({
    schemaVersion: 7,
    updatedAt: '2026-09-30T12:00:00.000Z',
    collections: {
      cardAccounts: [{ id: 'itau', name: 'Itaú', currentDueMonth: '2026-10', closingDay: 25, dueDay: 5 }],
      cardSettings: { paymentDate: '05/10', currentDueMonth: '2026-10', personalSpendingLimit: 1500 },
      cardEntries: [{
        id: 'charge-1', accountId: 'itau', dueMonth: '2026-10', cycle: 'current', description: 'Mercado', purchaseDate: '10/09',
        cardName: 'Itaú', amount: 300, personalAmount: 300, remainingAmount: 0,
      }],
      cardPaidInvoices: [],
    },
  }, storage)
  return storage
}

function closeInput(): Parameters<typeof closeCycleInDocument>[1] {
  const snapshot: Omit<MonthlySnapshot, 'id' | 'closedAt'> = {
    month: '2026-09', scenarioId: 'scenario-1', scenarioName: 'Atual',
    availableForBudget: 5000, paycheckInAccount: 5000,
    extraIncome: 0, extraIncomeEntries: [], extraExpense: 0, extraExpenseEntries: [],
    costs: 350, costsPlanned: 300, wants: 50, wantsPlanned: 50, wantAllocations: [],
    payrollInvested: 0, employerInvested: 0, employerInvestmentKnown: true,
    directInvestedAtClose: 0, openingBalance: 0, investmentProjectionVersion: 1,
    invested: 0, investmentPlanCaptured: true, investedPlanned: 0,
    balance: 4600, savingsRate: 0, costsByCategory: {},
    grossAssets: 0, physicalAssets: 0, liabilities: 0, securedLiabilities: 0,
    netWorth: 0, emergencyFund: 0, cardPersonalTotal: 300, cardPlanned: 300,
    cardByArea: {}, cashLeftover: 4600,
  }
  return {
    month: '2026-09', snapshot, invoiceKnown: true,
    costRows: [{ id: 'cost-1', planned: 200 }, { id: 'cost-2', planned: 100 }],
    wantRows: [{ id: 'want-1', planned: 50 }],
    payInvoiceDueMonth: '2026-10',
  }
}

describe('comando financeiro indivisível', () => {
  it('não muda nenhuma coleção se uma gravação de pagamento falhar', () => {
    const storage = cardStorage()
    const before = repositoryRevision(storage)
    storage.failWrite = true
    const result = runRepositoryCommand({
      id: 'pay-invoice:2026-10', expectedRevision: before,
      apply: (document) => payInvoiceInDocument(document, '2026-10'),
    }, storage)
    expect(result).toMatchObject({ ok: false, reason: 'write_failed' })
    expect(repositoryRevision(storage)).toBe(before)
    expect(readRepositoryDocument(storage).collections.cardPaidInvoices).toEqual([])
  })

  it('paga uma vez e rejeita confirmação baseada em revisão antiga', () => {
    const storage = cardStorage()
    const before = repositoryRevision(storage)
    const command = {
      id: 'pay-invoice:2026-10', expectedRevision: before,
      apply: (document: ReturnType<typeof readRepositoryDocument>) => payInvoiceInDocument(document, '2026-10'),
    }
    expect(runRepositoryCommand(command, storage)).toEqual({ ok: true, alreadyApplied: false })
    const after = repositoryRevision(storage)
    expect(after).not.toBe(before)
    const document = readRepositoryDocument(storage)
    expect((document.collections.cardPaidInvoices as unknown[])).toHaveLength(1)
    expect((document.collections.cardAccounts as { currentDueMonth: string }[])[0].currentDueMonth).toBe('2026-11')
    expect(runRepositoryCommand(command, storage)).toEqual({ ok: true, alreadyApplied: true })
    expect(repositoryRevision(storage)).toBe(after)

    const stale = runRepositoryCommand({
      id: 'another-operation', expectedRevision: before,
      apply: (current) => ({ ...current, collections: { ...current.collections, actuals: [] } }),
    }, storage)
    expect(stale).toMatchObject({ ok: false, reason: 'conflict' })
    expect(repositoryRevision(storage)).toBe(after)
  })

  it('fecha realizados confirmados e paga a fatura numa escrita, sem avanço parcial', () => {
    const storage = cardStorage()
    const seeded = readRepositoryDocument(storage)
    writeRepositoryDocument({
      ...seeded,
      collections: {
        ...seeded.collections,
        activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
        activeScenarioId: 'scenario-1',
        actuals: [{ month: '2026-09', paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 }, costs: { 'cost-1': 250, 'cost-2': 100 }, wants: { 'want-1': 50 }, extraIncome: [], extraExpenses: [] }],
        history: [],
      },
    }, storage)
    const before = repositoryRevision(storage)
    const command = {
      id: 'close-cycle:2026-09', expectedRevision: before,
      apply: (document: ReturnType<typeof readRepositoryDocument>) => closeCycleInDocument(document, closeInput()),
    }

    storage.failWrite = true
    expect(runRepositoryCommand(command, storage)).toMatchObject({ ok: false, reason: 'write_failed' })
    expect(repositoryRevision(storage)).toBe(before)
    storage.failWrite = false
    expect(runRepositoryCommand(command, storage)).toEqual({ ok: true, alreadyApplied: false })
    const saved = readRepositoryDocument(storage)
    expect((saved.collections.activeCycle as { month: string }).month).toBe('2026-10')
    expect((saved.collections.actuals as Array<{ costs: Record<string, number>; wants: Record<string, number> }>)[0]).toMatchObject({
      costs: { 'cost-1': 250, 'cost-2': 100 }, wants: { 'want-1': 50 },
    })
    expect(saved.collections.history).toHaveLength(1)
    expect(saved.collections.cardPaidInvoices).toHaveLength(1)
    expect((saved.collections.cardAccounts as { currentDueMonth: string }[])[0].currentDueMonth).toBe('2026-11')
    const after = repositoryRevision(storage)
    expect(runRepositoryCommand(command, storage)).toEqual({ ok: true, alreadyApplied: true })
    expect(repositoryRevision(storage)).toBe(after)
  })

  it('fecha pelo plano do ciclo mesmo com outra simulação selecionada', () => {
    const storage = cardStorage()
    const seeded = readRepositoryDocument(storage)
    writeRepositoryDocument({ ...seeded, collections: { ...seeded.collections,
      activeCycle: { month: '2026-09', salaryHintDay: 30, cardDueHintDay: 5 },
      activeScenarioId: 'simulation-2',
      actuals: [{ month: '2026-09', paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 }, costs: { 'cost-1': 250, 'cost-2': 100 }, wants: { 'want-1': 50 }, extraIncome: [], extraExpenses: [] }],
      monthlyPlans: [{ month: '2026-09', sourceTemplateId: 'scenario-1' }],
    } }, storage)
    const closed = closeCycleInDocument(readRepositoryDocument(storage), closeInput())
    expect(closed?.collections.history).toEqual([expect.objectContaining({ month: '2026-09', scenarioId: 'scenario-1' })])
  })
})
