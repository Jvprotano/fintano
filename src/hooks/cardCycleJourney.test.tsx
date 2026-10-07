// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { useFinancas } from './useFinancas'
import { createDefaultScenario } from '../lib/scenario'
import { cardEntriesForCycle, pendingCardInvoices } from '../lib/cardCycleView'
import { calculateCreditCardSummary } from '../lib/creditCards'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { repositoryRevision } from '../data/repositoryCommand'
import { repositoryToBackupV9, backupV9ToRepository, inspectBackupPayload } from '../data/backupV7'
import { applyCardImport, reviewCardImport } from '../data/cardImportCommand'
import { parseSpreadsheetReport } from '../lib/cardImport'
import type { CreditCardAccount, CreditCardEntry, MonthlySnapshot } from '../types'
import { FinancasProvider } from '../context/FinancasContext'
import { CreditCardManager } from '../components/CreditCardManager'
import { ClosingView } from '../components/ClosingView'

beforeEach(() => localStorage.clear())

function seed() {
  const scenario = createDefaultScenario('Atual')
  scenario.salaryNet = 5000; scenario.deductions = []; scenario.costs = []; scenario.wants = []; scenario.plannedInvestmentAmount = 0
  const accounts: CreditCardAccount[] = ['x', 'y'].map((id) => ({ id, name: id.toUpperCase(), currentDueMonth: '2026-11', closingDay: 0, dueDay: 0, limit: 0, confirmedEmptyDueMonths: ['2026-10'] }))
  const purchase: CreditCardEntry = { id: 'parcelada', accountId: 'x', cardName: 'X', dueMonth: '2026-11', cycle: 'current', description: 'Compra parcelada', purchaseDate: '06/10', amount: 100, personalAmount: 100, remainingAmount: 200, installmentCurrent: 1, installmentTotal: 3, budgetArea: 'desejos' }
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-07T12:00:00Z', collections: {
    scenarios: [scenario], activeScenarioId: scenario.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    cardSettings: { currentDueMonth: '2026-11', paymentDate: '05/11', personalSpendingLimit: 1500 },
    cardAccounts: accounts, cardEntries: [purchase, { ...purchase, id: 'y-compra', accountId: 'y', cardName: 'Y', description: 'Compra Y', amount: 200, personalAmount: 200, remainingAmount: 0, installmentCurrent: undefined, installmentTotal: undefined }],
    actuals: [{ month: '2026-10', costs: {}, wants: {}, extraIncome: [], extraExpenses: [], paycheck: { amount: 5000, payrollInvestment: 0, employerInvestment: 0 } }],
  } })
}

it('mantém parcela paga no ciclo, impede reimportação e paga só o outro cartão ao virar, preservando backup', () => {
  seed()
  const app = renderHook(() => useFinancas())
  const rows = () => cardEntriesForCycle(app.result.current.cards.entries, app.result.current.cards.paidInvoices, app.result.current.cards.accounts, app.result.current.activeCycle.month)
  expect(calculateCreditCardSummary(rows(), app.result.current.cards.settings).currentTotal).toBe(300)
  act(() => expect(app.result.current.cards.payInvoice('x', repositoryRevision()).ok).toBe(true))
  expect(rows().find((entry) => entry.id === 'parcelada')).toMatchObject({ cycle: 'current', installmentCurrent: 1, paidAt: expect.any(String) })
  expect(rows().find((entry) => entry.accountId === 'x' && entry.cycle === 'next')).toMatchObject({ installmentCurrent: 2, dueMonth: '2026-12' })
  expect(calculateCreditCardSummary(rows(), app.result.current.cards.settings).currentTotal).toBe(300)
  expect(calculateCreditCardSummary(rows().filter((entry) => !entry.paidAt), app.result.current.cards.settings).currentTotal).toBe(200)
  act(() => expect(app.result.current.cards.addEntry({ accountId: 'x', cardName: 'X', dueMonth: '2026-11', cycle: 'current', description: 'Tardia', purchaseDate: '07/10', amount: 50, personalAmount: 50, remainingAmount: 0 })).toBe(false))
  const review = reviewCardImport(parseSpreadsheetReport('Descrição\tData\tCartão\tFatura\tÉ meu\nTardia\t07/10\tX\t50,00\t50,00'), app.result.current.cards.entries, app.result.current.cards.accounts[0], '2026-11', true)
  expect(applyCardImport(review, repositoryRevision()).ok).toBe(false)
  act(() => expect(app.result.current.cards.addEntry({ accountId: 'x', cardName: 'X', dueMonth: '2026-12', cycle: 'next', description: 'Nova compra', purchaseDate: '07/10', amount: 50, personalAmount: 50, remainingAmount: 0 })).toBe(true))
  expect(rows().filter((entry) => entry.description === 'Nova compra')).toMatchObject([{ cycle: 'next', dueMonth: '2026-12' }])
  expect(pendingCardInvoices(app.result.current.cards.entries, app.result.current.cards.paidInvoices, app.result.current.cards.accounts, '2026-11')).toMatchObject([{ accountId: 'y', total: 200, known: true }])
  const stale = repositoryRevision()
  act(() => app.result.current.cards.setSettings({ ...app.result.current.cards.settings, personalSpendingLimit: 2000 }))
  act(() => expect(app.result.current.closeCurrentMonth('2026-10', '', { payInvoice: true, expectedRevision: stale }).ok).toBe(false))
  expect(app.result.current.activeCycle.month).toBe('2026-10')
  act(() => expect(app.result.current.closeCurrentMonth('2026-10', '', { payInvoice: true, expectedRevision: repositoryRevision() }).ok).toBe(true))
  expect(app.result.current.cards.paidInvoices).toHaveLength(2)
  expect(app.result.current.activeCycle.month).toBe('2026-11')
  expect(rows().filter((entry) => entry.cycle === 'current' && entry.accountId === 'x')).toHaveLength(2)
  expect(rows().find((entry) => entry.description === 'Compra parcelada' && entry.cycle === 'current')).toMatchObject({ installmentCurrent: 2, paidAt: undefined })
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cardPersonalTotal).toBe(300)
  const backup = repositoryToBackupV9(readRepositoryDocument())
  expect(inspectBackupPayload(backup).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  const restored = backupV9ToRepository(backup)
  expect(restored.collections.cardPaidInvoices).toHaveLength(2)
  expect((restored.collections.cardAccounts as CreditCardAccount[])[0]).toMatchObject({ closingDay: 0, dueDay: 0 })
  app.unmount()
  writeRepositoryDocument(restored)
  const reopened = renderHook(() => useFinancas())
  expect(reopened.result.current.activeCycle.month).toBe('2026-11')
  expect(cardEntriesForCycle(reopened.result.current.cards.entries, reopened.result.current.cards.paidInvoices, reopened.result.current.cards.accounts, '2026-11').find((entry) => entry.installmentTotal)).toMatchObject({ installmentCurrent: 2, cycle: 'current' })
  reopened.unmount()
})

it('paga dois cartões juntos, carrega crédito excedente uma vez e não fecha com fatura anterior desconhecida', () => {
  seed()
  const app = renderHook(() => useFinancas())
  act(() => expect(app.result.current.cards.addEntry({ accountId: 'x', cardName: 'X', dueMonth: '2026-11', cycle: 'current', description: 'Crédito', purchaseDate: '07/10', amount: 120, personalAmount: 120, remainingAmount: 0, entryType: 'invoiceCredit', creditSource: 'reward' })).toBe(true))
  act(() => expect(app.result.current.closeCurrentMonth('2026-10', '', { payInvoice: true }).ok).toBe(true))
  expect(app.result.current.cards.paidInvoices.map((invoice) => invoice.total)).toEqual([0, 200])
  expect(app.result.current.cards.entries.filter((entry) => entry.originCreditId)).toHaveLength(1)
  expect(app.result.current.cards.entries.find((entry) => entry.originCreditId)).toMatchObject({ dueMonth: '2026-12', amount: 20 })
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cardPersonalTotal).toBe(200)
  app.unmount()
  localStorage.clear(); seed()
  const doc = readRepositoryDocument()
  ;(doc.collections.cardAccounts as CreditCardAccount[])[1].currentDueMonth = '2026-10'
  ;(doc.collections.cardAccounts as CreditCardAccount[])[1].confirmedEmptyDueMonths = []
  writeRepositoryDocument(doc)
  const blocked = renderHook(() => useFinancas())
  act(() => expect(blocked.result.current.closeCurrentMonth('2026-10', '', { payInvoice: true }).ok).toBe(false))
  expect(blocked.result.current.activeCycle.month).toBe('2026-10')
  expect(readRepositoryDocument().collections.history ?? []).toHaveLength(0)
  expect(blocked.result.current.cards.paidInvoices).toHaveLength(0)
  blocked.unmount()
})

it('confere o crédito que passa de uma fatura anterior para a do ciclo no pagamento conjunto', () => {
  seed()
  const doc = readRepositoryDocument()
  ;(doc.collections.cardAccounts as CreditCardAccount[])[0].currentDueMonth = '2026-10'
  const rows = doc.collections.cardEntries as CreditCardEntry[]
  rows[0].cycle = 'next'
  rows.push({ ...rows[0], id: 'anterior', cycle: 'current', dueMonth: '2026-10', installmentCurrent: undefined, installmentTotal: undefined, remainingAmount: 0 },
    { ...rows[0], id: 'credito-anterior', cycle: 'current', dueMonth: '2026-10', entryType: 'invoiceCredit', creditSource: 'reward', amount: 120, personalAmount: 120, remainingAmount: 0, installmentCurrent: undefined, installmentTotal: undefined })
  writeRepositoryDocument(doc)
  const app = renderHook(() => useFinancas())
  expect(pendingCardInvoices(app.result.current.cards.entries, app.result.current.cards.paidInvoices, app.result.current.cards.accounts, '2026-11').map((invoice) => invoice.total)).toEqual([0, 80, 200])
  act(() => expect(app.result.current.closeCurrentMonth('2026-10', '', { payInvoice: true }).ok).toBe(true))
  expect(app.result.current.cards.paidInvoices.map((invoice) => invoice.total)).toEqual([0, 80, 200])
  expect((readRepositoryDocument().collections.history as MonthlySnapshot[])[0].cardPersonalTotal).toBe(280)
  expect(app.result.current.cards.entries.filter((entry) => entry.originCreditId)).toHaveLength(0)
  app.unmount()
})

it('confere os controles de pagamento, nova compra e fechamento sem alterar a consulta deste ciclo', () => {
  seed()
  const { container } = render(<FinancasProvider><CreditCardManager /><ClosingView onGoToCards={() => {}} onGoToPlanning={() => {}} /></FinancasProvider>)
  const card = screen.getByRole('heading', { name: 'X', exact: true }).closest('section')!
  fireEvent.click(within(card).getByRole('button', { name: 'Confirmar pagamento', exact: true }))
  fireEvent.click(within(card).getAllByRole('button', { name: 'Confirmar pagamento', exact: true }).at(-1)!)
  expect(container.querySelector('input[value="Compra parcelada"]')).toBeNull()
  expect(container.textContent).toContain('Paga na fatura')
  expect(container.textContent).toContain('1/3')
  expect(container.textContent).toContain('Fatura deste ciclo paga: esta compra será lançada no próximo ciclo.')
  const form = container.querySelector('form')!
  fireEvent.change(within(form).getByRole('textbox', { name: 'Descrição da nova compra' }), { target: { value: 'Depois do pagamento' } })
  fireEvent.change(form.querySelector('input[placeholder="0,00"]')!, { target: { value: '5000' } })
  fireEvent.submit(form)
  expect((readRepositoryDocument().collections.cardEntries as CreditCardEntry[]).find((entry) => entry.description === 'Depois do pagamento')).toMatchObject({ dueMonth: '2026-12' })
  fireEvent.click(screen.getByRole('button', { name: 'Próximo ciclo', exact: true }))
  expect(container.querySelector('input[value="Depois do pagamento"]')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Este ciclo', exact: true }))
  expect(container.querySelector('input[value="Depois do pagamento"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Revisar e fechar', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: /Confirmar pendentes e virar ciclo/ }))
  expect((readRepositoryDocument().collections.activeCycle as { month: string }).month).toBe('2026-11')
  expect(readRepositoryDocument().collections.cardPaidInvoices).toHaveLength(2)
  expect(container.querySelector('input[value="Compra parcelada"]')).not.toBeNull()
  cleanup()
})
