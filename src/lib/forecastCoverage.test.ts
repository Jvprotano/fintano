import { describe, expect, it } from 'vitest'
import { calculateFundingOutlook, cardDueMonthForOccurrence, coverageAtDate, reconcileOccurrence, upcomingOccurrences } from './forecastCoverage'
import { normalizeExpectedEvent, occurrencesInMonth } from './forecast'
import type { MonthlyActuals } from '../types'
import { createPaidInvoiceSnapshot } from './cardCycleAccounting'

const hotel = normalizeExpectedEvent({ id: 'hotel', name: 'Hotel', kind: 'expense', amount: 2000,
  month: '2027-01', date: '2027-01-05', recurrence: 'once', groupId: 'trip' })
const bonus = normalizeExpectedEvent({ id: 'bonus', name: 'Bônus', kind: 'income', amount: 3000,
  month: '2027-01', date: '2027-01-25', recurrence: 'once', groupId: 'trip' })
const fund = { id: 'trip', name: 'Viagem', reservedAmount: 500 }

describe('cobertura cronológica de eventos', () => {
  it('não usa entrada posterior para cobrir hotel que vence antes', () => {
    const occurrences = upcomingOccurrences([hotel, bonus], [], '2027-01', 1, '2026-12-29')
    const outlook = calculateFundingOutlook(fund, occurrences, '2026-12-29')
    expect(outlook.firstUncoveredDate).toBe('2027-01-05')
    expect(outlook.requiredMonthlyBase).toBe(1500)
    expect(outlook.requiredMonthlyIfReceived).toBe(1500)
    expect(outlook.expectedIncome).toBe(3000)
    expect(coverageAtDate(fund, occurrences, '2027-01-05')).toEqual({ base: -1500, ifReceived: -1500, hasMonthOnly: false })
    expect(coverageAtDate(fund, occurrences, '2027-01-25').ifReceived).toBe(1500)
  })

  it('entrada confirmada antes do vencimento reduz o depósito, mas não vira fato', () => {
    const earlyBonus = normalizeExpectedEvent({ ...bonus, date: '2027-01-03', confirmed: true })
    const outlook = calculateFundingOutlook(fund,
      upcomingOccurrences([hotel, earlyBonus], [], '2027-01', 1, '2026-12-29'), '2026-12-29')
    expect(outlook.requiredMonthlyBase).toBe(0)
    expect(outlook.confirmedIncome).toBe(3000)
  })

  it('pagamento parcial mantém apenas o restante e aceita mais de um fato por ocorrência', () => {
    const occurrence = occurrencesInMonth([hotel], '2027-01')[0]
    const actuals: MonthlyActuals[] = [{ month: '2027-01', costs: {}, wants: {}, extraIncome: [],
      extraExpenses: [
        { id: 'a', name: 'Hotel', amount: 600, sourceEventId: 'hotel', sourceOccurrenceId: occurrence.id },
        { id: 'b', name: 'Hotel', amount: 400, sourceEventId: 'hotel', sourceOccurrenceId: occurrence.id },
      ] }]
    const partial = reconcileOccurrence(occurrence, actuals, '2026-12-29')
    expect(partial.status).toBe('partial')
    expect(partial.paidAmount).toBe(1000)
    expect(partial.remainingAmount).toBe(1000)
  })

  it('saída já incluída no plano pode ser efetivada sem lançamento de caixa duplicado', () => {
    const planned = normalizeExpectedEvent({ ...hotel, cashTreatment: 'planned',
      occurrenceOverrides: { '2027-01': { realizedAmount: 1200, realizedAt: '2027-01-05' } } })
    const occurrence = occurrencesInMonth([planned], '2027-01')[0]
    const result = reconcileOccurrence(occurrence, [], '2027-01-06')
    expect(result.status).toBe('partial')
    expect(result.remainingAmount).toBe(800)
  })

  it('evento recorrente adiado mantém identidade e legado concilia pelo mês original', () => {
    const recurring = normalizeExpectedEvent({ ...hotel, recurrence: 'monthly',
      occurrenceOverrides: { '2027-01': { date: '2027-02-12', amount: 1800 } } })
    expect(occurrencesInMonth([recurring], '2027-01')).toHaveLength(0)
    const february = occurrencesInMonth([recurring], '2027-02')
    expect(february.map((item) => item.id)).toEqual(['hotel@2027-02', 'hotel@2027-01'])
    expect(february[1].amount).toBe(1800)
    const actuals: MonthlyActuals[] = [{ month: '2027-01', costs: {}, wants: {}, extraIncome: [],
      extraExpenses: [{ id: 'old', name: 'Hotel', amount: 500, sourceEventId: 'hotel' }] }]
    expect(reconcileOccurrence(february[1], actuals, '2027-02-01').paidAmount).toBe(500)
  })

  it('plano e cartão não são subtraídos outra vez do patrimônio, mas a fatura pode exigir reserva', () => {
    const planned = normalizeExpectedEvent({ ...hotel, id: 'planned', cashTreatment: 'planned' })
    const card = normalizeExpectedEvent({ ...hotel, id: 'card', cashTreatment: 'card', cardDueMonth: '2027-02' })
    const occurrences = upcomingOccurrences([planned, card], [], '2027-01', 1, '2026-12-29')
    expect(occurrences.map((item) => item.savedAmount)).toEqual([0, 0])
    expect(calculateFundingOutlook(fund, occurrences, '2026-12-29').pendingExpenses).toBe(2000)
    expect(cardDueMonthForOccurrence(occurrences.find((item) => item.event.id === 'planned')!)).toBeNull()
    expect(cardDueMonthForOccurrence(occurrences.find((item) => item.event.id === 'card')!)).toBe('2027-02')
  })

  it('sem novo mês antes da cobrança mostra falta imediata', () => {
    const outlook = calculateFundingOutlook(fund,
      upcomingOccurrences([hotel], [], '2027-01', 1, '2027-01-03'), '2027-01-03')
    expect(outlook.requiredMonthlyBase).toBe(0)
    expect(outlook.immediateShortfallBase).toBe(1500)
  })

  it('cobrança do cartão só liquida quando a fatura vinculada é paga', () => {
    const cardEvent = normalizeExpectedEvent({ ...hotel, cashTreatment: 'card', cardDueMonth: '2027-02' })
    const cardOccurrence = occurrencesInMonth([cardEvent], '2027-01')[0]
    const charge = {
      id: 'charge', cycle: 'current' as const, description: 'Hotel', purchaseDate: '05/01/2027',
      cardName: 'Principal', amount: 2000, personalAmount: 2000, remainingAmount: 0,
      budgetArea: 'desejos' as const, sourceForecastOccurrenceId: cardOccurrence.id,
    }
    expect(reconcileOccurrence(cardOccurrence, [], '2027-01-06', [charge]).status).toBe('scheduled')
    const invoice = createPaidInvoiceSnapshot({ entries: [charge], currentDueMonth: '2027-02',
      total: 2000, personalTotal: 2000, paidAt: '2027-02-05T12:00:00.000Z' })
    expect(invoice.forecastOccurrences).toEqual([{ id: cardOccurrence.id, amount: 2000 }])
    const settled = reconcileOccurrence(cardOccurrence, [], '2027-02-06', [], [invoice])
    expect(settled.status).toBe('settled')
    expect(settled.remainingAmount).toBe(0)
  })
})
