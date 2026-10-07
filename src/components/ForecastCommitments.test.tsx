// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeExpectedEvent } from '../lib/forecast'
import { buildForecastAgenda } from '../lib/forecastCoverage'
import { ForecastEventOccurrences } from './ForecastCommitments'

const registerCard = vi.fn(() => ({ ok: true }))
const realizeOccurrence = vi.fn(() => ({ ok: true }))
const store = {
  forecast: { currentMonth: '2026-10', registerCard, realizeOccurrence, updateOccurrence: vi.fn() },
  forecastAgenda: buildForecastAgenda([], [], '2026-10', '2026-10-07'),
  movementSources: [], scenarios: { scenarios: [], monthlyPlans: [] },
  actuals: { months: [], removeExtraIncome: vi.fn(), removeExtraExpense: vi.fn() },
  cards: { entries: [], paidInvoices: [], accounts: [{ id: 'card', name: 'Principal' }] },
}
vi.mock('../context/financasStore', () => ({ useFinancasStore: () => store }))
afterEach(cleanup)

describe('ações das ocorrências', () => {
  it('registra cobrança com identidade da ocorrência e cartão escolhido', async () => {
    registerCard.mockClear()
    const event = normalizeExpectedEvent({ id: 'hotel', name: 'Hotel', kind: 'expense', amount: 2000,
      month: '2026-10', cashTreatment: 'card', cardDueMonth: '2026-11' })
    store.forecastAgenda = buildForecastAgenda([event], [], '2026-10', '2026-10-07')
    const user = userEvent.setup()
    render(<ForecastEventOccurrences event={event} />)
    expect(screen.getByText(/fatura nov/i)).toBeTruthy()
    await user.click(screen.getByText('Registrar nova cobrança no cartão'))
    await user.click(screen.getByRole('button', { name: 'Lançar cobrança' }))
    expect(registerCard).toHaveBeenCalledWith('hotel', '2026-10', expect.objectContaining({ accountId: 'card', amount: 2000 }))
  })

  it('efetiva entrada no ciclo ativo com data real e identidade da ocorrência', async () => {
    realizeOccurrence.mockClear()
    const event = normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income', amount: 500,
      month: '2026-11' })
    store.forecastAgenda = buildForecastAgenda([event], [], '2026-10', '2026-10-07')
    const user = userEvent.setup()
    render(<ForecastEventOccurrences event={event} />)
    await user.click(screen.getByRole('button', { name: 'Registrar recebimento' }))
    await user.click(screen.getByRole('button', { name: /^Registrar$/ }))
    expect(realizeOccurrence).toHaveBeenCalledWith('bonus', '2026-11', 500, '2026-10', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('orienta vincular saída já planejada e não oferece outro pagamento de caixa', () => {
    const event = normalizeExpectedEvent({ id: 'ipva', name: 'IPVA', kind: 'expense', amount: 800,
      month: '2026-10', cashTreatment: 'planned' })
    store.forecastAgenda = buildForecastAgenda([event], [], '2026-10', '2026-10-07')
    render(<ForecastEventOccurrences event={event} />)
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).toBeNull()
    expect(screen.getByText(/Vincule o item do plano/)).toBeTruthy()
  })
})
