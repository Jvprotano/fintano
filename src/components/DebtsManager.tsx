import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Home,
  Landmark,
  Plus,
  Scale,
  Trash2,
  TrendingDown,
} from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { LedgerList, LedgerMoveForm } from './Ledger'
import {
  EmptyState,
  Panel,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  StatTile,
  Tag,
} from './ui'
import { formatCurrency, formatMonths, inputClass, selectClass } from '../lib/format'
import { comparePayoffVsInvest } from '../lib/debts'
import { useFinancasStore } from '../context/financasStore'
import type { DebtKind, DebtSummary } from '../types'
import { DEBT_KINDS, DEBT_KIND_COLORS, DEBT_KIND_LABELS } from '../types/constants'

// ---------------------------------------------------------------------------
// Dívidas.
//
// O número que faz a diferença aqui não é o saldo — é quanto da parcela é juro.
// Uma parcela de R$ 2.000 que abate R$ 1.400 e paga R$ 600 de juros conta uma
// história bem diferente da mesma parcela abatendo R$ 1.950.
//
// E a dívida com bem do outro lado é outro animal. O financiamento da casa em
// que você mora não pede "quito ou invisto?": ele substitui um aluguel. Por
// isso ele fica fora da taxa média, do ranking da mais cara e do total de juros
// até quitar — números que existem para decidir o que atacar primeiro.
// ---------------------------------------------------------------------------

/** Quanto da parcela abate o saldo e quanto é só juro. */
function InstallmentSplit({ debt }: { debt: DebtSummary }) {
  if (debt.installment <= 0) return null
  const amortized = Math.max(0, debt.installment - debt.monthlyInterest)
  const interestPct = 100 - debt.amortizationShare * 100

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-dark-text-muted">
          Da parcela de {formatCurrency(debt.installment)}
        </span>
        <span className="tabular-nums text-dark-text-muted">
          {interestPct.toFixed(0)}% é juro
        </span>
      </div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${debt.amortizationShare * 100}%`,
            backgroundColor: 'var(--color-primary-500, #10b981)',
          }}
          title={`Abate o saldo: ${formatCurrency(amortized)}`}
        />
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${interestPct}%`,
            backgroundColor: 'var(--color-rose-500, #f43f5e)',
          }}
          title={`Juros: ${formatCurrency(debt.monthlyInterest)}`}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-dark-text-secondary">
          Abate <strong className="tabular-nums text-dark-text">{formatCurrency(amortized)}</strong>
        </span>
        <span className="text-dark-text-secondary">
          Juros <strong className="tabular-nums text-dark-text">{formatCurrency(debt.monthlyInterest)}</strong>
        </span>
      </div>
    </div>
  )
}

/**
 * A mesma quantia, nos dois destinos possíveis, em 12 meses. É aritmética com a
 * premissa de retorno que o usuário definiu na projeção — não recomendação.
 */
function PayoffComparison({ debt }: { debt: DebtSummary }) {
  const { forecast } = useFinancasStore()
  const [amount, setAmount] = useState(1000)
  const comparison = comparePayoffVsInvest(debt, forecast.assumptions.annualReturnPct, amount)
  const payoffWins = comparison.difference > 0

  return (
    <div className="rounded-lg border border-dark-border bg-dark-input/40 p-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dark-text-muted">
        <Scale size={13} />
        Amortizar ou investir
      </span>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-40">
          <CurrencyInput value={amount} onChange={setAmount} className="!py-1.5" />
        </div>
        <p className="text-xs leading-relaxed text-dark-text-muted sm:flex-1">
          em 12 meses, aqui contra a premissa de {forecast.assumptions.annualReturnPct.toFixed(1)}%
          a.a. da sua projeção
        </p>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Juros economizados</dt>
          <dd className="font-semibold tabular-nums text-dark-text">
            {formatCurrency(comparison.interestSaved)}
          </dd>
          <dd className="text-xs text-dark-text-muted">
            dívida a {comparison.debtAnnualRatePct.toFixed(1)}% a.a.
          </dd>
        </div>
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Rendimento investido</dt>
          <dd className="font-semibold tabular-nums text-dark-text">
            {formatCurrency(comparison.investmentReturn)}
          </dd>
          <dd className="text-xs text-dark-text-muted">
            a {comparison.investmentAnnualRatePct.toFixed(1)}% a.a., antes de imposto
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-xs leading-relaxed text-dark-text-secondary">
        Diferença de{' '}
        <strong className={payoffWins ? 'text-primary-400' : 'text-dark-text'}>
          {formatCurrency(Math.abs(comparison.difference))}
        </strong>{' '}
        a favor de {payoffWins ? 'amortizar' : 'investir'}. A comparação ignora imposto sobre o
        rendimento e a liquidez que você perde ao amortizar.
      </p>
    </div>
  )
}

function DebtRow({ debt }: { debt: DebtSummary }) {
  const { debts, scenarios, assets } = useFinancasStore()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-dark-border/60 bg-dark-surface/40">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: DEBT_KIND_COLORS[debt.kind] }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-dark-text">{debt.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
            {DEBT_KIND_LABELS[debt.kind]}
            <Tag>{debt.annualRatePct.toFixed(1)}% a.a.</Tag>
            {debt.isSecured && (
              <Tag>
                <Home size={10} />
                com bem
              </Tag>
            )}
            {debt.monthsToPayoff !== null && debt.monthsToPayoff > 0 && (
              <span>{formatMonths(debt.monthsToPayoff)} restantes</span>
            )}
            {debt.monthsToPayoff === null && debt.installment > 0 && (
              <span className="text-rose-400">a parcela não cobre os juros</span>
            )}
            {debt.linkedCostMismatch !== null && (
              <span className="flex items-center gap-1 text-amber-300">
                <AlertTriangle size={10} />
                difere do custo fixo
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-dark-text">
            {formatCurrency(debt.balance)}
          </p>
          {debt.installment > 0 && (
            <p className="text-xs tabular-nums text-dark-text-muted">
              {formatCurrency(debt.installment)}/mês
            </p>
          )}
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 text-dark-text-muted transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-dark-border/60 px-3 py-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
              <span className="block text-dark-text-muted">Juros no mês</span>
              <strong className="tabular-nums text-rose-400">
                {formatCurrency(debt.monthlyInterest)}
              </strong>
            </div>
            <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
              <span className="block text-dark-text-muted">Prazo</span>
              <strong className="tabular-nums text-dark-text">
                {debt.monthsToPayoff === null ? '—' : formatMonths(debt.monthsToPayoff)}
              </strong>
            </div>
            {/* Com bem do outro lado, o que importa é quanto dele já é seu —
                não o total de juros de 20 anos, que assusta e não decide nada. */}
            {debt.isSecured ? (
              <>
                <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
                  <span className="block text-dark-text-muted">Já é seu</span>
                  <strong className="tabular-nums text-primary-400">
                    {formatCurrency(debt.equity ?? 0)}
                  </strong>
                </div>
                <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
                  <span className="block text-dark-text-muted">Saldo sobre o bem</span>
                  <strong className="tabular-nums text-dark-text">
                    {debt.ltvPct === null ? '—' : `${debt.ltvPct.toFixed(0)}%`}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
                  <span className="block text-dark-text-muted">Ainda vai pagar</span>
                  <strong className="tabular-nums text-dark-text">
                    {debt.totalRemaining > 0 ? formatCurrency(debt.totalRemaining) : '—'}
                  </strong>
                </div>
                <div className="rounded-md bg-dark-input/60 px-2.5 py-1.5">
                  <span className="block text-dark-text-muted">Só de juros</span>
                  <strong className="tabular-nums text-dark-text">
                    {debt.interestRemaining > 0 ? formatCurrency(debt.interestRemaining) : '—'}
                  </strong>
                </div>
              </>
            )}
          </div>

          <InstallmentSplit debt={debt} />
          {debt.isSecured ? (
            <p className="rounded-lg border border-dark-border bg-dark-input/40 px-3 py-2 text-xs leading-relaxed text-dark-text-secondary">
              Esta dívida tem um bem do outro lado, então ela não entra na conta de "amortizar ou
              investir" — a decisão aqui não é essa, é se vale a pena continuar morando neste
              imóvel. Essa comparação, com aluguel equivalente, está no painel de bens.
            </p>
          ) : (
            <PayoffComparison debt={debt} />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Nome</span>
              <input
                value={debt.name}
                onChange={(event) => debts.updateDebt(debt.id, { name: event.target.value })}
                className={`${inputClass} !py-1.5`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Tipo</span>
              <select
                value={debt.kind}
                onChange={(event) =>
                  debts.updateDebt(debt.id, { kind: event.target.value as DebtKind })
                }
                className={`${selectClass} !py-1.5`}
              >
                {DEBT_KINDS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Saldo devedor (do extrato)
              </span>
              <CurrencyInput
                value={debt.balance}
                onChange={(value) => debts.setDebtBalance(debt.id, value)}
                className="!py-1.5"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Parcela mensal</span>
              <CurrencyInput
                value={debt.installment}
                onChange={(value) => debts.updateDebt(debt.id, { installment: value })}
                className="!py-1.5"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Juros ao mês (%)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="50"
                value={debt.monthlyRatePct}
                onChange={(event) =>
                  debts.updateDebt(debt.id, { monthlyRatePct: Number(event.target.value) })
                }
                className={`${inputClass} !py-1.5 text-right tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Parcelas restantes (0 = estimar)
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={debt.remainingInstallments}
                onChange={(event) =>
                  debts.updateDebt(debt.id, { remainingInstallments: Number(event.target.value) })
                }
                className={`${inputClass} !py-1.5 text-right tabular-nums`}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Custo fixo que já representa esta parcela no orçamento
              </span>
              <select
                value={debt.linkedCostId ?? ''}
                onChange={(event) =>
                  debts.updateDebt(debt.id, { linkedCostId: event.target.value || undefined })
                }
                className={`${selectClass} !py-1.5`}
              >
                <option value="">— nenhum</option>
                {scenarios.costs.map((cost) => (
                  <option key={cost.id} value={cost.id}>
                    {cost.name} — {formatCurrency(cost.value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Bem que esta dívida financia
              </span>
              <select
                value={debt.linkedAssetId ?? ''}
                onChange={(event) =>
                  debts.updateDebt(debt.id, { linkedAssetId: event.target.value || undefined })
                }
                className={`${selectClass} !py-1.5`}
              >
                <option value="">— nenhum</option>
                {assets.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} — {formatCurrency(asset.value)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-dark-text-muted">
                Sem o bem, o app conta o saldo devedor sem contar o que ele comprou.
              </span>
            </label>
          </div>

          {debt.linkedCostMismatch !== null && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-200">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                O custo fixo ligado a esta dívida está{' '}
                {debt.linkedCostMismatch > 0 ? 'acima' : 'abaixo'} da parcela em{' '}
                <strong>{formatCurrency(Math.abs(debt.linkedCostMismatch))}</strong>. Ajuste um dos
                dois para o orçamento e a dívida contarem a mesma história.
              </span>
            </p>
          )}

          <LedgerMoveForm
            onMove={(amount, note) => debts.addDebtTransaction(debt.id, amount, note)}
            inLabel="Amortizar"
            outLabel="Aumentar saldo"
            invert
            disableOut={false}
            notePlaceholder="Nota (opcional) — ex.: amortização com o 13º"
          />

          <LedgerList
            transactions={debt.transactions}
            onRemove={(id) => debts.removeDebtTransaction(debt.id, id)}
            inLabel="Saldo aumentou"
            outLabel="Amortizado"
            invert
          />

          <button
            type="button"
            onClick={() => debts.removeDebt(debt.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-dark-text-muted transition-colors hover:text-rose-400"
          >
            <Trash2 size={13} />
            Excluir dívida
          </button>
        </div>
      )}
    </div>
  )
}

function NewDebtForm({ onClose }: { onClose: () => void }) {
  const { debts, scenarios, assets } = useFinancasStore()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DebtKind>('financiamento')
  const [balance, setBalance] = useState(0)
  const [monthlyRatePct, setMonthlyRatePct] = useState(1)
  const [installment, setInstallment] = useState(0)
  const [remainingInstallments, setRemainingInstallments] = useState(0)
  const [linkedCostId, setLinkedCostId] = useState('')
  const [linkedAssetId, setLinkedAssetId] = useState('')

  const handleAdd = () => {
    if (!name.trim() || balance <= 0) return
    debts.addDebt({
      name,
      kind,
      balance,
      monthlyRatePct,
      installment,
      remainingInstallments,
      linkedCostId: linkedCostId || undefined,
      linkedAssetId: linkedAssetId || undefined,
    })
    onClose()
  }

  const selectedKind = DEBT_KINDS.find((item) => item.key === kind)

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dark-border bg-dark-surface/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Nome</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            placeholder="ex.: Financiamento do apartamento"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Tipo</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as DebtKind)}
            className={selectClass}
          >
            {DEBT_KINDS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {selectedKind && (
            <span className="mt-1 block text-xs text-dark-text-muted">
              Ex: {selectedKind.hint}
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Saldo devedor hoje</span>
          <CurrencyInput value={balance} onChange={setBalance} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Parcela mensal</span>
          <CurrencyInput value={installment} onChange={setInstallment} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Juros ao mês (%)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="50"
            value={monthlyRatePct}
            onChange={(event) => setMonthlyRatePct(Number(event.target.value))}
            className={`${inputClass} text-right tabular-nums`}
          />
          <span className="mt-1 block text-xs text-dark-text-muted">
            {((Math.pow(1 + monthlyRatePct / 100, 12) - 1) * 100).toFixed(1)}% ao ano
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">
            Parcelas restantes (opcional)
          </span>
          <input
            type="number"
            step="1"
            min="0"
            value={remainingInstallments || ''}
            onChange={(event) => setRemainingInstallments(Number(event.target.value))}
            placeholder="deixe vazio para estimar pela taxa"
            className={`${inputClass} text-right tabular-nums`}
          />
        </label>
        {scenarios.costs.length > 0 && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-dark-text-muted">
              Custo fixo que já representa esta parcela (opcional)
            </span>
            <select
              value={linkedCostId}
              onChange={(event) => setLinkedCostId(event.target.value)}
              className={selectClass}
            >
              <option value="">— nenhum</option>
              {scenarios.costs.map((cost) => (
                <option key={cost.id} value={cost.id}>
                  {cost.name} — {formatCurrency(cost.value)}
                </option>
              ))}
            </select>
          </label>
        )}
        {assets.assets.length > 0 && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-dark-text-muted">
              Bem que esta dívida financia (opcional)
            </span>
            <select
              value={linkedAssetId}
              onChange={(event) => setLinkedAssetId(event.target.value)}
              className={selectClass}
            >
              <option value="">— nenhum</option>
              {assets.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} — {formatCurrency(asset.value)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || balance <= 0}>
          <Plus size={15} />
          Adicionar dívida
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </div>
  )
}

export function DebtsManager() {
  const { debts } = useFinancasStore()
  const [showForm, setShowForm] = useState(false)
  const { summary } = debts
  const active = summary.debts.filter((debt) => !debt.isSettled)
  const settled = summary.debts.filter((debt) => debt.isSettled)
  const secured = active.filter((debt) => debt.isSecured)
  const unsecured = active.filter((debt) => !debt.isSecured)
  // Média ponderada e "mais cara" só dizem algo quando há mais de uma dívida
  // sem contrapartida para comparar entre si.
  const showsRanking = summary.unsecured.count > 1

  return (
    <Panel>
      <PanelHeader
        title="Dívidas"
        icon={<TrendingDown size={16} />}
        description="A parcela continua sendo o custo fixo do orçamento; aqui você acompanha o saldo, os juros e o prazo. Uma dívida com bem do outro lado é lida separado: ela comprou alguma coisa."
        actions={
          <>
            {summary.totalBalance > 0 && (
              <span className="text-sm font-semibold tabular-nums text-dark-text">
                {formatCurrency(summary.totalBalance)}
              </span>
            )}
            {!showForm && (
              <SecondaryButton onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Nova dívida
              </SecondaryButton>
            )}
          </>
        }
      />

      {showForm && <NewDebtForm onClose={() => setShowForm(false)} />}

      {summary.totalBalance > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Saldo devedor"
            value={formatCurrency(summary.totalBalance)}
            detail={
              summary.securedBalance > 0
                ? `${formatCurrency(summary.securedBalance)} com bem do outro lado`
                : `${active.length} ${active.length === 1 ? 'dívida' : 'dívidas'} em aberto`
            }
            tone="negative"
          />
          <StatTile
            label="Parcelas por mês"
            value={formatCurrency(summary.totalInstallment)}
            detail="já contabilizadas nos custos fixos"
          />
          <StatTile
            label="Juros por mês"
            value={formatCurrency(summary.totalMonthlyInterest)}
            detail={
              showsRanking
                ? `média de ${summary.unsecured.weightedAnnualRatePct.toFixed(1)}% a.a. nas sem garantia`
                : 'o que sai do bolso sem abater nada'
            }
            tone="negative"
          />
          {/* Sem dívida cara, o quarto tile mostra o que a parcela constrói —
              não o total de juros de um financiamento de 20 anos. */}
          {summary.unsecured.balance > 0 ? (
            <StatTile
              label="Dívida sem contrapartida"
              value={formatCurrency(summary.unsecured.balance)}
              detail={`${formatCurrency(summary.unsecured.interestRemaining)} de juros até quitar`}
              tone="negative"
            />
          ) : (
            <StatTile
              label="Amortizado por mês"
              value={formatCurrency(
                Math.max(0, summary.totalInstallment - summary.totalMonthlyInterest),
              )}
              detail="da parcela, o que vira patrimônio seu"
              tone="positive"
            />
          )}
        </div>
      )}

      <div className="mt-4">
        {summary.debts.length === 0 ? (
          <EmptyState
            icon={<Landmark size={24} />}
            title="Nenhuma dívida cadastrada"
            action={
              !showForm && (
                <PrimaryButton onClick={() => setShowForm(true)}>
                  <Plus size={15} />
                  Cadastrar a primeira
                </PrimaryButton>
              )
            }
          >
            Sem dívidas cadastradas, o app soma só a metade otimista da sua vida financeira.
            Financiamento, consignado, rotativo: cadastre o saldo e a taxa para ver patrimônio
            líquido de verdade e comparar amortizar com investir.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {/* Com os dois tipos na tela, o cabeçalho evita ler o financiamento
                com os olhos de quem está decidindo o que quitar primeiro. */}
            {unsecured.length > 0 && secured.length > 0 && (
              <p className="text-xs font-medium uppercase tracking-wider text-dark-text-muted">
                Sem contrapartida
              </p>
            )}
            {unsecured.map((debt) => (
              <DebtRow key={debt.id} debt={debt} />
            ))}

            {secured.length > 0 && (
              <>
                {unsecured.length > 0 && (
                  <p className="pt-2 text-xs font-medium uppercase tracking-wider text-dark-text-muted">
                    Com bem do outro lado
                  </p>
                )}
                {secured.map((debt) => (
                  <DebtRow key={debt.id} debt={debt} />
                ))}
              </>
            )}

            {settled.length > 0 && (
              <>
                <p className="pt-2 text-xs font-medium uppercase tracking-wider text-dark-text-muted">
                  Quitadas
                </p>
                {settled.map((debt) => (
                  <DebtRow key={debt.id} debt={debt} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showsRanking && summary.unsecured.costliest && (
        <p className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed text-dark-text-muted">
          A dívida mais cara de carregar é{' '}
          <strong className="text-dark-text">{summary.unsecured.costliest.name}</strong>, a{' '}
          {summary.unsecured.costliest.annualRatePct.toFixed(1)}% a.a. — cada real amortizado ali
          economiza mais juros do que em qualquer outra.
        </p>
      )}
    </Panel>
  )
}
