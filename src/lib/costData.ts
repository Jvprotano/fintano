import type { CostCategory, CostItem, FinanceScenario, MonthlyActuals, MonthlySnapshot } from '../types'
import type { MonthlyPlan } from './monthlyPlans'

export type CostDataCategory = CostCategory | 'unclassified'

export interface CostDataItem {
  id: string
  name: string
  category: CostDataCategory
  amount: number
}

export interface CostDataCycle {
  month: string
  closed: boolean
  categories: Partial<Record<CostDataCategory, number>>
  items: CostDataItem[]
}

const money = (value: number) => Math.round(value * 100) / 100

/** Consulta somente leitura: fechamento por categoria e pagamentos explícitos por custo.
 * O plano serve apenas para identificar os itens, nunca para estimar pagamentos.
 */
export function buildCostDataCycles(
  actuals: MonthlyActuals[],
  snapshots: MonthlySnapshot[],
  plans: MonthlyPlan[],
  templates: FinanceScenario[],
): CostDataCycle[] {
  const actualByMonth = new Map(actuals.map((row) => [row.month, row]))
  const snapshotByMonth = new Map(snapshots.map((row) => [row.month, row]))
  const planByMonth = new Map(plans.map((row) => [row.month, row]))
  const known = new Map<string, CostItem>([
    ...templates.flatMap((row) => row.costs),
    ...[...plans].sort((a, b) => a.month.localeCompare(b.month)).flatMap((row) => row.costs),
  ].map((cost) => [cost.id, cost]))
  const months = [...new Set([...actualByMonth.keys(), ...snapshotByMonth.keys()])].sort()

  return months.map((month) => {
    const snapshot = snapshotByMonth.get(month)
    const plan = planByMonth.get(month)
    const catalog = plan?.costs ?? templates.find((row) => row.id === snapshot?.scenarioId)?.costs ?? []
    const byId = new Map(catalog.map((cost) => [cost.id, cost]))
    const items = Object.entries(actualByMonth.get(month)?.costs ?? {}).map(([id, amount]) => {
      const cost = byId.get(id) ?? known.get(id)
      return { id, name: cost?.name ?? 'Custo sem cadastro', category: cost?.category ?? 'unclassified', amount }
    }) satisfies CostDataItem[]
    const categories: CostDataCycle['categories'] = snapshot ? { ...snapshot.costsByCategory } : {}
    if (!snapshot) for (const item of items) {
      categories[item.category] = money((categories[item.category] ?? 0) + item.amount)
    }
    return { month, closed: !!snapshot, categories, items }
  }).filter((row) => row.closed || row.items.length > 0)
}
