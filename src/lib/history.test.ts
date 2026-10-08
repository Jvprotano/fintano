import { describe, expect, it } from 'vitest'
import {
  averageMonthlyCosts,
  buildHistoryPoints,
  calculateHistoryStats,
  calculateNetWorthChange,
  calculateNetWorthComposition,
  normalizeSnapshot,
  projectHistoryInvestments,
} from './history'
import type { MonthlySnapshot } from '../types'
import type { InvestmentLedgerSource } from './investmentActuals'

function snapshot(overrides: Partial<MonthlySnapshot> = {}): MonthlySnapshot {
  return normalizeSnapshot({
    id: 's1',
    month: '2026-07',
    closedAt: '2026-07-31T00:00:00.000Z',
    availableForBudget: 9_100,
    costs: 3_900,
    wants: 628,
    invested: 1_820,
    savingsRate: 20,
    grossAssets: 6_900,
    liabilities: 0,
    netWorth: 6_900,
    cardPersonalTotal: 1_499,
    ...overrides,
  })
}

describe('normalizeSnapshot — compatibilidade', () => {
  it('snapshot antigo sem plano de custos usa o realizado como plano', () => {
    const normalized = normalizeSnapshot({ month: '2026-06', costs: 3_000 })
    expect(normalized.costsPlanned).toBe(3_000)
  })

  it('snapshot antigo sem plano de Desejos usa o total antigo como plano', () => {
    const normalized = normalizeSnapshot({ month: '2026-06', wants: 700 })
    expect(normalized.wants).toBe(700)
    expect(normalized.wantsPlanned).toBe(700)
    expect(normalized.wantAllocations).toEqual([])
  })

  it('remove do detalhamento histórico tudo o que pertence ao cartão', () => {
    const normalized = normalizeSnapshot({
      month: '2026-06',
      wantAllocations: [
        {
          id: 'cartao',
          name: 'Cartão',
          planned: 1_000,
          actual: 900,
          paidWith: 'card',
          includedInCardPlan: false,
        },
        {
          id: 'streaming',
          name: 'Streaming',
          planned: 100,
          actual: 80,
          paidWith: 'card',
          includedInCardPlan: true,
        },
        {
          id: 'viagem',
          name: 'Viagem',
          planned: 400,
          actual: 500,
          paidWith: 'account',
          includedInCardPlan: false,
        },
      ],
    })

    expect(normalized.wants).toBe(500)
    expect(normalized.wantsPlanned).toBe(400)
    expect(normalized.wantAllocations.map((allocation) => allocation.id)).toEqual(['viagem'])
  })

  it('snapshot antigo sem metas de cartão e investimento fica neutro', () => {
    const normalized = normalizeSnapshot({
      month: '2026-06',
      invested: 1_200,
      cardPersonalTotal: 2_400,
    })
    expect(normalized.investedPlanned).toBe(1_200)
    expect(normalized.cardPlanned).toBe(2_400)
  })

  it('snapshot antigo sem dívidas trata o patrimônio gravado como ativos', () => {
    const normalized = normalizeSnapshot({ month: '2026-06', netWorth: 5_000 })
    expect(normalized.grossAssets).toBe(5_000)
    expect(normalized.liabilities).toBe(0)
    expect(normalized.netWorth).toBe(5_000)
  })

  it('snapshot anterior aos bens não inventa imóvel nenhum', () => {
    const normalized = normalizeSnapshot({ month: '2026-06', netWorth: 5_000 })
    expect(normalized.physicalAssets).toBe(0)
    expect(normalized.securedLiabilities).toBe(0)
  })

  it('mês inválido cai no mês corrente', () => {
    expect(normalizeSnapshot({ month: '07/2026' }).month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('só guarda áreas do cartão com valor', () => {
    const normalized = normalizeSnapshot({
      month: '2026-07',
      cardByArea: { necessidades: 769, desejos: 0 },
    })
    expect(normalized.cardByArea).toEqual({ necessidades: 769 })
  })

  it('snapshots antigos não inventam entradas extras', () => {
    const normalized = normalizeSnapshot({ month: '2026-07' })
    expect(normalized.extraIncome).toBe(0)
    expect(normalized.extraIncomeEntries).toEqual([])
  })

  it('preserva a composição das entradas extras', () => {
    const normalized = normalizeSnapshot({
      month: '2026-07',
      extraIncomeEntries: [{ id: 'horas', name: 'Banco de horas', amount: 850 }],
    })
    expect(normalized.extraIncome).toBe(850)
    expect(normalized.extraIncomeEntries[0].name).toBe('Banco de horas')
  })

  it('separa a previdência e o aporte direto de snapshots legados', () => {
    const normalized = normalizeSnapshot({
      month: '2026-08',
      availableForBudget: 9_340,
      paycheckInAccount: 8_800,
      invested: 1_540,
    })

    expect(normalized.payrollInvested).toBe(540)
    expect(normalized.directInvestedAtClose).toBe(1_000)
    expect(normalized.investmentProjectionVersion).toBe(0)
    expect(normalized.investmentPlanCaptured).toBe(false)
  })
})

describe('projectHistoryInvestments', () => {
  const source = (cycleMonth: string): InvestmentLedgerSource => ({
    emergencyFund: { current: 1_000, targetMonths: 3, transactions: [] },
    holdings: [
      {
        id: 'reserve',
        name: 'Reserva',
        assetClassId: 'renda-fixa',
        purpose: 'emergency_fund',
        marketValue: 1_000,
        transactions: [
          {
            id: 'investment',
            amount: 1_000,
            date: '2026-08-17T12:00:00.000Z',
            cycleMonth,
          },
        ],
      },
    ],
    goals: [],
  })

  const closedMonth = (month: string) =>
    snapshot({
      id: month,
      month,
      availableForBudget: 9_340,
      paycheckInAccount: 8_800,
      extraIncome: 0,
      extraExpense: 0,
      costs: 4_000,
      wants: 1_000,
      payrollInvested: 540,
      directInvestedAtClose: month === '2026-08' ? 1_000 : 0,
      investmentProjectionVersion: 1,
      invested: month === '2026-08' ? 1_540 : 540,
      investmentPlanCaptured: true,
      balance: 0,
      grossAssets: month === '2026-08' ? 3_030.1 : 4_030.1,
    })

  it('move o realizado entre ciclos sem reescrever o patrimônio fechado', () => {
    const snapshots = [closedMonth('2026-08'), closedMonth('2026-09')]
    const before = projectHistoryInvestments(snapshots, source('2026-08'))
    const after = projectHistoryInvestments(snapshots, source('2026-09'))

    expect(before.map((point) => point.invested)).toEqual([1_540, 540])
    expect(after.map((point) => point.invested)).toEqual([540, 1_540])
    expect(after.map((point) => point.balance)).toEqual([3_800, 2_800])
    expect(after.map((point) => point.grossAssets)).toEqual([3_030.1, 4_030.1])
    expect(after[0].savingsRate).toBeCloseTo((540 / 9_340) * 100)
  })

  it('preserva o snapshot legado quando ainda não existe livro-razão material', () => {
    const legacy = normalizeSnapshot({
      month: '2026-08',
      availableForBudget: 5_000,
      paycheckInAccount: 5_000,
      invested: 1_200,
    })
    const emptySource: InvestmentLedgerSource = {
      emergencyFund: { current: 0, targetMonths: 3, transactions: [] },
      holdings: [],
      goals: [],
    }

    expect(projectHistoryInvestments([legacy], emptySource)[0].invested).toBe(1_200)
  })

  it('mantém neutra a comparação quando o snapshot legado não capturou a meta', () => {
    const legacy = normalizeSnapshot({
      month: '2026-07',
      availableForBudget: 9_340,
      paycheckInAccount: 8_800,
      invested: 1_868,
    })

    const [projected] = projectHistoryInvestments([legacy], source('2026-08'))

    expect(projected.invested).toBe(540)
    expect(projected.investedPlanned).toBe(540)
  })

  it('mantém o livro-razão autoritativo após a migração, inclusive em zero', () => {
    const migrated = normalizeSnapshot({
      month: '2026-08',
      availableForBudget: 5_500,
      paycheckInAccount: 5_000,
      invested: 1_500,
      investmentProjectionVersion: 1,
    })
    const emptySource: InvestmentLedgerSource = {
      emergencyFund: { current: 0, targetMonths: 3, transactions: [] },
      holdings: [],
      goals: [],
    }

    expect(projectHistoryInvestments([migrated], emptySource)[0].invested).toBe(500)
  })
})

describe('buildHistoryPoints', () => {
  it('ordena cronologicamente, independente da ordem gravada', () => {
    const points = buildHistoryPoints([
      snapshot({ id: 'b', month: '2026-08' }),
      snapshot({ id: 'a', month: '2026-06' }),
      snapshot({ id: 'c', month: '2026-07' }),
    ])
    expect(points.map((point) => point.month)).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('o primeiro mês não tem variação', () => {
    const [first] = buildHistoryPoints([snapshot()])
    expect(first.netWorthDelta).toBeNull()
    expect(first.costsDelta).toBeNull()
  })

  it('a variação é contra o mês fechado anterior', () => {
    const points = buildHistoryPoints([
      snapshot({ id: 'a', month: '2026-06', grossAssets: 5_000, netWorth: 5_000, costs: 3_500 }),
      snapshot({ id: 'b', month: '2026-07', grossAssets: 6_900, netWorth: 6_900, costs: 3_900 }),
    ])
    expect(points[1].netWorthDelta).toBe(1_900)
    expect(points[1].costsDelta).toBe(400)
    expect(points[1].wantsDelta).toBe(0)
    expect(points[1].investedDelta).toBe(0)
    expect(points[1].cardDelta).toBe(0)
  })

  it('o financeiro do mês exclui bens e a dívida que os garante', () => {
    const [point] = buildHistoryPoints([
      snapshot({
        grossAssets: 38_400,
        physicalAssets: 480_000,
        liabilities: 267_000,
        securedLiabilities: 262_000,
        netWorth: 251_400,
      }),
    ])
    // Só o cartão de 5 mil pesa no dinheiro; o financiamento não.
    expect(point.financialNetWorth).toBe(33_400)
  })

  it('reconcilia o total pelas fontes mesmo quando o campo redundante está obsoleto', () => {
    const [point] = buildHistoryPoints([
      snapshot({
        grossAssets: 3_030.1,
        physicalAssets: 490_000,
        liabilities: 272_471.66,
        securedLiabilities: 272_471.66,
        netWorth: 1,
      }),
    ])

    expect(point.netWorth).toBeCloseTo(220_558.44)
  })
})

describe('composição e evolução do patrimônio', () => {
  const july = snapshot({
    id: 'july',
    month: '2026-07',
    grossAssets: 2_030.09,
    physicalAssets: 490_000,
    liabilities: 272_471.66,
    securedLiabilities: 272_471.66,
    netWorth: 219_558.43,
    invested: 540,
  })
  const august = snapshot({
    id: 'august',
    month: '2026-08',
    grossAssets: 3_030.1,
    physicalAssets: 490_000,
    liabilities: 272_471.66,
    securedLiabilities: 272_471.66,
    netWorth: 220_558.44,
    invested: 2_170.09,
  })

  it('reproduz a composição dos fechamentos de julho e agosto', () => {
    const julyComposition = calculateNetWorthComposition(july)
    const augustComposition = calculateNetWorthComposition(august)

    expect(julyComposition.financialNetWorth).toBeCloseTo(2_030.09)
    expect(julyComposition.propertyEquity).toBeCloseTo(217_528.34)
    expect(julyComposition.netWorth).toBeCloseTo(219_558.43)
    expect(augustComposition.financialAssets).toBeCloseTo(3_030.1)
    expect(augustComposition.netWorth).toBeCloseTo(220_558.44)
  })

  it('explica os R$ 1.000,01 como mudança do saldo financeiro', () => {
    const change = calculateNetWorthChange(july, august)

    expect(change.financialAssetsChange).toBeCloseTo(1_000.01)
    expect(change.physicalAssetsChange).toBe(0)
    expect(change.debtEffect).toBe(0)
    expect(change.netWorthChange).toBeCloseTo(1_000.01)
    expect(
      change.financialAssetsChange + change.physicalAssetsChange + change.debtEffect,
    ).toBeCloseTo(change.netWorthChange)
  })

  it('mantém investimento por competência separado da mudança de saldo', () => {
    const points = buildHistoryPoints([july, august])

    expect(points.map((point) => point.invested)).toEqual([540, 2_170.09])
    expect(points[1].netWorthDelta).toBeCloseTo(1_000.01)
  })

  it('trata redução de dívida como contribuição positiva', () => {
    const previous = snapshot({
      grossAssets: 50_000,
      physicalAssets: 200_000,
      liabilities: 100_000,
      securedLiabilities: 100_000,
    })
    const latest = snapshot({
      grossAssets: 50_000,
      physicalAssets: 200_000,
      liabilities: 90_000,
      securedLiabilities: 90_000,
    })

    expect(calculateNetWorthChange(previous, latest)).toMatchObject({
      financialAssetsChange: 0,
      physicalAssetsChange: 0,
      debtEffect: 10_000,
      netWorthChange: 10_000,
    })
  })
})

describe('calculateHistoryStats', () => {
  const points = buildHistoryPoints([
    snapshot({ id: 'a', month: '2026-05', costs: 3_000, grossAssets: 4_000, netWorth: 4_000, savingsRate: 10, cardPersonalTotal: 1_000 }),
    snapshot({ id: 'b', month: '2026-06', costs: 4_000, grossAssets: 5_000, netWorth: 5_000, savingsRate: 30, cardPersonalTotal: 2_000 }),
  ])

  it('médias são aritméticas sobre os meses fechados', () => {
    const stats = calculateHistoryStats(points)
    expect(stats.months).toBe(2)
    expect(stats.averageCosts).toBe(3_500)
    expect(stats.averageSavingsRate).toBe(20)
    expect(stats.averageCardPersonal).toBe(1_500)
  })

  it('o crescimento é do primeiro ao último mês', () => {
    const stats = calculateHistoryStats(points)
    expect(stats.netWorthGrowth).toBe(1_000)
    expect(stats.netWorthGrowthPct).toBe(25)
  })

  it('elege o melhor mês pela taxa de poupança', () => {
    expect(calculateHistoryStats(points).bestSavingsMonth?.month).toBe('2026-06')
  })

  it('histórico vazio não divide por zero', () => {
    const stats = calculateHistoryStats([])
    expect(stats.months).toBe(0)
    expect(stats.averageCosts).toBe(0)
    expect(stats.netWorthGrowthPct).toBe(0)
    expect(stats.bestSavingsMonth).toBeNull()
  })

  it('patrimônio inicial zero não gera percentual infinito', () => {
    const zeroStart = buildHistoryPoints([
      snapshot({ id: 'a', month: '2026-05', grossAssets: 0, netWorth: 0 }),
      snapshot({ id: 'b', month: '2026-06', grossAssets: 1_000, netWorth: 1_000 }),
    ])
    expect(calculateHistoryStats(zeroStart).netWorthGrowthPct).toBe(0)
  })
})

describe('averageMonthlyCosts', () => {
  it('exige pelo menos dois meses para virar base da reserva', () => {
    expect(averageMonthlyCosts(buildHistoryPoints([snapshot({ costs: 3_000 })]))).toBeNull()
    expect(averageMonthlyCosts([])).toBeNull()
  })

  it('média dos meses recentes', () => {
    const points = buildHistoryPoints([
      snapshot({ id: 'a', month: '2026-05', costs: 3_000, cardPersonalTotal: 0, cardByArea: {} }),
      snapshot({ id: 'b', month: '2026-06', costs: 4_000, cardPersonalTotal: 0, cardByArea: {} }),
    ])
    expect(averageMonthlyCosts(points)).toBe(3_500)
  })

  it('considera só a janela pedida, sempre a mais recente', () => {
    const points = buildHistoryPoints([
      snapshot({ id: 'a', month: '2026-01', costs: 10_000, cardPersonalTotal: 0, cardByArea: {} }),
      snapshot({ id: 'b', month: '2026-02', costs: 3_000, cardPersonalTotal: 0, cardByArea: {} }),
      snapshot({ id: 'c', month: '2026-03', costs: 4_000, cardPersonalTotal: 0, cardByArea: {} }),
    ])
    expect(averageMonthlyCosts(points, 2)).toBe(3_500)
  })
})
