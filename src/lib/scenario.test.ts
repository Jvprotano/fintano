import { describe, expect, it } from 'vitest'
import {
  calculateScenario,
  createDefaultScenario,
  moveWantInPlanningOrder,
  normalizeScenario,
  orderWantsForPlanning,
  personalCostValue,
} from './scenario'
import { normalizeEmergencyFund } from './investments'
import type { CostItem, FinanceScenario } from '../types'

function scenario(overrides: Partial<FinanceScenario> = {}): FinanceScenario {
  return normalizeScenario({ ...createDefaultScenario('Teste'), ...overrides })
}

const fund = normalizeEmergencyFund({ current: 0, targetMonths: 6, transactions: [] })

describe('personalCostValue', () => {
  it('desconta a parte de terceiros', () => {
    expect(
      personalCostValue({ id: 'c', name: 'Aluguel', value: 2_000, category: 'moradia', sharedAmount: 800 }),
    ).toBe(1_200)
  })

  it('a parte de terceiros nunca passa do valor da conta', () => {
    expect(
      personalCostValue({ id: 'c', name: 'x', value: 100, category: 'outros', sharedAmount: 500 }),
    ).toBe(0)
  })

  it('sem rateio, é o valor cheio', () => {
    expect(personalCostValue({ id: 'c', name: 'x', value: 100, category: 'outros' })).toBe(100)
  })
})

describe('normalizeScenario — forma de pagamento', () => {
  it('custos antigos migram como débito em conta', () => {
    const normalized = scenario({
      costs: [{ id: 'c', name: 'Energia', value: 200, category: 'contas' } as CostItem],
    })
    expect(normalized.costs[0].paidWith).toBe('account')
  })

  it('desejos antigos migram como cartão', () => {
    const normalized = scenario({
      costs: [],
      wants: [{ id: 'w', name: 'Comer fora', plannedAmount: 400 }],
    })
    expect(normalized.wants[0].paidWith).toBe('card')
  })

  it('descarta campos de módulos que deixaram de viver no cenário', () => {
    const legacy = {
      ...createDefaultScenario('Antigo'),
      emergencyFund: { current: 999, targetMonths: 3, transactions: [] },
      creditCardEntries: [{ id: 'x' }],
    } as unknown as FinanceScenario
    const normalized = normalizeScenario(legacy)
    expect('emergencyFund' in normalized).toBe(false)
    expect('creditCardEntries' in normalized).toBe(false)
  })
})

describe('calculateScenario — base do orçamento', () => {
  it('preserva a relação opcional entre previdência e posição patrimonial', () => {
    const normalized = scenario({
      deductions: [
        {
          id: 'd1',
          name: 'PGBL',
          value: 500,
          type: 'previdencia_privada',
          linkedHoldingId: 'holding-pgbl',
        },
      ],
    })

    expect(normalized.deductions[0].linkedHoldingId).toBe('holding-pgbl')
  })

  it('benefícios saem da base; previdência em folha continua contando', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 10_000,
        salaryInputMode: 'before_payroll_deductions',
        deductions: [
          { id: 'd1', name: 'PGBL', value: 500, type: 'previdencia_privada' },
          { id: 'd2', name: 'Plano', value: 300, type: 'plano_saude' },
        ],
      }),
      fund,
    )
    // 10.000 − 300 de benefício; a previdência de 500 fica na base.
    expect(metrics.availableForBudget).toBe(9_700)
    // O que cai na conta desconta a folha inteira.
    expect(metrics.paycheckInAccount).toBe(9_200)
  })

  it('quem informa o líquido soma a previdência de volta à base', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 9_200,
        salaryInputMode: 'take_home',
        deductions: [{ id: 'd1', name: 'PGBL', value: 500, type: 'previdencia_privada' }],
      }),
      fund,
    )
    expect(metrics.availableForBudget).toBe(9_700)
    expect(metrics.paycheckInAccount).toBe(9_200)
  })

  it('a base nunca fica negativa', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 100,
        deductions: [{ id: 'd', name: 'Plano', value: 900, type: 'plano_saude' }],
      }),
      fund,
    )
    expect(metrics.availableForBudget).toBe(0)
  })
})

describe('calculateScenario — competência e caixa', () => {
  const withMixedPayments = scenario({
    salaryNet: 10_000,
    salaryInputMode: 'take_home',
    costs: [
      { id: 'c1', name: 'Aluguel', value: 2_000, category: 'moradia', paidWith: 'account' },
      { id: 'c2', name: 'Mercado', value: 1_300, category: 'alimentacao', paidWith: 'card' },
      { id: 'c3', name: 'Academia', value: 150, category: 'saude', paidWith: 'card' },
    ],
    wants: [
      { id: 'w1', name: 'Comer fora', plannedAmount: 500, paidWith: 'card' },
      { id: 'w2', name: 'Barbeiro', plannedAmount: 100, paidWith: 'account' },
    ],
  })

  it('separa o que passa no cartão do que sai da conta', () => {
    const metrics = calculateScenario(withMixedPayments, fund)
    expect(metrics.costsOnCard).toBe(1_450)
    expect(metrics.costsOnAccount).toBe(2_000)
    expect(metrics.wantsOnCard).toBe(500)
    expect(metrics.wantsOnAccount).toBe(100)
    expect(metrics.plannedOnCard).toBe(1_950)
  })

  it('a soma das duas formas é sempre o total', () => {
    const metrics = calculateScenario(withMixedPayments, fund)
    expect(metrics.costsOnCard + metrics.costsOnAccount).toBe(metrics.totalCosts)
    expect(metrics.wantsOnCard + metrics.wantsOnAccount).toBe(metrics.totalWantsAmount)
  })

  it('trata desejos de cartão como detalhes quando existe envelope Cartão', () => {
    const metrics = calculateScenario(
      scenario({
        wants: [
          { id: 'card', name: 'Cartão', kind: 'card_envelope' as const, plannedAmount: 2_800, paidWith: 'card' },
          { id: 'yt', name: 'YT Premium', plannedAmount: 54, paidWith: 'card' },
          { id: 'gym', name: 'Academia', plannedAmount: 80, paidWith: 'card' },
          { id: 'trip', name: 'Viagens', plannedAmount: 300, paidWith: 'account' },
        ],
      }),
      fund,
    )

    expect(metrics.totalWantsAmount).toBe(3_100)
    expect(metrics.wantsOnCard).toBe(2_800)
    expect(metrics.wantsOnAccount).toBe(300)
    expect(metrics.cardIncludedWantsAmount).toBe(134)
  })

  it('permite somar um item de cartão fora do envelope', () => {
    const metrics = calculateScenario(
      scenario({
        wants: [
          { id: 'card', name: 'Cartão', kind: 'card_envelope' as const, plannedAmount: 2_800, paidWith: 'card' },
          {
            id: 'extra',
            name: 'Compra fora do limite',
            plannedAmount: 200,
            paidWith: 'card',
            includedInCardPlan: false,
          },
        ],
      }),
      fund,
    )

    expect(metrics.totalWantsAmount).toBe(3_000)
    expect(metrics.wantsOnCard).toBe(3_000)
    expect(metrics.cardIncludedWantsAmount).toBe(0)
  })

  it('o rateio com terceiros vale também para a parte no cartão', () => {
    const metrics = calculateScenario(
      scenario({
        costs: [
          {
            id: 'c',
            name: 'Mercado',
            value: 1_000,
            category: 'alimentacao',
            paidWith: 'card',
            sharedAmount: 400,
          },
        ],
      }),
      fund,
    )
    expect(metrics.costsOnCard).toBe(600)
  })
})

describe('calculateScenario — reserva de emergência', () => {
  const withCosts = scenario({
    salaryNet: 10_000,
    salaryInputMode: 'take_home',
    costs: [{ id: 'c', name: 'Aluguel', value: 2_000, category: 'moradia' }],
  })

  it('sem histórico, a base é o custo planejado', () => {
    const metrics = calculateScenario(withCosts, fund)
    expect(metrics.emergencyFundUsesHistory).toBe(false)
    expect(metrics.emergencyFundBaseCosts).toBe(2_000)
    expect(metrics.emergencyFundTarget).toBe(12_000)
  })

  it('com histórico, a base é o custo médio real', () => {
    const metrics = calculateScenario(withCosts, fund, undefined, 2_600)
    expect(metrics.emergencyFundUsesHistory).toBe(true)
    expect(metrics.emergencyFundTarget).toBe(15_600)
  })

  it('média confirmada em zero conserva zero como base da reserva', () => {
    const metrics = calculateScenario(withCosts, fund, undefined, 0)
    expect(metrics.emergencyFundUsesHistory).toBe(true)
    expect(metrics.emergencyFundTarget).toBe(0)
  })
})

describe('calculateScenario — orçamento e realizado', () => {
  it('o realizado do cartão entra em cada área sem alterar o planejado', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 10_000,
        salaryInputMode: 'take_home',
        costs: [{ id: 'c', name: 'Aluguel', value: 2_000, category: 'moradia' }],
      }),
      fund,
      { necessidades: 769, desejos: 730, investimentos: 0 },
    )
    expect(metrics.budgetComparison.necessidades.actual).toBe(2_000)
    expect(metrics.budgetComparison.necessidades.realized).toBe(769)
    expect(metrics.budgetComparison.desejos.realized).toBe(730)
  })

  it('o aporte direto é o que falta depois da folha', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 10_000,
        salaryInputMode: 'take_home',
        selectedModelId: '50-30-20',
        deductions: [{ id: 'd', name: 'PGBL', value: 500, type: 'previdencia_privada' }],
      }),
      fund,
    )
    // Base 10.500; meta de 20% = 2.100; já saem 500 em folha.
    expect(metrics.budgetAllocation.investimentos).toBe(2_100)
    expect(metrics.directInvestmentTarget).toBe(1_600)
    expect(metrics.totalPlannedInvestment).toBe(2_100)
  })

  it('folha acima da meta não gera aporte direto negativo', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 3_000,
        salaryInputMode: 'take_home',
        deductions: [{ id: 'd', name: 'PGBL', value: 2_000, type: 'previdencia_privada' }],
      }),
      fund,
    )
    expect(metrics.directInvestmentTarget).toBe(0)
  })

  it('modelo personalizado usa as proporções do cenário', () => {
    const metrics = calculateScenario(
      scenario({
        salaryNet: 1_000,
        salaryInputMode: 'take_home',
        selectedModelId: 'custom',
        customModel: { n: 40, d: 20, i: 40 },
      }),
      fund,
    )
    expect(metrics.budgetAllocation.investimentos).toBe(400)
    expect(metrics.budgetAllocation.desejos).toBe(200)
  })
})

describe('ordem dos desejos no planejamento', () => {
  const wants = [
    { id: 'trip', name: 'Viagens', plannedAmount: 300, paidWith: 'account' as const },
    { id: 'yt', name: 'YT Premium', plannedAmount: 54, paidWith: 'card' as const },
    { id: 'card', name: 'Cartão', kind: 'card_envelope' as const, plannedAmount: 2_800, paidWith: 'card' as const },
    { id: 'gym', name: 'Academia', plannedAmount: 80, paidWith: 'card' as const },
    {
      id: 'extra',
      name: 'Compra fora do envelope',
      plannedAmount: 200,
      paidWith: 'card' as const,
      includedInCardPlan: false,
    },
  ]

  it('coloca os detalhes imediatamente abaixo do envelope Cartão', () => {
    expect(orderWantsForPlanning(wants).map((want) => want.id)).toEqual([
      'trip',
      'card',
      'yt',
      'gym',
      'extra',
    ])
  })

  it('reordena detalhes sem separá-los do envelope', () => {
    expect(moveWantInPlanningOrder(wants, 'gym', -1).map((want) => want.id)).toEqual([
      'trip',
      'card',
      'gym',
      'yt',
      'extra',
    ])
  })

  it('move o envelope inteiro entre os itens de primeiro nível', () => {
    expect(moveWantInPlanningOrder(wants, 'card', -1).map((want) => want.id)).toEqual([
      'card',
      'yt',
      'gym',
      'trip',
      'extra',
    ])
  })
})
