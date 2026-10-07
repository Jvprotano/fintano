export type BudgetArea = 'necessidades' | 'desejos' | 'investimentos'

export type SalaryInputMode = 'before_payroll_deductions' | 'take_home'

/** Separa a competência do gasto do mês em que o dinheiro sai da conta. */
export type PaymentMethod = 'card' | 'account'

export type LedgerEntryKind =
  | 'opening_balance' | 'contribution' | 'withdrawal'
  | 'transfer_in' | 'transfer_out'
  | 'balance_increase' | 'amortization' | 'adjustment'
export type LedgerKindSource = 'user' | 'legacy_inferred' | 'legacy_ambiguous'

/** Positivo = entrada/aporte; negativo = saída/retirada. */
export interface LedgerEntry {
  id: string
  amount: number
  /** Obrigatório para novos movimentos; ausente apenas em dados legados antes da migração. */
  kind?: LedgerEntryKind
  kindSource?: LedgerKindSource
  /** Ciclo financeiro ao qual a movimentação pertence (AAAA-MM). */
  cycleMonth?: string
  /** Data real da operação, mantida para auditoria e cálculos de retorno. */
  date: string
  /** Instante em que o movimento novo foi registrado; pode faltar nos legados. */
  recordedAt?: string
  operationId?: string
  cashTreatment?: 'extra' | 'planned_cost'
  linkedCostId?: string
  note?: string
}
