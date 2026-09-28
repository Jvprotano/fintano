import { describe, expect, it } from 'vitest'
import { buildCurrentCycleFacts } from './currentCycleFacts'

describe('buildCurrentCycleFacts', () => {
  it('deduz do caixa o pagamento avulso já feito além da fatura líquida', () => {
    const facts = buildCurrentCycleFacts({
      month: '2026-09', paycheck: 1_000, extraIncome: 0, extraExpense: 0,
      invoiceToPay: 70, cardAdvancePaid: 30,
      costsOnAccountActual: 0, costsPlanned: 0, wantsOnAccountActual: 0, wantsPlanned: 0,
      costsOnCardPlanned: 0, wantsOnCardPlanned: 0,
      directInvestmentActual: 0, directInvestmentPlanned: 0,
      payrollInvestment: 0, employerInvestment: 0, totalInvestmentPlanned: 0,
    })
    expect(facts.cash.invoiceToPay).toBe(70)
    expect(facts.cash.cardAdvancePaid).toBe(30)
    expect(facts.cash.leftover).toBe(900)
  })

  it('reconcilia o caixa com realizado sem descontar novamente a previdência em folha', () => {
    const facts = buildCurrentCycleFacts({
      month: '2026-09',
      paycheck: 8_800,
      extraIncome: 224,
      extraExpense: 0,
      invoiceToPay: 3_178.68,
      costsOnAccountActual: 4_021.51,
      costsPlanned: 4_170,
      wantsOnAccountActual: 670,
      wantsPlanned: 730,
      costsOnCardPlanned: 0,
      wantsOnCardPlanned: 2_800,
      directInvestmentActual: 1_150,
      directInvestmentPlanned: 1_047.8,
      payrollInvestment: 540,
      employerInvestment: 540,
      totalInvestmentPlanned: 1_587.8,
    })

    expect(facts.cash.leftover).toBeCloseTo(3.81)
    expect(facts.cash.directInvestment).toBe(1_150)
    expect(facts.actual.personalInvestment).toBe(1_690)
    expect(facts.actual.creditedInvestment).toBe(2_230)
    expect(facts.plan.wantsOnAccount).toBe(730)
    expect(facts.actual.wantsOnAccount).toBe(670)
  })
})
