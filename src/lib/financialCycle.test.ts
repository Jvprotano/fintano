import { describe, expect, it } from 'vitest'
import { calculateAllocationPreview, calculateFinancialCycle } from './financialCycle'

describe('calculateFinancialCycle', () => {
  it.each([
    { contribution: 1000, withdrawal: 1000, planned: 1000, available: 4000, used: 0 },
    { contribution: 500, withdrawal: 0, planned: 1000, available: 4000, used: 0 },
    { contribution: 2000, withdrawal: 750, planned: 1000, available: 3750, used: 0 },
    { contribution: 0, withdrawal: 500, planned: 1000, available: 4500, used: 500 },
    { contribution: 2000, withdrawal: 2000, planned: 0, available: 5000, used: 0 },
  ])('compensa aporte $contribution e resgate $withdrawal antes de reservar o aporte líquido', ({ contribution, withdrawal, planned, available, used }) => {
    const cycle = calculateFinancialCycle({ cashMonth: '2026-10', income: 5000 + withdrawal,
      invoiceToPay: 0, costsOnAccount: 0, wantsOnAccount: 0, directInvestment: contribution,
      investmentWithdrawals: withdrawal, directInvestmentCommitted: planned,
      extraExpense: 0, nextInvoicePersonal: 0, plannedNextInvoice: 0 })
    expect(cycle.discretionaryAvailable).toBe(available)
    expect(cycle.withdrawalsForCycle).toBe(used)
    expect(cycle.cashAfterDue).toBe(5000 + withdrawal - contribution)
  })

  it('paga a fatura deste ciclo e só informa a prévia da próxima', () => {
    const cycle = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 10_000,
      invoiceToPay: 2_000,
      costsOnAccount: 3_000,
      wantsOnAccount: 0,
      directInvestment: 2_000,
      extraExpense: 0,
      nextInvoicePersonal: 1_500,
      plannedNextInvoice: 1_500,
    })

    expect(cycle.spendingMonth).toBe('2026-07')
    expect(cycle.nextSpendingMonth).toBe('2026-08')
    expect(cycle.commitmentsDueNow).toBe(7_000)
    expect(cycle.commitmentsBeforeWants).toBe(7_000)
    expect(cycle.cashAfterDue).toBe(3_000)
    // Prévia do próximo ciclo — não reduz o liberado deste salário.
    expect(cycle.reservedForNextInvoice).toBe(1_500)
    expect(cycle.safeToSpend).toBe(3_000)
    expect(cycle.discretionaryPool).toBe(3_000)
    expect(cycle.discretionaryShortfall).toBe(0)
  })

  it('mostra falta só quando as obrigações deste ciclo consomem o caixa', () => {
    const cycle = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 8_000,
      invoiceToPay: 3_000,
      costsOnAccount: 3_000,
      wantsOnAccount: 0,
      directInvestment: 1_500,
      extraExpense: 0,
      nextInvoicePersonal: 1_000,
      plannedNextInvoice: 1_000,
    })

    // 8000 − 3000 − 3000 − 1500 = 500 — a prévia de R$ 1000 não cria shortfall.
    expect(cycle.availableAfterReservations).toBe(500)
    expect(cycle.safeToSpend).toBe(500)
    expect(cycle.shortfall).toBe(0)
    expect(cycle.discretionaryAvailable).toBe(500)
    expect(cycle.discretionaryPool).toBe(500)
    expect(cycle.discretionaryShortfall).toBe(0)
    expect(cycle.reservedForNextInvoice).toBe(1_000)
  })

  it('não exige reservar a próxima fatura para o ciclo fechar', () => {
    const cycle = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 8_800,
      invoiceToPay: 2_800,
      costsOnAccount: 4_170,
      wantsOnAccount: 700,
      directInvestment: 1_494,
      extraExpense: 0,
      nextInvoicePersonal: 153,
      plannedNextInvoice: 2_800,
    })

    // Prévia grande do próximo ciclo — informativa.
    expect(cycle.reservedForNextInvoice).toBe(2_800)
    // Este ciclo: 8800 − 2800 − 4170 − 700 − 1494 = −364
    expect(cycle.shortfall).toBe(364)
    expect(cycle.commitmentsBeforeWants).toBe(8_464)
    // Pool ignora os R$ 700 de desejos em conta: 8800 − 2800 − 4170 − 1494 = 336
    expect(cycle.discretionaryAvailable).toBe(336)
    expect(cycle.discretionaryShortfall).toBe(0)
    expect(cycle.discretionaryAvailable).toBe(cycle.availableAfterReservations + 700)
  })

  it('libera o envelope de desejos em conta no pool discricionário', () => {
    // Plano: cartão 2500, fatura veio 2000 → 500 a mais no pool (fatura menor).
    const cycle = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 8_800,
      invoiceToPay: 2_000,
      costsOnAccount: 4_170,
      wantsOnAccount: 700,
      directInvestment: 1_000,
      extraExpense: 0,
      nextInvoicePersonal: 500,
      plannedNextInvoice: 2_500,
    })

    // Prévia do próximo ciclo não drena este.
    expect(cycle.reservedForNextInvoice).toBe(2_500)
    // 8800 − 2000 − 4170 − 1000 = 1630
    expect(cycle.discretionaryAvailable).toBe(1_630)

    const withHigherInvoice = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 8_800,
      invoiceToPay: 2_500,
      costsOnAccount: 4_170,
      wantsOnAccount: 700,
      directInvestment: 1_000,
      extraExpense: 0,
      nextInvoicePersonal: 500,
      plannedNextInvoice: 2_500,
    })
    expect(cycle.discretionaryAvailable - withHigherInvoice.discretionaryAvailable).toBe(500)
  })

  it('marca shortfall discricionário só com obrigações deste ciclo', () => {
    const cycle = calculateFinancialCycle({
      cashMonth: '2026-08',
      income: 7_000,
      invoiceToPay: 3_000,
      costsOnAccount: 3_000,
      wantsOnAccount: 500,
      directInvestment: 1_500,
      extraExpense: 0,
      nextInvoicePersonal: 2_000,
      plannedNextInvoice: 2_500,
    })

    // 7000 − 3000 − 3000 − 1500 = −500
    expect(cycle.discretionaryAvailable).toBe(-500)
    expect(cycle.discretionaryShortfall).toBe(500)
    expect(cycle.reservedForNextInvoice).toBe(2_500)
  })
})



describe('calculateAllocationPreview', () => {
  it('usa a fatura formada pelo ciclo atual para calcular o próximo mês', () => {
    const preview = calculateAllocationPreview({
      month: '2026-09',
      paycheck: 8_800,
      invoice: 2_511.64,
      costsOnAccount: 3_000,
      baseInvestment: 1_500,
      plannedWants: 1_000,
    })

    expect(preview.month).toBe('2026-09')
    expect(preview.invoice).toBeCloseTo(2_511.64)
    expect(preview.availableToAllocate).toBeCloseTo(1_788.36)
    expect(preview.plannedWants).toBe(1_000)
    expect(preview.afterPlannedWants).toBeCloseTo(788.36)
    expect(preview.pool).toBeCloseTo(1_788.36)
    expect(preview.shortfall).toBe(0)
  })

  it('inclui eventos do próximo mês e deixa desejos fora até a alocação', () => {
    const preview = calculateAllocationPreview({
      month: '2026-09',
      paycheck: 8_800,
      invoice: 2_511.64,
      costsOnAccount: 3_000,
      baseInvestment: 1_500,
      plannedWants: 1_000,
      extraIncome: 300,
      extraExpense: 100,
    })

    // 8800 + 300 - 2511.64 - 3000 - 1500 - 100
    expect(preview.totalIncome).toBe(9_100)
    expect(preview.committedBeforeAllocation).toBeCloseTo(7_111.64)
    expect(preview.availableToAllocate).toBeCloseTo(1_988.36)
    expect(preview.afterPlannedWants).toBeCloseTo(988.36)
  })

  it('mostra shortfall quando as obrigações do próximo mês excedem as entradas', () => {
    const preview = calculateAllocationPreview({
      month: '2026-09',
      paycheck: 7_000,
      invoice: 3_000,
      costsOnAccount: 3_000,
      baseInvestment: 1_500,
      plannedWants: 1_000,
    })

    expect(preview.availableToAllocate).toBe(-500)
    expect(preview.afterPlannedWants).toBe(-1_500)
    expect(preview.pool).toBe(0)
    expect(preview.shortfall).toBe(500)
  })

  it('mostra a margem contra o plano de desejos fora do cartão', () => {
    const abovePlan = calculateAllocationPreview({
      month: '2026-09',
      paycheck: 5_010,
      invoice: 2_000,
      costsOnAccount: 1_000,
      baseInvestment: 1_000,
      plannedWants: 1_000,
    })
    expect(abovePlan.availableToAllocate).toBe(1_010)
    expect(abovePlan.afterPlannedWants).toBe(10)

    const belowPlan = calculateAllocationPreview({
      month: '2026-09',
      paycheck: 4_900,
      invoice: 2_000,
      costsOnAccount: 1_000,
      baseInvestment: 1_000,
      plannedWants: 1_000,
    })
    expect(belowPlan.availableToAllocate).toBe(900)
    expect(belowPlan.afterPlannedWants).toBe(-100)
  })
})
