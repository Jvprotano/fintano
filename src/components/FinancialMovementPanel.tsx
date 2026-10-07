import { useState } from 'react'
import { useFinancasStore } from '../context/financasStore'
import { recordMovement, type MovementEndpoint } from '../data/financialMovement'
import { repositoryRevision } from '../data/repositoryCommand'
import { CurrencyInput } from './CurrencyInput'
import { FormField, Panel, PrimaryButton } from './ui'
import { formatCurrency, inputClass } from '../lib/format'
import { ledgerBalance, localDateKey } from '../lib/shared'
import { usableHoldingValue } from '../lib/investments'

export function FinancialMovementPanel() {
  const { investments, debts, activeCycle, scenarios } = useFinancasStore()
  const [kind, setKind] = useState('transfer')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState(0)
  const [cycle, setCycle] = useState({ source: activeCycle.month, selected: activeCycle.month })
  const month = cycle.source === activeCycle.month ? cycle.selected : activeCycle.month
  const [date, setDate] = useState(localDateKey)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const assets = [
    ...investments.holdings.filter((row) => !row.archivedAt).map((row) => ({ key: `holding:${row.id}`, name: `Posição: ${row.name}`, balance: usableHoldingValue(row) })),
    ...investments.goals.filter((row) => !row.archivedAt && row.kind === 'funding').map((row) => ({ key: `goal:${row.id}`, name: `Meta: ${row.name}`, balance: ledgerBalance(row.transactions) })),
  ]
  const liabilities = debts.debts.filter((row) => !row.archivedAt).map((row) => ({ key: `debt:${row.id}`, name: row.name, balance: row.balance, linkedCostId: row.linkedCostId }))
  const targets = kind === 'transfer' ? assets : liabilities
  const endpoint = (key: string): MovementEndpoint => {
    if (key === 'account') return { type: 'account' }
    const separator = key.indexOf(':')
    const type = key.slice(0, separator), id = key.slice(separator + 1)
    return { type: type as 'holding' | 'goal' | 'debt', id }
  }
  const debt = liabilities.find((row) => row.key === destination)
  return <Panel>
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-dark-text">Transferir entre posições ou amortizar dívida</summary>
      <p className="mt-2 text-xs text-dark-text-muted">Uma operação atualiza origem e destino. Resgates para a conta ficam no livro da posição.</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <FormField label="Operação"><select className={inputClass} value={kind} onChange={(e) => { setKind(e.target.value); setDestination(''); setSource(''); setMessage('') }}>
          <option value="transfer">Transferir entre posições</option><option value="amortization">Amortização extraordinária</option><option value="installment">Amortização da parcela já paga</option>
        </select></FormField>
        <FormField label="Origem"><select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Escolha a origem</option>{kind !== 'transfer' && <option value="account">Conta bancária</option>}
          {kind !== 'installment' && assets.map((row) => <option key={row.key} value={row.key}>{row.name} · {formatCurrency(row.balance)}</option>)}
        </select></FormField>
        <FormField label="Destino"><select className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="">Escolha o destino</option>{targets.filter((row) => row.key !== source).map((row) => <option key={row.key} value={row.key}>{row.name} · {formatCurrency(row.balance)}</option>)}
        </select></FormField>
        <FormField label={kind === 'installment' ? 'Principal amortizado (sem juros)' : 'Valor'}><CurrencyInput value={amount} onChange={setAmount} /></FormField>
        <FormField label="Ciclo da movimentação"><input className={inputClass} type="month" value={month} onChange={(e) => setCycle({ source: activeCycle.month, selected: e.target.value })} /></FormField>
        <FormField label="Data real"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
        <FormField label="Observação (opcional)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: transferência para a reserva" /></FormField>
      </div>
      {kind === 'installment' && <p className="mt-2 text-xs text-dark-text-muted">{debt?.linkedCostId ? `Usa o pagamento de ${scenarios.activeScenarioAll.costs.find((row) => row.id === debt.linkedCostId)?.name ?? 'custo vinculado'} confirmado no Ciclo, sem uma segunda saída de caixa.` : 'Vincule a dívida a um custo e confirme o pagamento no Ciclo.'}</p>}
      <PrimaryButton className="mt-3" disabled={!source || !destination || amount <= 0 || kind === 'installment' && !debt?.linkedCostId} onClick={() => {
        const result = recordMovement({ source: endpoint(source), destination: endpoint(destination), amount, month, occurredOn: date, note,
          linkedCostId: kind === 'installment' ? debt?.linkedCostId : undefined }, repositoryRevision())
        setMessage(result.ok ? 'Movimentação registrada.' : result.message)
        if (result.ok) { setAmount(0); setNote('') }
      }}>Registrar movimentação</PrimaryButton>
      {message && <p role="status" className="mt-2 text-xs text-dark-text-secondary">{message}</p>}
    </details>
  </Panel>
}
