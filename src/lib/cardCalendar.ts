import type { CreditCardAccount } from '../types'
import { addMonths } from './shared'

/** Ausência mantém o calendário anterior: vencimento no mês seguinte ao ciclo. */
export const cardDueMonthOffset = (account: Pick<CreditCardAccount, 'dueMonthOffset'>) => account.dueMonthOffset ?? 1
export const cardDueMonthForCycle = (account: Pick<CreditCardAccount, 'dueMonthOffset'>, cycleMonth: string) => addMonths(cycleMonth, cardDueMonthOffset(account))
export const cardCycleForDueMonth = (account: Pick<CreditCardAccount, 'dueMonthOffset'>, dueMonth: string) => addMonths(dueMonth, -cardDueMonthOffset(account))
