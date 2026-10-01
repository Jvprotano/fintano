import type { PaymentMethod } from './core'

export type CostCategory =
  | 'moradia'
  | 'contas'
  | 'alimentacao'
  | 'transporte'
  | 'saude'
  | 'educacao'
  | 'lazer'
  | 'dividas'
  | 'outros'

export interface CostItem {
  id: string
  name: string
  value: number
  category: CostCategory
  sharedAmount?: number
  sharedWith?: string
  paidWith?: PaymentMethod
  archivedAt?: string
}

export interface WantItem {
  id: string
  name: string
  plannedAmount: number
  paidWith?: PaymentMethod
  includedInCardPlan?: boolean
  archivedAt?: string
}

export type DeductionType =
  | 'previdencia_privada'
  | 'plano_saude'
  | 'vale_alimentacao'
  | 'vale_transporte'
  | 'seguro_vida'
  | 'outros'

export interface DeductionItem {
  id: string
  name: string
  value: number
  type: DeductionType
  employerContribution?: number
  /** Relação opcional com a posição que guarda o saldo patrimonial acumulado. */
  linkedHoldingId?: string
}

export interface BudgetModel {
  id: string
  name: string
  description: string
  necessidades: number
  desejos: number
  investimentos: number
}

export interface DiversificationSlice {
  id: string
  name: string
  percentage: number
  color: string
}

export interface BudgetBucket {
  target: number
  actual: number
  realized: number
  diff: number
  percentage: number
}
