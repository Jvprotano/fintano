// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { normalizeExpectedEvent } from '../lib/forecast'
import { ForecastEventOccurrences } from './ForecastCommitments'

const addEntry = vi.fn()
const addExtraIncome = vi.fn()
const updateOccurrence = vi.fn()
const cardEvent = normalizeExpectedEvent({ id: 'hotel', name: 'Hotel', kind: 'expense',
  amount: 2000, month: '2026-09', date: '2026-09-29', recurrence: 'once',
  cashTreatment: 'card', cardDueMonth: '2026-10' })
const store = {
  forecast: { events: [cardEvent], currentMonth: '2026-09', updateOccurrence },
  actuals: { months: [], addExtraIncome, addExtraExpense: vi.fn(), removeExtraIncome: vi.fn(), removeExtraExpense: vi.fn() },
  nextCycleAllocation: { availableToAllocate: 5000, extraIncome: 0, extraExpense: 0 },
  investments: { goals: [] },
  cards: { entries: [], paidInvoices: [], settings: { currentDueMonth: '2026-09', paymentDate: '05/09' },
    accounts: [{ id: 'card', name: 'Principal', closingDay: 25, dueDay: 5, limit: 10000 }], addEntry },
}

vi.mock('../context/financasStore', () => ({ useFinancasStore: () => store }))

describe('datas de um evento', () => {
  it('lança uma cobrança na próxima fatura com vínculo à ocorrência', async () => {
    addEntry.mockClear()
    const user = userEvent.setup()
    render(<ForecastEventOccurrences event={cardEvent} />)
    expect(screen.getByText(/fatura out/i)).toBeTruthy()
    await user.click(screen.getByText('Cobrança apareceu no cartão? Registrar'))
    await user.click(screen.getByRole('button', { name: 'Lançar no cartão' }))
    expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({
      cycle: 'next', description: 'Hotel', amount: 2000,
      sourceForecastOccurrenceId: 'hotel@2026-09',
    }))
  })

  it('registra uma entrada efetivada no ciclo com vínculo à previsão', async () => {
    addExtraIncome.mockClear()
    const income = normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income',
      amount: 500, month: '2026-09', recurrence: 'once' })
    const user = userEvent.setup()
    render(<ForecastEventOccurrences event={income} />)
    await user.click(screen.getByRole('button', { name: 'Registrar recebimento' }))
    await user.click(screen.getByRole('button', { name: 'Marcar como recebido' }))
    expect(addExtraIncome).toHaveBeenCalledWith('Bônus', 500, 'bonus', '2026-09',
      'bonus@2026-09', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('marca saída já planejada sem criar outra saída de caixa', async () => {
    updateOccurrence.mockClear()
    const addExtraExpense = store.actuals.addExtraExpense
    addExtraExpense.mockClear()
    const planned = normalizeExpectedEvent({ id: 'ipva', name: 'IPVA', kind: 'expense',
      amount: 800, month: '2026-09', recurrence: 'once', cashTreatment: 'planned' })
    const user = userEvent.setup()
    render(<ForecastEventOccurrences event={planned} />)
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }))
    await user.click(screen.getByRole('button', { name: 'Marcar como pago' }))
    expect(updateOccurrence).toHaveBeenCalledWith('ipva', '2026-09',
      { realizedAmount: 800, realizedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(addExtraExpense).not.toHaveBeenCalled()
  })
})
