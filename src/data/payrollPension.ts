import type { DeductionItem, MonthlyActuals, LedgerEntry } from '../types'
import { normalizeActuals } from '../lib/actuals'
import { normalizeHolding, type FinancialHolding } from '../lib/investments'
import { ledgerOperationDates, uid } from '../lib/shared'
import type { RepositoryDocument } from './repository'

type Paycheck = NonNullable<MonthlyActuals['paycheck']>
const money = (value: number) => Math.round(value * 100) / 100

function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total > 0 && sum <= 0) throw new Error('Configure a contribuição pessoal e da empresa em Planejar antes de confirmar a folha.')
  let remaining = Math.round(total * 100)
  const last = weights.reduce((last, weight, index) => weight > 0 ? index : last, -1)
  return weights.map((weight, index) => {
    if (weight <= 0) return 0
    const amount = index === last ? remaining : Math.min(remaining, Math.round(total * 100 * weight / (sum || 1)))
    remaining -= amount
    return amount / 100
  })
}

/** Concilia apenas folhas com destinos capturados; folhas antigas não geram aportes retroativos. */
export function syncPayrollPension(document: RepositoryDocument, month: string, paycheck: Paycheck | undefined): void {
  const holdings = (document.collections.investmentHoldings as FinancialHolding[] ?? []).map(normalizeHolding)
  const allocations = paycheck?.pensionAllocations ?? []
  const personal = distribute(paycheck?.payrollInvestment ?? 0, allocations.map((row) => row.personalWeight))
  const employer = distribute(paycheck?.employerInvestment ?? 0, allocations.map((row) => row.employerWeight))
  for (const allocation of allocations) {
    if (!holdings.some((holding) => holding.id === allocation.holdingId)) throw new Error('A posição da previdência não existe mais.')
  }
  document.collections.investmentHoldings = holdings.map((holding) => {
    const old = holding.transactions.filter((tx) => tx.payrollMonth === month)
    const index = allocations.findIndex((row) => row.holdingId === holding.id)
    if (!old.length && index < 0) return holding
    const nextAmounts = index < 0 ? [0, 0] : [personal[index], employer[index]]
    const delta = money(nextAmounts[0] + nextAmounts[1] - old.reduce((sum, tx) => sum + tx.amount, 0))
    const companyDelta = money(nextAmounts[1] - old.filter((tx) => tx.contributor === 'employer').reduce((sum, tx) => sum + tx.amount, 0))
    const marketValue = money(holding.marketValue + delta)
    const pension = holding.pension ?? (holding.marketValue === 0
      ? { employerBalance: 0, employerRestrictedBalance: 0 } : {})
    const employerBalance = pension.employerBalance === undefined ? undefined : money(pension.employerBalance + companyDelta)
    // Reverter não libera a parcela em carência nem permite um saldo negativo.
    const employerRestrictedBalance = pension.employerRestrictedBalance === undefined ? undefined
      : money(pension.employerRestrictedBalance + companyDelta)
    if (marketValue < 0 || employerBalance !== undefined && (employerBalance < 0 || employerBalance > marketValue) ||
      employerRestrictedBalance !== undefined && (employerRestrictedBalance < 0 || employerBalance !== undefined && employerRestrictedBalance > employerBalance)) {
      throw new Error('Confira a divisão atual da previdência por extrato antes de reduzir ou desfazer esta folha.')
    }
    const entries: LedgerEntry[] = (['personal', 'employer'] as const).flatMap((contributor, i) => {
      if (!nextAmounts[i]) return []
      const previous = old.find((tx) => tx.contributor === contributor)
      return [{ ...ledgerOperationDates(), ...previous, id: previous?.id ?? uid(), amount: nextAmounts[i],
        kind: 'contribution', kindSource: 'user', cycleMonth: month, payrollMonth: month, contributor,
        note: contributor === 'personal' ? 'Previdência · desconto em folha' : 'Previdência · aporte da empresa' }]
    })
    return { ...holding, marketValue, pension: { employerBalance, employerRestrictedBalance },
      transactions: [...holding.transactions.filter((tx) => tx.payrollMonth !== month), ...entries] }
  })
}

export function setPaycheckInDocument(document: RepositoryDocument, month: string, value: Paycheck | null, deductions: DeductionItem[]): RepositoryDocument {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || value && [value.amount, value.payrollInvestment, value.employerInvestment].some((amount) =>
    !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)))) throw new Error('Informe valores válidos para a folha.')
  const next = structuredClone(document)
  const months = (next.collections.actuals as MonthlyActuals[] ?? []).map(normalizeActuals)
  const actual = months.find((row) => row.month === month) ?? normalizeActuals({ month })
  const previous = actual.paycheck
  if (previous && !previous.pensionAllocations) actual.payrollPensionLegacy = true
  const paycheck: Paycheck | undefined = value ? { ...value } : undefined
  if (paycheck) {
    if (previous?.pensionAllocations) paycheck.pensionAllocations = previous.pensionAllocations
    else if (!previous && !actual.payrollPensionLegacy) {
      const pensions = deductions.filter((row) => row.type === 'previdencia_privada' && (row.value > 0 || (row.employerContribution ?? 0) > 0))
      const holdings = next.collections.investmentHoldings as FinancialHolding[] ?? []
      const grouped = new Map<string, { holdingId: string; personalWeight: number; employerWeight: number }>()
      for (const row of pensions) {
        const holding = holdings.find((holding) => holding.id === row.linkedHoldingId && !holding.archivedAt && holding.purpose !== 'emergency_fund')
        if (!holding) throw new Error(`Vincule “${row.name}” a uma posição de carteira em Planejar antes de confirmar a folha.`)
        const allocation = grouped.get(holding.id) ?? { holdingId: holding.id, personalWeight: 0, employerWeight: 0 }
        allocation.personalWeight += row.value
        allocation.employerWeight += row.employerContribution ?? 0
        grouped.set(holding.id, allocation)
      }
      paycheck.pensionAllocations = [...grouped.values()]
    }
  }
  if (paycheck?.pensionAllocations || previous?.pensionAllocations) syncPayrollPension(next, month, paycheck)
  if (paycheck) actual.paycheck = paycheck
  else delete actual.paycheck
  next.collections.actuals = [...months.filter((row) => row.month !== month), actual].sort((a, b) => a.month.localeCompare(b.month))
  return next
}
