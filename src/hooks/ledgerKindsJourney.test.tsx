// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { repositoryToBackupV8 } from '../data/backupV7'
import { readRepositoryDocument } from '../data/repository'
import { calculateMonthlyInvestmentActuals } from '../lib/investmentActuals'
import { useDebts } from './useDebts'
import { useInvestments } from './useInvestments'

describe('movimentos com tipo e competência explícitos', () => {
  beforeEach(() => localStorage.clear())

  it('abre saldo anterior e registra aporte do ciclo mesmo com data real em outro mês', () => {
    const hook = renderHook(() => useInvestments(0, {}, '2026-09'))
    act(() => {
      expect(hook.result.current.addHolding({ name: 'CDB anterior', assetClassId: 'renda-fixa',
        initialAmount: 100, initialKind: 'opening_balance', occurredOn: '2026-08-20' })).toBe(true)
      expect(hook.result.current.addHolding({ name: 'CDB novo', assetClassId: 'renda-fixa',
        initialAmount: 200, initialKind: 'contribution', initialCycleMonth: '2026-09',
        occurredOn: '2026-08-21', note: 'Aporte inicial' })).toBe(true)
    })
    const initial = hook.result.current.holdings
    expect(initial.map((item) => item.transactions[0].kind)).toEqual(['opening_balance', 'contribution'])
    expect(initial.map((item) => item.transactions[0].cycleMonth)).toEqual(['2026-09', '2026-09'])
    expect(initial[1].transactions[0]).toMatchObject({ date: '2026-08-21T12:00:00.000Z',
      note: 'Aporte inicial', kindSource: 'user' })
    expect(initial[1].transactions[0].recordedAt).toBeTruthy()
    const actual = () => calculateMonthlyInvestmentActuals({ month: '2026-09',
      emergencyFund: hook.result.current.emergencyFund,
      holdings: hook.result.current.holdings, goals: hook.result.current.goals })
    expect(actual()).toMatchObject({ directNet: 200, openingBalance: 100 })
    expect(hook.result.current.summary.financialAssets).toBe(300)
    const id = initial[1].id
    const transactionId = initial[1].transactions[0].id
    act(() => hook.result.current.setHoldingTransactionCycle(id, transactionId, '2026-10'))
    expect(actual().directNet).toBe(0)
    expect(hook.result.current.holdings[1].transactions[0].date).toBe('2026-08-21T12:00:00.000Z')
    const backup = repositoryToBackupV8(readRepositoryDocument())
    expect(backup.investments.ledgerEntries.find((item) => item.id === transactionId))
      .toMatchObject({ kind: 'contribution', competenceMonth: '2026-10',
        occurredAt: '2026-08-21T12:00:00.000Z', recordedAt: initial[1].transactions[0].recordedAt })
    hook.unmount()
  })

  it('tipa amortização e mantém data real ao mudar competência', () => {
    const hook = renderHook(() => useDebts([], [], '2026-09'))
    act(() => expect(hook.result.current.addDebt({ name: 'Empréstimo', kind: 'emprestimo',
      balance: 1000, monthlyRatePct: 1, installment: 100 })).toBe(true))
    const id = hook.result.current.debts[0].id
    act(() => expect(hook.result.current.addDebtTransaction(id, -100, 'Parcela', '2026-09', '2026-08-25')).toBe(true))
    const tx = hook.result.current.debts[0].transactions[0]
    expect(tx).toMatchObject({ amount: -100, kind: 'amortization', kindSource: 'user',
      cycleMonth: '2026-09', date: '2026-08-25T12:00:00.000Z' })
    act(() => expect(hook.result.current.setDebtTransactionCycle(id, tx.id, '2026-10')).toBe(true))
    expect(hook.result.current.debts[0].transactions[0]).toMatchObject({
      cycleMonth: '2026-10', date: tx.date, recordedAt: tx.recordedAt,
    })
    hook.unmount()
  })
})
