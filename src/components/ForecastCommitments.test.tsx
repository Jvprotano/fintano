// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { normalizeExpectedEvent } from '../lib/forecast'
import { ForecastEventOccurrences } from './ForecastCommitments'

const addEntry = vi.fn()
const cardEvent = normalizeExpectedEvent({ id: 'hotel', name: 'Hotel', kind: 'expense',
  amount: 2000, month: '2026-09', date: '2026-09-29', recurrence: 'once',
  cashTreatment: 'card', cardDueMonth: '2026-10' })
const store = {
  forecast: { events: [cardEvent], funds: [], currentMonth: '2026-09',
    addFund: vi.fn(), updateFund: vi.fn(), removeFund: vi.fn(), updateOccurrence: vi.fn() },
  actuals: { months: [] },
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
})
