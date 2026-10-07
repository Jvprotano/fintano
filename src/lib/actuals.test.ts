import { describe, expect, it } from 'vitest'
import { normalizeActuals, summarizeActuals } from './actuals'
import type { CostItem, WantItem } from '../types'

const costs: CostItem[] = [
  { id: 'aluguel', name: 'Aluguel', value: 2_000, category: 'moradia', paidWith: 'account' },
  { id: 'energia', name: 'Energia', value: 200, category: 'contas', paidWith: 'account' },
  { id: 'mercado', name: 'Mercado', value: 1_300, category: 'alimentacao', paidWith: 'card' },
]

const wants: WantItem[] = [
  { id: 'cartao', name: 'Cartão', plannedAmount: 1_000, paidWith: 'card' },
  { id: 'streaming', name: 'Streaming', plannedAmount: 100, paidWith: 'card' },
  { id: 'viagem', name: 'Viagem', plannedAmount: 400, paidWith: 'account' },
]

describe('summarizeActuals', () => {
  it('sem confirmação, o efetivo estima somente contas e o realizado é zero', () => {
    const summary = summarizeActuals(costs, undefined, '2026-07')
    expect(summary.effectiveCosts).toBe(2_200)
    expect(summary.plannedCosts).toBe(2_200)
    expect(summary.variance).toBe(0)
    expect(summary.informedCount).toBe(0)
    expect(summary.confirmedCosts).toBe(0)
    expect(summary.rows.some((row) => row.cost.id === 'mercado')).toBe(false)
  })

  it('o valor informado substitui o planejado apenas naquele item', () => {
    const summary = summarizeActuals(costs, { month: '2026-07', costs: { energia: 260 }, extraIncome: [], extraExpenses: [] }, '2026-07')
    expect(summary.effectiveCosts).toBe(2_260)
    expect(summary.variance).toBe(60)
    expect(summary.informedCount).toBe(1)
  })

  it('zero informado é uma informação, não ausência', () => {
    const summary = summarizeActuals(costs, { month: '2026-07', costs: { energia: 0 }, extraIncome: [], extraExpenses: [] }, '2026-07')
    expect(summary.effectiveCosts).toBe(2_000)
    expect(summary.informedCount).toBe(1)
    expect(summary.rows.find((row) => row.cost.id === 'energia')?.actual).toBe(0)
  })

  it('cada linha carrega plano, realizado e a diferença', () => {
    const summary = summarizeActuals(costs, { month: '2026-07', costs: { aluguel: 1_800 }, extraIncome: [], extraExpenses: [] }, '2026-07')
    const row = summary.rows.find((item) => item.cost.id === 'aluguel')!
    expect(row.planned).toBe(2_000)
    expect(row.actual).toBe(1_800)
    expect(row.effective).toBe(1_800)
    expect(row.variance).toBe(-200)
  })

  it('itens sem valor informado ficam com actual null', () => {
    const summary = summarizeActuals(costs, { month: '2026-07', costs: {}, extraIncome: [], extraExpenses: [] }, '2026-07')
    expect(summary.rows.every((row) => row.actual === null)).toBe(true)
  })

  it('as categorias usam o realizado', () => {
    const summary = summarizeActuals(costs, { month: '2026-07', costs: { energia: 260 }, extraIncome: [], extraExpenses: [] }, '2026-07')
    expect(summary.byCategory.get('contas')).toBe(260)
    expect(summary.byCategory.get('moradia')).toBe(2_000)
  })

  it('a soma das categorias é o total efetivo', () => {
    const summary = summarizeActuals(
      costs,
      { month: '2026-07', costs: { energia: 260, mercado: 1_500 }, extraIncome: [], extraExpenses: [] },
      '2026-07',
    )
    const total = Array.from(summary.byCategory.values()).reduce((sum, value) => sum + value, 0)
    expect(total).toBe(summary.effectiveCosts)
  })

  it('o rateio com terceiros continua valendo para o plano', () => {
    const shared: CostItem[] = [
      { id: 'c', name: 'Aluguel', value: 2_000, category: 'moradia', sharedAmount: 800 },
    ]
    const summary = summarizeActuals(shared, undefined, '2026-07')
    expect(summary.plannedCosts).toBe(1_200)
  })

  it('valor informado de um custo sem cadastro continua no realizado', () => {
    const summary = summarizeActuals(
      costs,
      { month: '2026-07', costs: { apagado: 999 }, extraIncome: [], extraExpenses: [] },
      '2026-07',
    )
    expect(summary.effectiveCosts).toBe(3_199)
    expect(summary.informedCount).toBe(1)
    expect(summary.rows.find((row) => row.cost.id === 'apagado')).toMatchObject({
      planned: 0, actual: 999, cost: { name: 'Custo sem cadastro' },
    })
  })

  it('item arquivado conserva nome e realizado sem continuar no plano', () => {
    const archivedCost: CostItem = {
      id: 'internet', name: 'Internet antiga', value: 120, category: 'contas',
      archivedAt: '2026-07-31T12:00:00.000Z',
    }
    const archivedWant: WantItem = {
      id: 'viagem-antiga', name: 'Viagem antiga', plannedAmount: 200, paidWith: 'account',
      archivedAt: '2026-07-31T12:00:00.000Z',
    }
    const summary = summarizeActuals(
      [], { month: '2026-07', costs: { internet: 135 }, wants: { 'viagem-antiga': 170 } },
      '2026-07', [], [archivedCost], [archivedWant],
    )
    expect(summary).toMatchObject({
      plannedCosts: 0, effectiveCosts: 135,
      plannedWants: 0, effectiveWants: 170,
    })
    expect(summary.rows[0].cost.name).toBe('Internet antiga')
    expect(summary.wantRows[0].want.name).toBe('Viagem antiga')
  })

  it('sem custos cadastrados, tudo é zero', () => {
    const summary = summarizeActuals([], undefined, '2026-07')
    expect(summary.effectiveCosts).toBe(0)
    expect(summary.rows).toEqual([])
  })

  it('Desejos fora do cartão usam o realizado e preservam o plano separadamente', () => {
    const summary = summarizeActuals(
      costs,
      { month: '2026-07', costs: {}, wants: { cartao: 850, viagem: 500 } },
      '2026-07',
      wants,
    )

    expect(summary.plannedWants).toBe(400)
    expect(summary.effectiveWants).toBe(500)
    expect(summary.wantsVariance).toBe(100)
    expect(summary.informedWantsCount).toBe(1)
  })

  it('remove completamente Desejos pagos no cartão, inclusive seus detalhes', () => {
    const summary = summarizeActuals(
      costs,
      {
        month: '2026-07',
        costs: {},
        wants: { cartao: 850, streaming: 90, viagem: 500 },
      },
      '2026-07',
      wants,
    )

    expect(summary.effectiveWants).toBe(500)
    expect(summary.wantRows.map((row) => row.want.id)).toEqual(['viagem'])
  })

  it('zero em um Desejo é realizado legítimo', () => {
    const summary = summarizeActuals(
      [],
      { month: '2026-07', costs: {}, wants: { viagem: 0 } },
      '2026-07',
      [wants[2]],
    )

    expect(summary.effectiveWants).toBe(0)
    expect(summary.wantRows[0].actual).toBe(0)
  })
})

describe('normalizeActuals', () => {
  it('descarta valores negativos e não numéricos', () => {
    const normalized = normalizeActuals({
      month: '2026-07',
      costs: { a: -5, b: Number.NaN as number, c: 100 },
    })
    expect(normalized.costs).toEqual({ c: 100 })
  })

  it('preserva o zero', () => {
    expect(normalizeActuals({ month: '2026-07', costs: { a: 0 } }).costs).toEqual({ a: 0 })
  })

  it('normaliza realizados de Desejos sem aceitar valores inválidos', () => {
    expect(
      normalizeActuals({ wants: { viagem: 500, zero: 0, erro: -10 } }).wants,
    ).toEqual({ viagem: 500, zero: 0 })
  })

  it('mês inválido cai no mês corrente', () => {
    expect(normalizeActuals({ month: 'julho' }).month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('preserva apenas entradas extras identificadas e positivas', () => {
    const normalized = normalizeActuals({
      month: '2026-07',
      extraIncome: [
        { id: 'horas', name: ' Banco de horas ', amount: 850 },
        { id: 'sem-nome', name: '', amount: 100 },
        { id: 'negativa', name: 'Erro', amount: -50 },
      ],
    })

    expect(normalized.extraIncome).toEqual([
      { id: 'horas', name: 'Banco de horas', amount: 850, sourceEventId: undefined },
    ])
  })

  it('soma as entradas extras no resumo sem misturá-las aos custos', () => {
    const summary = summarizeActuals(
      costs,
      {
        month: '2026-07',
        costs: {},
        extraIncome: [
          { id: 'a', name: 'Banco de horas', amount: 850 },
          { id: 'b', name: 'Venda', amount: 150 },
        ],
        extraExpenses: [],
      },
      '2026-07',
    )

    expect(summary.extraIncomeTotal).toBe(1_000)
    expect(summary.effectiveCosts).toBe(2_200)
  })

  it('soma saídas extraordinárias separadamente', () => {
    const summary = summarizeActuals(
      costs,
      {
        month: '2026-07',
        costs: {},
        extraIncome: [],
        extraExpenses: [{ id: 'ipva', name: 'IPVA', amount: 1_900 }],
      },
      '2026-07',
    )

    expect(summary.extraExpenseTotal).toBe(1_900)
    expect(summary.effectiveCosts).toBe(2_200)
  })
})
