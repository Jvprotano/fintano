// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CostAdjustmentControl } from './ActualsPanel'

describe('CostAdjustmentControl', () => {
  it('adiciona um valor e confirma pelo botão compacto', async () => {
    const user = userEvent.setup()
    const onAdjust = vi.fn().mockReturnValue(true)
    render(<CostAdjustmentControl costName="Supermercado" onAdjust={onAdjust} />)

    await user.click(screen.getByRole('button', { name: 'Adicionar valor a Supermercado' }))
    await user.type(screen.getByRole('textbox', { name: 'Valor para adicionar em Supermercado' }), '30000')
    await user.click(
      screen.getByRole('button', { name: 'Confirmar valor para adicionar em Supermercado' }),
    )

    expect(onAdjust).toHaveBeenCalledWith(300)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('subtrai um valor e confirma com Enter', async () => {
    const user = userEvent.setup()
    const onAdjust = vi.fn().mockReturnValue(true)
    render(<CostAdjustmentControl costName="Farmácia" onAdjust={onAdjust} />)

    await user.click(screen.getByRole('button', { name: 'Diminuir valor de Farmácia' }))
    const input = screen.getByRole('textbox', { name: 'Valor para diminuir em Farmácia' })
    await user.type(input, '5050{Enter}')

    expect(onAdjust).toHaveBeenCalledWith(-50.5)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
