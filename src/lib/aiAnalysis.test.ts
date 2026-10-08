// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFinancas } from '../hooks/useFinancas'
import { createDefaultScenario } from './scenario'
import { readRepositoryDocument, writeRepositoryDocument } from '../data/repository'
import { FinancasContext } from '../context/financasStore'
import { AIAnalysisDialog } from '../components/AIAnalysisDialog'
import { analysisMoney, buildFinancialAnalysisPrompt, buildFinancialAnalysisSnapshot } from './aiAnalysis'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => { localStorage.clear() })

function seed(withPaycheck = false) {
  const plan = createDefaultScenario('Operacional')
  plan.salaryNet = 5000; plan.deductions = []; plan.wants = []; plan.plannedInvestmentAmount = 1000
  plan.costs = Array.from({ length: 13 }, (_, index) => ({ id: 'c' + index, name: 'Conta ' + index, value: 100, category: 'outros' as const, paidWith: 'account' as const }))
  writeRepositoryDocument({ schemaVersion: 7, updatedAt: '2026-10-08T12:00:00Z', collections: {
    scenarios: [plan], activeScenarioId: plan.id, activeCycle: { month: '2026-10', salaryHintDay: 30, cardDueHintDay: 5 },
    cardSettings: { currentDueMonth: '2026-10', paymentDate: '', personalSpendingLimit: 1500 },
    cardAccounts: [{ id: 'card', name: 'Cartão', currentDueMonth: '2026-10', closingDay: 0, dueDay: 0, limit: 0 }],
    cardEntries: [{ id: 'purchase', accountId: 'card', cardName: 'Cartão', cycle: 'current', dueMonth: '2026-10', description: 'Compra', purchaseDate: '06/09', amount: 300, personalAmount: 100, remainingAmount: 0 }],
    actuals: [{ month: '2026-10', costs: { c0: 0 }, wants: {}, extraIncome: [{ id: 'extra', name: 'Bônus recebido', amount: 200, sourceEventId: 'bonus', sourceOccurrenceId: 'bonus@2026-10' }], extraExpenses: [], ...(withPaycheck ? { paycheck: { amount: 0, payrollInvestment: 0, employerInvestment: 0 } } : {}) }],
    forecastEvents: [{ id: 'bonus', name: 'Bônus', kind: 'income', month: '2026-10', amount: 500, recurrence: 'once', createdAt: '2026-10-01T12:00:00Z' }],
  } })
}

it('exporta consultas reconciliadas, desconhecidos, zero explícito, terceiros e todas as linhas sem gravar', () => {
  seed()
  const app = renderHook(() => useFinancas())
  const before = JSON.stringify(readRepositoryDocument())
  const snapshot = buildFinancialAnalysisSnapshot(app.result.current)
  const prompt = buildFinancialAnalysisPrompt(snapshot)
  expect(prompt).toContain('Salário líquido confirmado: desconhecido / não informado')
  expect(prompt).toContain('Conta 0 [c0]: plano R$ 100,00; realizado R$ 0,00')
  expect(prompt).toContain('Conta 12 [c12]: plano R$ 100,00; realizado desconhecido / não informado')
  expect(prompt).toContain('banco R$ 300,00; parte pessoal R$ 100,00; parte não pessoal R$ 200,00')
  expect(prompt).toContain('pagamento não confirmado')
  expect(prompt).toContain('realizado conciliado R$ 200,00; restante R$ 300,00')
  expect(prompt).toContain(`Sobra calculada pelo Ciclo: ${analysisMoney(app.result.current.currentCycleFacts.cash.leftover)} (parcial`)
  expect(prompt).toContain(`Disponível antes de alocar Desejos: ${analysisMoney(app.result.current.financialCycle.discretionaryAvailable)}`)
  expect(prompt).toContain('Base sem entradas incertas')
  expect(prompt).toContain('Hipótese com entradas esperadas')
  expect(JSON.stringify(readRepositoryDocument())).toBe(before)
})

it('não transforma salário confirmado em zero em ausência nem próxima fatura desconhecida em zero confirmado', () => {
  seed(true)
  const app = renderHook(() => useFinancas())
  const prompt = buildFinancialAnalysisPrompt(buildFinancialAnalysisSnapshot(app.result.current))
  expect(prompt).toContain('Salário líquido confirmado: R$ 0,00')
  expect(prompt).toContain('Fatura formada pelo ciclo ativo (2026-11): banco desconhecido')
  expect(prompt).toContain('parcial: fatura desconhecida')
  expect(analysisMoney(Number.NaN)).toBe('desconhecido / não informado')
})

it('copia o texto editado, conserva revisão quando fontes mudam e oferece atualização explícita', async () => {
  seed()
  const app = renderHook(() => useFinancas())
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const close = vi.fn()
  const content = () => createElement(FinancasContext.Provider, { value: app.result.current }, createElement(AIAnalysisDialog, { open: true, onClose: close }))
  const dialog = render(content())
  const text = screen.getByRole('textbox', { name: 'Mensagem para análise financeira' })
  fireEvent.change(text, { target: { value: 'Minha revisão: salário desconhecido' } })
  fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
  await act(async () => {})
  expect(writeText).toHaveBeenLastCalledWith('Minha revisão: salário desconhecido')
  expect(open).not.toHaveBeenCalled()
  act(() => app.result.current.actuals.setActual('c1', 50))
  dialog.rerender(content())
  expect(screen.getByText(/As fontes mudaram/)).toBeTruthy()
  expect((text as HTMLTextAreaElement).value).toBe('Minha revisão: salário desconhecido')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar fotografia' }))
  expect((text as HTMLTextAreaElement).value).toContain('Conta 1 [c1]: plano R$ 100,00; realizado R$ 50,00')
  fireEvent.click(screen.getByRole('button', { name: /Abrir no Claude/ }))
  await act(async () => {})
  expect(open).toHaveBeenCalledWith('https://claude.ai/', '_blank', 'noopener,noreferrer')
  expect(writeText).toHaveBeenLastCalledWith((text as HTMLTextAreaElement).value)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
})
