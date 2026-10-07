export type ExpectedEventKind = 'income' | 'expense'
export type ExpectedEventRecurrence = 'once' | 'yearly' | 'monthly'
export type EventCashTreatment = 'extra' | 'planned' | 'card'

export type ForecastFactLink =
  | { type: 'cost' | 'want' | 'cash'; id: string; month: string }
  | { type: 'card'; id: string }
  | { type: 'movement'; ownerType: 'holding' | 'goal' | 'debt'; ownerId: string; id: string }

export type ExpectedEventTerms = Pick<ExpectedEvent, 'name' | 'kind' | 'amount' | 'month' | 'date' | 'cashTreatment' | 'cardDueMonth' | 'confirmed' | 'savedPct' | 'goalId' | 'note' | 'planLink'>

export interface ExpectedOccurrenceOverride {
  date?: string
  month?: string
  amount?: number
  cancelled?: boolean
  terms?: ExpectedEventTerms
  links?: ForecastFactLink[]
  /** Efetivação de uma saída já incluída no plano; não cria outra saída de caixa. */
  realizedAmount?: number
  realizedAt?: string
}

export interface ForecastFund {
  id: string
  name: string
  /** Valor reservado informado pelo usuário; não cria caixa ou patrimônio. */
  reservedAmount: number
  /** Meta de aporte que já tem saldo próprio; substitui o valor manual. */
  goalId?: string
}

export interface ExpectedEvent {
  id: string
  name: string
  kind: ExpectedEventKind
  amount: number
  month: string
  /** Ausente em eventos antigos ou quando só o mês é conhecido. */
  date?: string
  recurrence: ExpectedEventRecurrence
  groupId?: string
  cashTreatment?: EventCashTreatment
  /** Mês de pagamento da fatura, quando a cobrança esperada será no cartão. */
  cardDueMonth?: string
  /** Entrada esperada pode ser marcada como confirmada, sem virar caixa realizado. */
  confirmed?: boolean
  cancelled?: boolean
  futureChanges?: Record<string, ExpectedEventTerms>
  /** O mesmo item do plano, em cada ciclo da ocorrência. */
  planLink?: { type: 'cost' | 'want'; id: string }
  occurrenceOverrides?: Record<string, ExpectedOccurrenceOverride>
  savedPct?: number
  goalId?: string
  note?: string
  createdAt: string
}

export interface ExpectedOccurrence {
  id: string
  event: ExpectedEvent
  month: string
  originalMonth: string
  date?: string
  amount: number
  signedAmount: number
  savedAmount: number
  cancelled?: boolean
}

export interface ForecastAssumptions {
  monthlyContribution: number | null
  annualReturnPct: number
  inflationPct: number
  showInRealTerms: boolean
  includeLeftover: boolean
  reinvestFreedInstallments: boolean
  horizonMonths: number
}

export interface ForecastPoint {
  month: string
  assets: number
  properties: number
  debt: number
  securedDebt: number
  netWorth: number
  financialNetWorth: number
  assetsReal: number
  propertiesReal: number
  netWorthReal: number
  financialNetWorthReal: number
  contribution: number
  eventsSaved: number
  /** Valor que o patrimônio financeiro projetado não conseguiu financiar. */
  unfunded: number
  returns: number
  debtPaid: number
  equityBuilt: number
  occurrences: ExpectedOccurrence[]
}
