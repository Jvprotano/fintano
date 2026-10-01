// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CardEntryForm } from './CardEntryForm'

describe('CardEntryForm', () => {
  it('mantém Pessoa/Obs para o lançamento seguinte', () => {
    const onAdd = vi.fn().mockReturnValue(true)
    const { container } = render(<CardEntryForm cycle="current" knownCards={['Itaú']} onAdd={onAdd} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrição da nova compra' }), { target: { value: 'Primeira compra' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Pessoa ou observação' }), { target: { value: 'Ana' } })
    fireEvent.change(container.querySelector('input[placeholder="0,00"]')!, { target: { value: '10000' } })
    fireEvent.submit(container.querySelector('form')!)

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ ownerNote: 'Ana', description: 'Primeira compra' }))
    expect(screen.getByRole('textbox', { name: 'Pessoa ou observação' })).toHaveProperty('value', 'Ana')
    expect(screen.getByRole('textbox', { name: 'Descrição da nova compra' })).toHaveProperty('value', '')
  })

  it('preserva o rascunho quando o navegador recusa a gravação', () => {
    const { container } = render(<CardEntryForm cycle="current" knownCards={['Itaú']} onAdd={() => false} />)
    const description = container.querySelector('input[aria-label="Descrição da nova compra"]')!
    fireEvent.change(description, { target: { value: 'Compra pendente' } })
    fireEvent.change(container.querySelector('input[placeholder="0,00"]')!, { target: { value: '10000' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(description).toHaveProperty('value', 'Compra pendente')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível salvar')
  })
})
