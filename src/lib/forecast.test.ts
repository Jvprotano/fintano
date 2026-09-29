import { describe, expect, it } from 'vitest'
import {
  nextMonthKeyFor,
  normalizeAssumptions,
  normalizeExpectedEvent,
  occurrencesInMonth,
  occursIn,
  projectNetWorth,
  projectedAt,
  summarizeUpcoming,
} from './forecast'
import type { ExpectedEvent } from '../types'

function event(overrides: Partial<ExpectedEvent> = {}): ExpectedEvent {
  return normalizeExpectedEvent({
    id: 'e1',
    name: '13º salário',
    kind: 'income',
    amount: 6_800,
    month: '2026-12',
    recurrence: 'yearly',
    savedPct: 100,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  })
}

describe('occursIn', () => {
  it('evento único só acontece no mês dele', () => {
    const once = event({ recurrence: 'once' })
    expect(occursIn(once, '2026-12')).toBe(true)
    expect(occursIn(once, '2027-12')).toBe(false)
    expect(occursIn(once, '2026-11')).toBe(false)
  })

  it('evento anual repete de 12 em 12 meses', () => {
    const yearly = event({ recurrence: 'yearly' })
    expect(occursIn(yearly, '2026-12')).toBe(true)
    expect(occursIn(yearly, '2027-12')).toBe(true)
    expect(occursIn(yearly, '2028-12')).toBe(true)
    expect(occursIn(yearly, '2027-06')).toBe(false)
  })

  it('evento mensal acontece em todo mês a partir do primeiro', () => {
    const monthly = event({ recurrence: 'monthly', month: '2026-08' })
    expect(occursIn(monthly, '2026-07')).toBe(false)
    expect(occursIn(monthly, '2026-08')).toBe(true)
    expect(occursIn(monthly, '2026-09')).toBe(true)
  })

  it('nunca acontece antes do mês de início', () => {
    expect(occursIn(event({ recurrence: 'yearly' }), '2025-12')).toBe(false)
  })
})

describe('savedAmount', () => {
  it('entrada vira patrimônio só na fatia poupada', () => {
    const [occurrence] = occurrencesInMonth([event({ savedPct: 80 })], '2026-12')
    expect(occurrence.signedAmount).toBe(6_800)
    expect(occurrence.savedAmount).toBeCloseTo(5_440, 10)
  })

  it('saída sai inteira, sem fatia', () => {
    const [occurrence] = occurrencesInMonth(
      [event({ kind: 'expense', name: 'IPVA', amount: 1_900, month: '2027-01' })],
      '2027-01',
    )
    expect(occurrence.signedAmount).toBe(-1_900)
    expect(occurrence.savedAmount).toBe(-1_900)
  })

  it('savedPct é ignorado em saídas', () => {
    expect(normalizeExpectedEvent({ kind: 'expense', savedPct: 50 }).savedPct).toBeUndefined()
  })
})

describe('summarizeUpcoming', () => {
  const events = [
    event({ id: 'a', month: '2026-12', amount: 6_800, savedPct: 100 }),
    event({ id: 'b', name: 'Bônus', month: '2027-03', amount: 9_000, savedPct: 50 }),
    event({ id: 'c', name: 'IPVA', kind: 'expense', month: '2027-01', amount: 1_900 }),
  ]

  it('soma 12 meses a partir do mês informado', () => {
    const summary = summarizeUpcoming(events, '2026-07', 12)
    expect(summary.income).toBe(15_800)
    expect(summary.expense).toBe(1_900)
    expect(summary.net).toBe(13_900)
    // 6.800 + 4.500 − 1.900
    expect(summary.saved).toBe(9_400)
  })

  it('a janela exclui o que cai depois dela', () => {
    // Julho + 5 meses = até novembro; o 13º de dezembro fica fora.
    expect(summarizeUpcoming(events, '2026-07', 5).income).toBe(0)
  })

  it('conta duas ocorrências de um anual numa janela de 24 meses', () => {
    const summary = summarizeUpcoming([events[0]], '2026-07', 24)
    expect(summary.income).toBe(13_600)
  })
})

describe('projectNetWorth', () => {
  const base = {
    startMonth: '2026-07',
    startAssets: 10_000,
    monthlyContribution: 1_000,
    annualReturnPct: 0,
    inflationPct: 0,
    horizonMonths: 3,
    events: [],
  }

  it('o primeiro ponto é o presente, sem aporte nem rendimento', () => {
    const [first] = projectNetWorth(base)
    expect(first.month).toBe('2026-07')
    expect(first.assets).toBe(10_000)
    expect(first.contribution).toBe(0)
    expect(first.returns).toBe(0)
  })

  it('devolve horizonte + 1 pontos', () => {
    expect(projectNetWorth(base)).toHaveLength(4)
  })

  it('sem juros, o aporte só soma', () => {
    const points = projectNetWorth(base)
    expect(points[3].assets).toBe(13_000)
  })

  it('o rendimento incide sobre o saldo do início do mês', () => {
    const onePercentPerMonth = (Math.pow(1.01, 12) - 1) * 100
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      annualReturnPct: onePercentPerMonth,
      horizonMonths: 2,
    })
    expect(points[1].assets).toBeCloseTo(10_100, 6)
    expect(points[2].assets).toBeCloseTo(10_201, 6)
  })

  it('eventos entram no mês em que caem', () => {
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      horizonMonths: 6,
      events: [event({ month: '2026-09', amount: 5_000, recurrence: 'once', savedPct: 100 })],
    })
    expect(points[1].assets).toBe(10_000)
    expect(points[2].assets).toBe(15_000)
    expect(points[2].eventsSaved).toBe(5_000)
  })

  it('não reaplica uma entrada ou saída já conciliada antes do mês previsto', () => {
    const points = projectNetWorth({ ...base, monthlyContribution: 0, horizonMonths: 2,
      events: [event({ id: 'received', month: '2026-09', recurrence: 'once', amount: 2000 }),
        event({ id: 'hotel', kind: 'expense', month: '2026-09', recurrence: 'once', amount: 1500 })],
      remainingByOccurrence: { 'received@2026-09': 0, 'hotel@2026-09': 500 },
    })
    expect(points[2].eventsSaved).toBe(-500)
    expect(points[2].assets).toBe(9500)
  })

  it('carrega déficit não financiado para meses posteriores', () => {
    const points = projectNetWorth({ ...base, startAssets: 500, monthlyContribution: 300,
      horizonMonths: 3, events: [event({ kind: 'expense', month: '2026-08', recurrence: 'once', amount: 1200 })] })
    expect(points[1].assets).toBe(0)
    expect(points[1].unfunded).toBe(400)
    expect(points[2].unfunded).toBe(100)
    expect(points[3].assets).toBe(200)
  })

  it('amortiza a dívida e o líquido é a diferença', () => {
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      horizonMonths: 2,
      debts: [{ id: 'd', balance: 1_000, monthlyRatePct: 0, installment: 400 }],
    })
    expect(points[0].debt).toBe(1_000)
    expect(points[0].netWorth).toBe(9_000)
    expect(points[1].debt).toBe(600)
    expect(points[1].debtPaid).toBe(400)
    expect(points[2].debt).toBe(200)
    expect(points[2].netWorth).toBe(9_800)
  })

  it('a parcela não sai dos ativos — ela já é custo fixo do orçamento', () => {
    const withDebt = projectNetWorth({
      ...base,
      debts: [{ id: 'd', balance: 5_000, monthlyRatePct: 0, installment: 500 }],
    })
    const withoutDebt = projectNetWorth(base)
    expect(withDebt[3].assets).toBe(withoutDebt[3].assets)
  })

  it('a parcela liberada só entra no aporte quando pedido', () => {
    const debts = [{ id: 'd', balance: 400, monthlyRatePct: 0, installment: 400 }]
    const off = projectNetWorth({ ...base, debts, horizonMonths: 3 })
    const on = projectNetWorth({
      ...base,
      debts,
      horizonMonths: 3,
      reinvestFreedInstallments: true,
    })
    // A dívida zera no mês 1; do mês 2 em diante sobram 400 por mês.
    expect(off[3].assets).toBe(13_000)
    expect(on[3].assets).toBe(13_800)
  })

  it('a dívida nunca fica negativa', () => {
    const points = projectNetWorth({
      ...base,
      horizonMonths: 5,
      debts: [{ id: 'd', balance: 300, monthlyRatePct: 0, installment: 1_000 }],
    })
    expect(points.every((point) => point.debt >= 0)).toBe(true)
    expect(points[5].debt).toBe(0)
  })

  it('não muta as dívidas recebidas', () => {
    const debts = [{ id: 'd', balance: 1_000, monthlyRatePct: 0, installment: 400 }]
    projectNetWorth({ ...base, debts })
    expect(debts[0].balance).toBe(1_000)
  })

  it('sem inflação, nominal e real coincidem', () => {
    const points = projectNetWorth(base)
    expect(points[3].netWorthReal).toBeCloseTo(points[3].netWorth, 10)
  })

  it('com inflação, o real fica abaixo do nominal', () => {
    const points = projectNetWorth({ ...base, inflationPct: 6, horizonMonths: 12 })
    const last = points[12]
    expect(last.netWorthReal).toBeLessThan(last.netWorth)
    // 12 meses de 6% ao ano: o deflator é exatamente 1,06.
    expect(last.netWorthReal).toBeCloseTo(last.netWorth / 1.06, 6)
  })

  it('o presente não é deflacionado', () => {
    const [first] = projectNetWorth({ ...base, inflationPct: 10 })
    expect(first.netWorthReal).toBe(first.netWorth)
  })
})

describe('projectNetWorth — bens e dívida garantida', () => {
  const base = {
    startMonth: '2026-07',
    startAssets: 38_400,
    monthlyContribution: 1_000,
    annualReturnPct: 0,
    inflationPct: 0,
    horizonMonths: 3,
    events: [],
  }
  const financing = {
    id: 'fin',
    balance: 262_000,
    monthlyRatePct: 0,
    installment: 2_000,
    secured: true,
  }
  const house = { id: 'casa', value: 480_000, annualAppreciationPct: 0 }

  it('o financiamento sem o bem cadastrado afunda o líquido — o erro que existia', () => {
    const points = projectNetWorth({ ...base, debts: [financing] })
    expect(points[0].netWorth).toBe(38_400 - 262_000)
    // Mas o dinheiro em si não é afetado: é o número que responde a decisão.
    expect(points[0].financialNetWorth).toBe(38_400)
  })

  it('com o bem, o líquido reflete o balanço de verdade', () => {
    const points = projectNetWorth({ ...base, debts: [financing], properties: [house] })
    expect(points[0].properties).toBe(480_000)
    expect(points[0].netWorth).toBe(38_400 + 480_000 - 262_000)
  })

  it('a amortização vira patrimônio em vez de evaporar', () => {
    const points = projectNetWorth({ ...base, debts: [financing], properties: [house] })
    expect(points[1].equityBuilt).toBe(2_000)
    // Três meses de parcela: dinheiro cresce pelo aporte, líquido cresce por
    // aporte *e* amortização.
    expect(points[3].financialNetWorth - points[0].financialNetWorth).toBe(3_000)
    expect(points[3].netWorth - points[0].netWorth).toBe(3_000 + 6_000)
  })

  it('dívida sem garantia sai do patrimônio financeiro; a garantida, não', () => {
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      debts: [financing, { id: 'cartao', balance: 5_000, monthlyRatePct: 0, installment: 500 }],
      properties: [house],
    })
    expect(points[0].financialNetWorth).toBe(38_400 - 5_000)
    expect(points[0].securedDebt).toBe(262_000)
  })

  it('o bem se valoriza pela premissa dele, sem receber aporte', () => {
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      horizonMonths: 12,
      properties: [{ id: 'casa', value: 100_000, annualAppreciationPct: 4 }],
    })
    expect(points[12].properties).toBeCloseTo(104_000, 6)
    expect(points[12].assets).toBe(38_400)
  })

  it('um veículo desvaloriza e puxa o líquido para baixo', () => {
    const points = projectNetWorth({
      ...base,
      monthlyContribution: 0,
      horizonMonths: 12,
      properties: [{ id: 'carro', value: 60_000, annualAppreciationPct: -10 }],
    })
    expect(points[12].properties).toBeCloseTo(54_000, 6)
    expect(points[12].netWorth).toBeLessThan(points[0].netWorth)
  })

  it('não muta os bens recebidos', () => {
    const properties = [{ id: 'casa', value: 480_000, annualAppreciationPct: 4 }]
    projectNetWorth({ ...base, properties })
    expect(properties[0].value).toBe(480_000)
  })

  it('bens também são deflacionados na leitura em reais de hoje', () => {
    const points = projectNetWorth({
      ...base,
      inflationPct: 6,
      horizonMonths: 12,
      properties: [house],
    })
    expect(points[12].propertiesReal).toBeCloseTo(points[12].properties / 1.06, 6)
    expect(points[12].financialNetWorthReal).toBeCloseTo(
      points[12].financialNetWorth / 1.06,
      6,
    )
  })
})

describe('projectedAt', () => {
  const points = projectNetWorth({
    startMonth: '2026-07',
    startAssets: 10_000,
    monthlyContribution: 1_000,
    annualReturnPct: 0,
    inflationPct: 0,
    horizonMonths: 3,
    events: [],
  })

  it('encontra o mês dentro do horizonte', () => {
    expect(projectedAt(points, '2026-09')).toBe(12_000)
  })

  it('fora do horizonte, devolve null', () => {
    expect(projectedAt(points, '2028-01')).toBeNull()
  })

  it('mês passado cai no presente, que é a melhor resposta disponível', () => {
    expect(projectedAt(points, '2026-01')).toBe(10_000)
  })
})

describe('normalizeAssumptions', () => {
  it('preenche as premissas ausentes com os padrões', () => {
    const assumptions = normalizeAssumptions({})
    expect(assumptions.monthlyContribution).toBeNull()
    expect(assumptions.annualReturnPct).toBe(10)
    expect(assumptions.inflationPct).toBe(4.5)
    expect(assumptions.showInRealTerms).toBe(false)
  })

  it('limita o horizonte e a inflação a faixas úteis', () => {
    expect(normalizeAssumptions({ horizonMonths: 1 }).horizonMonths).toBe(3)
    expect(normalizeAssumptions({ horizonMonths: 999 }).horizonMonths).toBe(120)
    expect(normalizeAssumptions({ inflationPct: -5 }).inflationPct).toBe(0)
  })

  it('aporte negativo volta a ser "usar o plano"', () => {
    expect(normalizeAssumptions({ monthlyContribution: -100 }).monthlyContribution).toBeNull()
  })

  it('aporte zero é uma escolha legítima', () => {
    expect(normalizeAssumptions({ monthlyContribution: 0 }).monthlyContribution).toBe(0)
  })
})

describe('nextMonthKeyFor', () => {
  it('mês que ainda vem é neste ano', () => {
    expect(nextMonthKeyFor(12, '2026-07')).toBe('2026-12')
  })

  it('mês que já passou é no ano que vem', () => {
    expect(nextMonthKeyFor(3, '2026-07')).toBe('2027-03')
  })

  it('o mês corrente conta como o próximo', () => {
    expect(nextMonthKeyFor(7, '2026-07')).toBe('2026-07')
  })
})
