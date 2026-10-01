import { useState } from 'react'
import { ChevronDown, Home, Plus, Scale, Trash2 } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { EmptyState, Meter, Panel, PanelHeader, PrimaryButton, SecondaryButton, StatTile, Tag } from './ui'
import { formatCurrency, inputClass, selectClass } from '../lib/format'
import { defaultAppreciationFor, housingComparison } from '../lib/assets'
import { useFinancasStore } from '../context/financasStore'
import type { AssetKind, AssetSummary } from '../types'
import { ASSET_KINDS, ASSET_KIND_COLORS, ASSET_KIND_LABELS, CHART_PALETTE } from '../types/constants'

// ---------------------------------------------------------------------------
// Bens.
//
// A pergunta que este painel responde não é "quanto vale minha casa" — é "o que
// eu de fato pago para morar nela". A parcela inteira não é despesa: a
// amortização é dinheiro trocando de bolso. O que sai da sua vida todo mês é o
// juro, menos o que o bem valoriza. É esse número que se compara com aluguel.
// ---------------------------------------------------------------------------

/** Quanto do bem já é seu, contra o quanto ainda é do banco. */
function EquityBar({ asset }: { asset: AssetSummary }) {
  if (!asset.hasDebt || asset.value <= 0) return null

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-dark-text-muted">Quanto já é seu</span>
        <span className="tabular-nums text-dark-text-muted">
          {Math.max(0, asset.equityPct).toFixed(0)}%
        </span>
      </div>
      <Meter
        value={Math.max(0, asset.equity)}
        max={asset.value}
        color={ASSET_KIND_COLORS[asset.kind]}
        height={8}
        overIsBad={false}
      />
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-dark-text-secondary">
          Seu <strong className="tabular-nums text-dark-text">{formatCurrency(asset.equity)}</strong>
        </span>
        <span className="text-dark-text-secondary">
          Do banco{' '}
          <strong className="tabular-nums text-dark-text">{formatCurrency(asset.linkedDebt)}</strong>
        </span>
      </div>
    </div>
  )
}

/**
 * Comprar contra alugar, este mês. Sem a amortização, que não é despesa: ela
 * apenas muda de lugar, da conta corrente para dentro do imóvel.
 */
function OwnVsRent({ asset }: { asset: AssetSummary }) {
  const comparison = housingComparison(asset)
  if (!comparison) return null
  const ownWins = comparison.difference < 0

  return (
    <div className="rounded-lg border border-dark-border bg-dark-input/40 p-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dark-text-muted">
        <Scale size={13} />
        Ser dono ou alugar
      </span>

      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Juros do mês</dt>
          <dd className="font-semibold tabular-nums text-rose-400">
            {formatCurrency(comparison.monthlyInterest)}
          </dd>
          <dd className="text-xs text-dark-text-muted">a despesa de verdade</dd>
        </div>
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Valorização</dt>
          <dd className="font-semibold tabular-nums text-primary-400">
            {formatCurrency(comparison.monthlyAppreciation)}
          </dd>
          <dd className="text-xs text-dark-text-muted">
            {asset.annualAppreciationPct.toFixed(1)}% a.a. estimados
          </dd>
        </div>
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Custo de ser dono</dt>
          <dd className="font-semibold tabular-nums text-dark-text">
            {formatCurrency(comparison.ownershipCost)}
          </dd>
          <dd className="text-xs text-dark-text-muted">juros − valorização</dd>
        </div>
        <div className="rounded-md bg-dark-surface px-2.5 py-1.5">
          <dt className="text-dark-text-muted">Aluguel equivalente</dt>
          <dd className="font-semibold tabular-nums text-dark-text">
            {formatCurrency(comparison.rentEquivalent)}
          </dd>
          <dd className="text-xs text-dark-text-muted">informado por você</dd>
        </div>
      </dl>

      <p className="mt-2 text-xs leading-relaxed text-dark-text-secondary">
        Ser dono sai{' '}
        <strong className={ownWins ? 'text-primary-400' : 'text-amber-300'}>
          {formatCurrency(Math.abs(comparison.difference))} {ownWins ? 'mais barato' : 'mais caro'}
        </strong>{' '}
        que alugar, por mês. Os outros {formatCurrency(comparison.amortization)} da parcela não são
        custo: viram patrimônio seu. A conta ignora IPTU, condomínio e manutenção, que existem nos
        dois cenários em proporções diferentes.
      </p>

      {/* A valorização é a premissa mais frágil da conta. Quando é ela que
          decide o resultado, o número merece a ressalva. */}
      {comparison.monthlyAppreciation > comparison.monthlyInterest / 2 && (
        <p className="mt-1.5 text-xs leading-relaxed text-amber-200">
          Boa parte dessa vantagem vem da valorização de {asset.annualAppreciationPct.toFixed(1)}% ao
          ano, que é uma premissa sua, não um fato. Sem ela, o custo de ser dono seria{' '}
          {formatCurrency(comparison.monthlyInterest)} por mês.
        </p>
      )}
    </div>
  )
}

function AssetRow({ asset }: { asset: AssetSummary }) {
  const { assets, debts } = useFinancasStore()
  const [expanded, setExpanded] = useState(false)
  const linkedDebts = debts.summary.debts.filter((debt) => debt.linkedAssetId === asset.id)

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
          style={{ backgroundColor: ASSET_KIND_COLORS[asset.kind] }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-dark-text">{asset.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-dark-text-muted">
            {ASSET_KIND_LABELS[asset.kind]}
            <Tag>
              {asset.annualAppreciationPct >= 0 ? '+' : ''}
              {asset.annualAppreciationPct.toFixed(1)}% a.a.
            </Tag>
            {asset.hasDebt && <span>financiado · {formatCurrency(asset.linkedDebt)} a pagar</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-dark-text">
            {formatCurrency(asset.value)}
          </p>
          {asset.hasDebt && (
            <p className="text-xs tabular-nums text-dark-text-muted">
              {formatCurrency(asset.equity)} seus
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
          <EquityBar asset={asset} />
          <OwnVsRent asset={asset} />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Nome</span>
              <input
                value={asset.name}
                onChange={(event) => assets.updateAsset(asset.id, { name: event.target.value })}
                className={`${inputClass} !py-1.5`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">Tipo</span>
              <select
                value={asset.kind}
                onChange={(event) =>
                  assets.updateAsset(asset.id, { kind: event.target.value as AssetKind })
                }
                className={`${selectClass} !py-1.5`}
              >
                {ASSET_KINDS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Valor de mercado hoje
              </span>
              <CurrencyInput
                value={asset.value}
                onChange={(value) => assets.setAssetValue(asset.id, value)}
                className="!py-1.5"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dark-text-muted">
                Aluguel equivalente (opcional)
              </span>
              <CurrencyInput
                value={asset.rentEquivalent ?? 0}
                onChange={(value) => assets.updateAsset(asset.id, { rentEquivalent: value })}
                className="!py-1.5"
              />
              <span className="mt-1 block text-xs text-dark-text-muted">
                O que custaria alugar um equivalente — habilita a comparação acima.
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 flex items-baseline justify-between text-xs text-dark-text-muted">
                <span>Valorização esperada</span>
                <strong className="tabular-nums text-dark-text">
                  {asset.annualAppreciationPct >= 0 ? '+' : ''}
                  {asset.annualAppreciationPct.toFixed(1)}% a.a.
                </strong>
              </span>
              <input
                type="range"
                min={-20}
                max={20}
                step={0.5}
                value={asset.annualAppreciationPct}
                onChange={(event) =>
                  assets.updateAsset(asset.id, {
                    annualAppreciationPct: Number(event.target.value),
                  })
                }
                className="mt-1 w-full accent-primary-500"
              />
            </label>
          </div>

          {linkedDebts.length > 0 ? (
            <p className="text-xs leading-relaxed text-dark-text-muted">
              Financiado por{' '}
              <strong className="text-dark-text">
                {linkedDebts.map((debt) => debt.name).join(', ')}
              </strong>
              . A parcela continua saindo do orçamento como custo fixo — aqui ela só aparece
              separada entre juro e patrimônio.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-amber-200">
              Nenhuma dívida aponta para este bem. Se ele é financiado, ligue os dois no painel de
              dívidas: sem isso o app conta o saldo devedor sem a contrapartida.
            </p>
          )}

          <button
            type="button"
            onClick={() => assets.removeAsset(asset.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-dark-text-muted transition-colors hover:text-rose-400"
          >
            <Trash2 size={13} />
            Excluir bem
          </button>
        </div>
      )}
    </div>
  )
}

function NewAssetForm({ onClose }: { onClose: () => void }) {
  const { assets } = useFinancasStore()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AssetKind>('imovel')
  const [value, setValue] = useState(0)
  const [rentEquivalent, setRentEquivalent] = useState(0)
  const [appreciation, setAppreciation] = useState(defaultAppreciationFor('imovel'))

  const selectKind = (next: AssetKind) => {
    setKind(next)
    setAppreciation(defaultAppreciationFor(next))
  }

  const handleAdd = () => {
    if (!name.trim() || value <= 0) return
    if (assets.addAsset({
      name,
      kind,
      value,
      annualAppreciationPct: appreciation,
      rentEquivalent: rentEquivalent || undefined,
    })) onClose()
  }

  const selected = ASSET_KINDS.find((item) => item.key === kind)

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
            placeholder="ex.: Apartamento onde moro"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Tipo</span>
          <select
            value={kind}
            onChange={(event) => selectKind(event.target.value as AssetKind)}
            className={selectClass}
          >
            {ASSET_KINDS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {selected && (
            <span className="mt-1 block text-xs text-dark-text-muted">Ex: {selected.hint}</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">Valor de mercado hoje</span>
          <CurrencyInput value={value} onChange={setValue} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-dark-text-muted">
            Aluguel equivalente (opcional)
          </span>
          <CurrencyInput value={rentEquivalent} onChange={setRentEquivalent} />
          <span className="mt-1 block text-xs text-dark-text-muted">
            Quanto custaria alugar um igual — é o que transforma o financiamento em decisão.
          </span>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 flex items-baseline justify-between text-xs text-dark-text-muted">
            <span>Valorização esperada</span>
            <strong className="tabular-nums text-dark-text">
              {appreciation >= 0 ? '+' : ''}
              {appreciation.toFixed(1)}% a.a.
            </strong>
          </span>
          <input
            type="range"
            min={-20}
            max={20}
            step={0.5}
            value={appreciation}
            onChange={(event) => setAppreciation(Number(event.target.value))}
            className="mt-1 w-full accent-primary-500"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || value <= 0}>
          <Plus size={15} />
          Adicionar bem
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </div>
  )
}

export function AssetsManager() {
  const { assets, debts } = useFinancasStore()
  const [showForm, setShowForm] = useState(false)
  const { summary } = assets
  const orphanSecuredDebts = debts.summary.debts.filter(
    (debt) => !debt.isSettled && debt.kind === 'financiamento' && !debt.isSecured,
  )

  return (
    <Panel>
      <PanelHeader
        title="Bens"
        icon={<Home size={16} />}
        description="A casa, o carro. Não se rebalanceiam nem pagam a conta do mês, então ficam fora da alocação — mas sem eles um financiamento vira um buraco no balanço."
        actions={
          <>
            {summary.totalValue > 0 && (
              <span className="text-sm font-semibold tabular-nums text-dark-text">
                {formatCurrency(summary.totalValue)}
              </span>
            )}
            {!showForm && (
              <SecondaryButton onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Novo bem
              </SecondaryButton>
            )}
          </>
        }
      />

      {showForm && <NewAssetForm onClose={() => setShowForm(false)} />}

      {orphanSecuredDebts.length > 0 && (
        <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-200">
          Você tem {orphanSecuredDebts.length === 1 ? 'um financiamento' : 'financiamentos'} sem bem
          cadastrado ({orphanSecuredDebts.map((debt) => debt.name).join(', ')}). Enquanto o bem não
          existir, o app soma o saldo devedor sem somar o que ele comprou — e o patrimônio líquido
          fica artificialmente negativo.
        </p>
      )}

      {summary.totalValue > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          <StatTile label="Valor de mercado" value={formatCurrency(summary.totalValue)} />
          <StatTile
            label="Financiado"
            value={formatCurrency(summary.totalLinkedDebt)}
            detail="saldo devedor ligado a estes bens"
            tone={summary.totalLinkedDebt > 0 ? 'negative' : 'neutral'}
          />
          <StatTile
            label="Já é seu"
            value={formatCurrency(summary.totalEquity)}
            detail={
              summary.totalValue > 0
                ? `${((summary.totalEquity / summary.totalValue) * 100).toFixed(0)}% do valor`
                : undefined
            }
            tone="accent"
          />
        </div>
      )}

      <div className="mt-4">
        {summary.assets.length === 0 ? (
          <EmptyState
            icon={<Home size={24} />}
            title="Nenhum bem cadastrado"
            action={
              !showForm && (
                <PrimaryButton onClick={() => setShowForm(true)}>
                  <Plus size={15} />
                  Cadastrar o primeiro
                </PrimaryButton>
              )
            }
          >
            Se você financiou um imóvel, cadastre-o aqui e ligue o financiamento a ele. Sem isso o
            balanço conta só a dívida: você aparece devendo o apartamento inteiro sem nunca tê-lo
            comprado.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {summary.assets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>

      {summary.assets.length > 0 && summary.totalLinkedDebt > 0 && (
        <p
          className="mt-3 border-t border-dark-border-subtle pt-3 text-xs leading-relaxed"
          style={{ color: CHART_PALETTE.muted }}
        >
          A parcela de um bem financiado já é custo fixo do orçamento. Nada aqui é cobrado de novo:
          este painel só mostra o que aquela parcela está comprando.
        </p>
      )}
    </Panel>
  )
}
