import { describe, expect, it } from 'vitest'
import {
  buildRemainingInstallmentsAmount,
  calculateCreditCardSummary,
  carryUnappliedCredits,
  describeCardCycles,
  advanceCreditCardSettingsCycle,
  inferDueMonthFromPaymentDate,
  normalizeCardAccount,
  normalizeCreditCardSettings,
  normalizeCreditCardEntry,
  parsePaymentDay,
  syncGeneratedNextEntries,
  unregisteredCardNames,
} from './creditCards'
import type { CreditCardEntry, CreditCardSettings } from '../types'

const settings: CreditCardSettings = { paymentDate: '05/07', personalSpendingLimit: 1_500 }

function entry(overrides: Partial<CreditCardEntry> = {}): CreditCardEntry {
  return normalizeCreditCardEntry({
    id: 'e1',
    cycle: 'current',
    description: 'Compra',
    purchaseDate: '10/07',
    cardName: 'Itaú',
    amount: 100,
    personalAmount: 100,
    remainingAmount: 0,
    ...overrides,
  } as CreditCardEntry)
}

describe('calculateCreditCardSummary', () => {
  it('transfere só o saldo não aplicado ao pagar a fatura', () => {
    const purchases = [
      entry({ id: 'purchase-a', cardName: 'Itaú', amount: 100, personalAmount: 60 }),
      entry({ id: 'purchase-b', cardName: 'XP', amount: 100, personalAmount: 100 }),
    ]
    const credits = [
      entry({ id: 'credit-a', cardName: 'Itaú', entryType: 'invoiceCredit', creditSource: 'payment', cashCycleMonth: '2026-09', amount: 90, personalAmount: 90 }),
      entry({ id: 'credit-b', cardName: 'XP', entryType: 'invoiceCredit', creditSource: 'reward', amount: 20, personalAmount: 20 }),
    ]
    const carried = carryUnappliedCredits([...purchases, ...credits])
    expect(carried).toHaveLength(1)
    expect(carried[0]).toMatchObject({ cardName: 'Itaú', amount: 30, personalAmount: 30, originCreditId: 'credit-a', cashCycleMonth: '2026-09', creditSource: 'payment' })
    expect(carried[0].id).not.toBe('credit-a')
  })

  it('abate pagamento ou pontos somente da parte pessoal do cartão escolhido', () => {
    const summary = calculateCreditCardSummary([
      entry({ id: 'a', cardName: 'Itaú', amount: 300, personalAmount: 200, budgetArea: 'desejos' }),
      entry({ id: 'b', cardName: 'XP', amount: 120, personalAmount: 120 }),
      entry({ id: 'c', cardName: 'Itaú', entryType: 'invoiceCredit', creditSource: 'reward', amount: 80, personalAmount: 80, description: 'Pontos' }),
    ], settings)
    expect(summary.currentTotal).toBe(340)
    expect(summary.currentPersonalTotal).toBe(240)
    expect(summary.currentThirdPartyTotal).toBe(100)
    expect(summary.currentCreditTotal).toBe(80)
    expect(summary.personalByArea.desejos).toBe(200)
    expect(summary.unclassifiedPersonal).toBe(120)
    expect(summary.totalsByCard.find((card) => card.cardName === 'Itaú')).toMatchObject({ totalAmount: 220, personalAmount: 120, thirdPartyAmount: 100 })
  })

  it('não desconta crédito além da parte pessoal do cartão', () => {
    const summary = calculateCreditCardSummary([
      entry({ id: 'a', cardName: 'Itaú', amount: 100, personalAmount: 60 }),
      entry({ id: 'b', cardName: 'XP', amount: 100, personalAmount: 100 }),
      entry({ id: 'c', cardName: 'Itaú', entryType: 'invoiceCredit', amount: 90, personalAmount: 90 }),
    ], settings)
    expect(summary.currentTotal).toBe(140)
    expect(summary.currentPersonalTotal).toBe(100)
    expect(summary.currentUnappliedCreditTotal).toBe(30)
  })

  it('separa a sua parte da de terceiros', () => {
    const summary = calculateCreditCardSummary(
      [entry({ amount: 300, personalAmount: 100, ownerName: 'Ana' })],
      settings,
    )
    expect(summary.currentTotal).toBe(300)
    expect(summary.currentPersonalTotal).toBe(100)
    expect(summary.currentThirdPartyTotal).toBe(200)
    expect(summary.totalsByOwner[0].cardName).toBe('Ana')
  })

  it('compra antecipada sai dos totais devidos mas continua na área do orçamento', () => {
    const summary = calculateCreditCardSummary(
      [entry({ amount: 200, personalAmount: 200, isPrepaid: true, budgetArea: 'desejos' })],
      settings,
    )
    expect(summary.currentTotal).toBe(0)
    expect(summary.currentPrepaidTotal).toBe(200)
    // Já saiu do bolso neste mês: consome o orçamento de desejos.
    expect(summary.personalByArea.desejos).toBe(200)
  })

  it('agrupa o gasto pessoal por área e isola o que não tem área', () => {
    const summary = calculateCreditCardSummary(
      [
        entry({ id: 'a', amount: 149, personalAmount: 149, budgetArea: 'necessidades' }),
        entry({ id: 'b', amount: 320, personalAmount: 320, budgetArea: 'desejos' }),
        entry({ id: 'c', amount: 80, personalAmount: 80 }),
      ],
      settings,
    )
    expect(summary.personalByArea.necessidades).toBe(149)
    expect(summary.personalByArea.desejos).toBe(320)
    expect(summary.unclassifiedPersonal).toBe(80)
  })

  it('o limite disponível pode ficar negativo', () => {
    const summary = calculateCreditCardSummary(
      [entry({ amount: 2_000, personalAmount: 2_000 })],
      settings,
    )
    expect(summary.availablePersonalLimit).toBe(-500)
  })

  it('parcelas restantes de terceiros entram rateadas', () => {
    const summary = calculateCreditCardSummary(
      [entry({ amount: 400, personalAmount: 100, remainingAmount: 1_200 })],
      settings,
    )
    expect(summary.remainingInstallmentsTotal).toBe(1_200)
    // 25% da compra é sua, logo 25% do que resta.
    expect(summary.remainingPersonalInstallmentsTotal).toBe(300)
  })

  it('totais por cartão vêm ordenados pelo maior', () => {
    const summary = calculateCreditCardSummary(
      [
        entry({ id: 'a', cardName: 'XP', amount: 100, personalAmount: 100 }),
        entry({ id: 'b', cardName: 'Itaú', amount: 500, personalAmount: 500 }),
      ],
      settings,
    )
    expect(summary.totalsByCard.map((card) => card.cardName)).toEqual(['Itaú', 'XP'])
  })

  it('totais por cartão mostram também o que não é meu', () => {
    const summary = calculateCreditCardSummary(
      [
        entry({ id: 'a', cardName: 'Itaú', amount: 300, personalAmount: 100 }),
        entry({ id: 'b', cardName: 'Itaú', amount: 120, personalAmount: 120 }),
      ],
      settings,
    )
    expect(summary.totalsByCard[0]).toMatchObject({
      cardName: 'Itaú',
      totalAmount: 420,
      personalAmount: 220,
      thirdPartyAmount: 200,
    })
  })
})

describe('syncGeneratedNextEntries', () => {
  it('assinatura recorrente se repete na próxima fatura', () => {
    const result = syncGeneratedNextEntries(
      [entry({ description: 'Netflix', purchaseDate: '01/09', isRecurring: true })],
      '2026-10',
    )
    const next = result.filter((item) => item.cycle === 'next')
    expect(next).toHaveLength(1)
    expect(next[0].description).toBe('Netflix')
    expect(next[0].purchaseDate).toBe('01/10')
    expect(next[0].autoGenerated).toBe(true)
  })

  it('edição da assinatura atualiza a data gerada na fatura seguinte', () => {
    const firstSync = syncGeneratedNextEntries(
      [entry({ description: 'YouTube Premium', purchaseDate: '01/09', isRecurring: true })],
      '2026-10',
    )
    const edited = firstSync.map((item) =>
      item.cycle === 'current' ? { ...item, purchaseDate: '15/09' } : item,
    )

    const secondSync = syncGeneratedNextEntries(edited, '2026-10')

    expect(secondSync.find((item) => item.cycle === 'next')?.purchaseDate).toBe('15/10')
  })

  it('continua avançando a data depois que a fatura seguinte vira a atual', () => {
    const october = syncGeneratedNextEntries(
      [entry({ description: 'YouTube Premium', purchaseDate: '01/09', isRecurring: true })],
      '2026-10',
    ).find((item) => item.cycle === 'next')!

    const november = syncGeneratedNextEntries(
      [{ ...october, id: 'october', cycle: 'current', autoGenerated: false }],
      '2026-11',
    )

    expect(november.find((item) => item.cycle === 'next')?.purchaseDate).toBe('01/11')
  })

  it('ajusta a assinatura para o último dia quando o mês seguinte é menor', () => {
    const result = syncGeneratedNextEntries(
      [entry({ purchaseDate: '31/01/2026', isRecurring: true })],
      '2026-02',
    )

    expect(result.find((item) => item.cycle === 'next')?.purchaseDate).toBe('28/02/2026')
  })

  it('a antecipação de pagamento não vaza para o ciclo seguinte', () => {
    const result = syncGeneratedNextEntries([
      entry({ description: 'Spotify', isRecurring: true, isPrepaid: true }),
    ])
    expect(result.find((item) => item.cycle === 'next')?.isPrepaid).toBeUndefined()
  })

  it('parcela avança para a seguinte e recalcula o que resta', () => {
    const result = syncGeneratedNextEntries([
      entry({ description: 'Passagem', amount: 400, installmentCurrent: 2, installmentTotal: 6 }),
    ])
    const next = result.find((item) => item.cycle === 'next')
    expect(next?.installmentCurrent).toBe(3)
    // Depois da 3ª, restam 3 parcelas de 400.
    expect(next?.remainingAmount).toBe(1_200)
  })

  it('a última parcela não gera uma parcela inexistente', () => {
    const result = syncGeneratedNextEntries([
      entry({ description: 'Fim', installmentCurrent: 6, installmentTotal: 6 }),
    ])
    expect(result.filter((item) => item.cycle === 'next')).toHaveLength(0)
  })

  it('lançamento manual da próxima fatura bloqueia a duplicata', () => {
    const result = syncGeneratedNextEntries([
      entry({ id: 'a', description: 'Netflix', isRecurring: true }),
      entry({ id: 'b', description: 'Netflix', cycle: 'next', amount: 55 }),
    ])
    const next = result.filter((item) => item.cycle === 'next')
    expect(next).toHaveLength(1)
    expect(next[0].amount).toBe(55)
  })

  it('rodar duas vezes não duplica nada', () => {
    const once = syncGeneratedNextEntries([entry({ description: 'Netflix', isRecurring: true })])
    const twice = syncGeneratedNextEntries(once)
    expect(twice.filter((item) => item.cycle === 'next')).toHaveLength(1)
  })
})

describe('buildRemainingInstallmentsAmount', () => {
  it('multiplica o valor pelas parcelas que faltam', () => {
    expect(buildRemainingInstallmentsAmount(400, 2, 6)).toBe(1_600)
  })

  it('sem parcelamento, ou na última, não resta nada', () => {
    expect(buildRemainingInstallmentsAmount(400, undefined, undefined)).toBe(0)
    expect(buildRemainingInstallmentsAmount(400, 6, 6)).toBe(0)
  })
})

describe('parsePaymentDay', () => {
  it('extrai o dia do texto livre antigo', () => {
    expect(parsePaymentDay('05/07')).toBe(5)
    expect(parsePaymentDay('dia 12')).toBe(12)
  })

  it('cai no padrão quando não há dia válido', () => {
    expect(parsePaymentDay(undefined)).toBe(5)
    expect(parsePaymentDay('todo mês')).toBe(5)
    expect(parsePaymentDay('45')).toBe(5)
  })
})

describe('credit card due month settings', () => {
  it('infere o mês de vencimento a partir do texto legado da data', () => {
    expect(inferDueMonthFromPaymentDate('05/09', new Date(2026, 7, 7))).toBe('2026-09')
  })

  it('normaliza configurações antigas incluindo o mês da fatura ativa', () => {
    expect(
      normalizeCreditCardSettings(
        { paymentDate: '05/09', personalSpendingLimit: 2_800 },
        new Date(2026, 7, 7),
      ),
    ).toMatchObject({
      paymentDate: '05/09',
      personalSpendingLimit: 2_800,
      currentDueMonth: '2026-09',
    })
  })

  it('ao pagar a fatura, avança o vencimento ativo para o próximo mês', () => {
    expect(
      advanceCreditCardSettingsCycle({
        paymentDate: '05/09',
        personalSpendingLimit: 2_800,
        currentDueMonth: '2026-09',
      }),
    ).toMatchObject({
      paymentDate: '05/10',
      currentDueMonth: '2026-10',
    })
  })
})

describe('normalizeCardAccount', () => {
  it('limita os dias informados e conserva referências não informadas', () => {
    expect(normalizeCardAccount({ closingDay: 99, dueDay: 0 })).toMatchObject({
      closingDay: 31,
      dueDay: 0,
    })
  })
})

describe('describeCardCycles', () => {
  const accounts = [
    normalizeCardAccount({ id: 'a', name: 'Itaú', closingDay: 30, dueDay: 7 }),
    normalizeCardAccount({ id: 'b', name: 'XP', closingDay: 10, dueDay: 20, limit: 1_000 }),
  ]
  const summary = calculateCreditCardSummary(
    [
      entry({ id: '1', cardName: 'Itaú', amount: 500, personalAmount: 400 }),
      entry({ id: '2', cardName: 'XP', amount: 800, personalAmount: 800 }),
    ],
    settings,
  )

  it('marca como fechada a fatura cujo dia de fechamento já passou', () => {
    // Dia 15: o cartão que fecha no dia 10 já fechou; o que fecha no 30, não.
    const cycles = describeCardCycles(accounts, summary, new Date(2026, 6, 15))
    expect(cycles.find((card) => card.name === 'XP')?.isClosed).toBe(true)
    expect(cycles.find((card) => card.name === 'Itaú')?.isClosed).toBe(false)
  })

  it('liga os totais da fatura ao cartão pelo nome, ignorando acento e caixa', () => {
    const cycles = describeCardCycles(
      [normalizeCardAccount({ id: 'a', name: 'ITAU' })],
      summary,
      new Date(2026, 6, 15),
    )
    expect(cycles[0].personalAmount).toBe(400)
  })

  it('calcula o uso do limite do banco quando informado', () => {
    const cycles = describeCardCycles(accounts, summary, new Date(2026, 6, 15))
    expect(cycles.find((card) => card.name === 'XP')?.usagePct).toBe(80)
    expect(cycles.find((card) => card.name === 'Itaú')?.usagePct).toBeNull()
  })

  it('o vencimento que já passou aponta para o mês seguinte', () => {
    const cycles = describeCardCycles(accounts, summary, new Date(2026, 6, 15))
    // Vencimento dia 7, hoje é 15: faltam 23 dias para 7 de agosto.
    expect(cycles.find((card) => card.name === 'Itaú')?.daysToDue).toBe(23)
  })

  it('cartão sem lançamentos aparece zerado, não ausente', () => {
    const cycles = describeCardCycles(
      [normalizeCardAccount({ id: 'c', name: 'Inter' })],
      summary,
      new Date(2026, 6, 15),
    )
    expect(cycles[0].personalAmount).toBe(0)
  })
})

describe('unregisteredCardNames', () => {
  it('lista os cartões da fatura que não têm cadastro', () => {
    const names = unregisteredCardNames(
      [entry({ id: '1', cardName: 'Itaú' }), entry({ id: '2', cardName: 'Nu' })],
      [normalizeCardAccount({ name: 'Itaú' })],
    )
    expect(names).toEqual(['Nu'])
  })

  it('não repete o mesmo cartão duas vezes', () => {
    const names = unregisteredCardNames(
      [entry({ id: '1', cardName: 'Nu' }), entry({ id: '2', cardName: 'nu' })],
      [],
    )
    expect(names).toHaveLength(1)
  })
})
