// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ExtraIncomeEntry } from '../types'
import type { ReconciledOccurrence } from '../lib/forecastCoverage'
import { ActualCashEntries } from './ActualCashEntries'

const expected: ReconciledOccurrence[] = [
  {
    id: 'bonus-1@2026-08',
    month: '2026-08',
    originalMonth: '2026-08',
    amount: 500,
    signedAmount: 500,
    savedAmount: 500,
    paidAmount: 0,
    remainingAmount: 500,
    committedAmount: 0,
    unregisteredAmount: 500,
    overdue: false,
    linked: false,
    status: 'pending',
    event: {
      id: 'bonus-1',
      name: 'Banco de horas',
      kind: 'income',
      amount: 500,
      month: '2026-08',
      recurrence: 'once',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  },
]

function Harness({ withExpected = false }: { withExpected?: boolean }) {
  const [entries, setEntries] = useState<ExtraIncomeEntry[]>([])
  const add = (name: string, amount: number, sourceEventId?: string) => {
    setEntries((current) => {
      if (sourceEventId && current.some((entry) => entry.sourceEventId === sourceEventId)) return current
      return [...current, { id: `entry-${current.length}`, name, amount, sourceEventId }]
    })
    return true
  }

  return (
    <ActualCashEntries
      title="Entradas extras recebidas"
      description="Somente o dinheiro que entrou."
      icon={<span>+</span>}
      tone="income"
      entries={entries}
      expected={withExpected ? expected.filter((item) => !entries.some((entry) => entry.sourceEventId === item.event.id)) : []}
      onAdd={add}
      onUpdate={(id, amount) => setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, amount } : entry))}
      onRemove={(id) => setEntries((current) => current.filter((entry) => entry.id !== id))}
    />
  )
}

describe('ActualCashEntries', () => {
  it('registra uma entrada extra manual', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Freela')
    await user.type(screen.getByRole('textbox', { name: /Valor recebido/ }), '125050')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(screen.getByText('Freela')).toBeTruthy()
    expect(screen.getByDisplayValue('1.250,50')).toBeTruthy()
  })

  it('converte uma previsão em recebida uma única vez', async () => {
    const user = userEvent.setup()
    render(<Harness withExpected />)

    await user.click(screen.getByRole('button', { name: 'Marcar como recebida' }))

    expect(screen.queryByRole('button', { name: 'Marcar como recebida' })).toBeNull()
    expect(screen.getAllByText('Banco de horas')).toHaveLength(1)
    expect(screen.getByText('previsto em Futuro')).toBeTruthy()
  })
})
