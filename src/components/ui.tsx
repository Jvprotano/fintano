import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { formatCurrency, formatCurrencyShort } from '../lib/format'

// ---------------------------------------------------------------------------
// Peças visuais compartilhadas por todos os módulos.
//
// Regras do sistema:
//  · superfícies neutras — cor é reservada para estado semântico e séries;
//  · texto sempre em token de tinta, nunca na cor da série;
//  · marcações finas, extremidades arredondadas, 2px de respiro entre segmentos;
//  · números em tabular-nums.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Contêineres
// ---------------------------------------------------------------------------

/** Bloco de conteúdo. É a moldura padrão de tudo que não é um card colapsável. */
export function Panel({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={`app-panel-shadow min-w-0 rounded-2xl border border-dark-border/90 bg-dark-card/95 ${padded ? 'p-4 sm:p-6' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

/** Cabeçalho de seção: ícone, título, ações à direita. */
export function PanelHeader({
  title,
  icon,
  actions,
  description,
  className = '',
}: {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-start gap-3 ${className}`}>
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.045] bg-white/[0.035] text-dark-text-muted shadow-inner shadow-white/[0.02]">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="text-base font-semibold tracking-tight text-dark-text">{title}</h3>
        {description && (
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-dark-text-secondary">{description}</p>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex min-w-0 items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:pl-11">
          {actions}
        </div>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-dark-border bg-dark-input/25 px-5 py-8 text-center shadow-inner shadow-black/10 sm:py-10">
      {icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-dark-border-subtle bg-dark-surface text-dark-text-muted/70">
          {icon}
        </span>
      )}
      <strong className="text-sm font-semibold text-dark-text">{title}</strong>
      {children && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-dark-text-secondary">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Campo com rótulo persistente; placeholder fica reservado a exemplo ou formato. */
export function FormField({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="app-form-label mb-1.5 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-dark-text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Gráficos parte-de-um-todo
// ---------------------------------------------------------------------------

export interface Segment {
  id: string
  label: string
  value: number
  color: string
}

/** Barra empilhada horizontal com legenda de rótulos diretos. */
export function SegmentedBar({
  segments,
  total,
  height = 10,
}: {
  segments: Segment[]
  /** Base da barra; segmentos além dela são truncados, abaixo dela sobra trilho. */
  total?: number
  height?: number
}) {
  const visible = segments.filter((s) => s.value > 0)
  const sum = visible.reduce((acc, s) => acc + s.value, 0)
  const base = total && total > 0 ? Math.max(total, sum) : sum

  if (base <= 0) return null

  return (
    <div>
      <div
        className="flex w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.06]"
        style={{ height }}
        role="img"
        aria-label={visible.map((s) => `${s.label}: ${formatCurrency(s.value)}`).join(', ')}
      >
        {visible.map((s) => (
          <div
            key={s.id}
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${(s.value / base) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${formatCurrency(s.value)}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-dark-text-secondary">{s.label}</span>
            <span className="font-medium tabular-nums text-dark-text">
              {formatCurrency(s.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Composição parte-de-um-todo com rótulos diretos e centro informativo. */
export function DonutChart({
  segments,
  total,
  centerLabel,
  centerValue,
}: {
  segments: Segment[]
  total?: number
  centerLabel: string
  centerValue: string
}) {
  const visible = segments.filter((segment) => segment.value > 0)
  const sum = visible.reduce((acc, segment) => acc + segment.value, 0)
  const base = total && total > 0 ? Math.max(total, sum) : sum
  const chart = visible.reduce(
    (result, segment) => {
      const end = result.cursor + (base > 0 ? (segment.value / base) * 100 : 0)
      return {
        cursor: end,
        stops: [...result.stops, `${segment.color} ${result.cursor}% ${end}%`],
      }
    },
    { cursor: 0, stops: [] as string[] },
  )
  const stops =
    chart.cursor < 100
      ? [...chart.stops, `rgba(255,255,255,0.06) ${chart.cursor}% 100%`]
      : chart.stops

  if (base <= 0) return null

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div
        className="relative mx-auto h-40 w-40 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        role="img"
        aria-label={visible
          .map(
            (segment) =>
              `${segment.label}: ${formatCurrency(segment.value)} (${((segment.value / base) * 100).toFixed(0)}%)`,
          )
          .join(', ')}
      >
        <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full border border-dark-border-subtle bg-dark-card px-3 text-center shadow-inner shadow-black/25">
          <span className="text-xs font-medium uppercase tracking-wide text-dark-text-muted">
            {centerLabel}
          </span>
          <strong className="mt-1 text-base font-semibold tabular-nums text-dark-text">
            {centerValue}
          </strong>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        {visible.map((segment) => (
          <div key={segment.id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-dark-text-secondary">
              {segment.label}
            </span>
            <span className="shrink-0 tabular-nums text-dark-text-muted">
              {((segment.value / base) * 100).toFixed(0)}%
            </span>
            <strong className="w-24 shrink-0 text-right font-semibold tabular-nums text-dark-text">
              {formatCurrency(segment.value)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Medidor de progresso sobre um trilho.
 *
 * `overIsBad` distingue os dois usos: estourar uma meta de gasto é ruim (vermelho),
 * passar do alvo da reserva ou de um objetivo é bom — nesse caso a barra apenas
 * enche até o fim e mantém a cor.
 */
export function Meter({
  value,
  max,
  color,
  height = 6,
  overIsBad = true,
}: {
  value: number
  max: number
  color: string
  height?: number
  overIsBad?: boolean
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const over = pct > 100 && overIsBad

  return (
    <div className="w-full overflow-hidden rounded-full bg-white/[0.06]" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          backgroundColor: over ? 'var(--color-rose-500, #f43f5e)' : color,
        }}
      />
    </div>
  )
}

/**
 * Medidor com um marcador de meta sobre o trilho — mostra planejado e realizado
 * na mesma linha sem precisar de dois gráficos.
 */
export function MeterWithMarker({
  value,
  marker,
  max,
  color,
  markerLabel,
  height = 8,
}: {
  value: number
  marker: number
  max: number
  color: string
  markerLabel?: string
  height?: number
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const markerPct = max > 0 ? Math.min(100, (marker / max) * 100) : 0
  const over = max > 0 && value > max

  return (
    <div className="relative w-full overflow-hidden rounded-full bg-white/[0.06]" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${pct}%`,
          backgroundColor: over ? 'var(--color-rose-500, #f43f5e)' : color,
        }}
      />
      {marker > 0 && markerPct < 100 && (
        <span
          className="absolute top-0 h-full w-[2px] bg-dark-text/70"
          style={{ left: `calc(${markerPct}% - 1px)` }}
          title={markerLabel}
        />
      )}
    </div>
  )
}

/** Linha de barra horizontal com rótulo direto — para rankings de magnitude. */
export function BarRow({
  label,
  value,
  max,
  color,
  sublabel,
}: {
  label: string
  value: number
  max: number
  color: string
  sublabel?: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-dark-text-secondary">
          {label}
          {sublabel && <span className="ml-1.5 text-dark-text-muted">{sublabel}</span>}
        </span>
        <span className="shrink-0 font-medium tabular-nums text-dark-text">
          {formatCurrency(value)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Série temporal
// ---------------------------------------------------------------------------

export interface TrendSeries {
  id: string
  label: string
  color: string
  values: number[]
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

/**
 * Gráfico de linhas com eixo único, grade recessiva, rótulo direto no último
 * ponto e camada de hover (crosshair + tooltip). Uma série dispensa legenda —
 * o título já a nomeia.
 */
export function TrendChart({
  labels,
  series,
  height = 200,
}: {
  labels: string[]
  series: TrendSeries[]
  height?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const padding = { top: 16, right: 64, bottom: 26, left: 8 }
  const plotWidth = Math.max(0, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom

  // Escala colada nos dados, não em zero: patrimônio que vai de 51k a 54k vira
  // uma reta se o eixo começar do zero. Sem preenchimento de área justamente
  // porque área com base fora do zero exagera a variação — os rótulos do eixo
  // mostram os valores absolutos.
  const allValues = series.flatMap((s) => s.values)
  const rawMax = allValues.length ? Math.max(...allValues) : 0
  const rawMin = allValues.length ? Math.min(...allValues) : 0
  const span = rawMax - rawMin || Math.abs(rawMax) || 1
  const max = rawMax + span * 0.12
  const min = Math.max(0, rawMin - span * 0.18)

  const xAt = (index: number) =>
    padding.left + (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth)
  const yAt = (value: number) =>
    padding.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight

  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (plotWidth <= 0 || labels.length === 0) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - bounds.left - padding.left
      const ratio = Math.max(0, Math.min(1, x / plotWidth))
      setHoverIndex(Math.round(ratio * (labels.length - 1)))
    },
    [labels.length, padding.left, plotWidth],
  )

  // Com muitos meses os rótulos do eixo colidem: mostra um a cada n.
  const labelStep = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotWidth / 56))))
  const gridLines = 4

  return (
    <div>
      <div
        ref={ref}
        className="relative select-none"
        style={{ height }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
            {Array.from({ length: gridLines + 1 }, (_, i) => {
              const value = min + ((max - min) / gridLines) * i
              const y = yAt(value)
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    x2={padding.left + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth={1}
                    className="text-white/[0.05]"
                  />
                  <text
                    x={padding.left + plotWidth + 8}
                    y={y + 3}
                    className="fill-dark-text-muted text-[10px] tabular-nums"
                  >
                    {formatCurrencyShort(value)}
                  </text>
                </g>
              )
            })}

            {series.map((s) => {
              const points = s.values.map((value, index) => `${xAt(index)},${yAt(value)}`)
              return (
                <g key={s.id}>
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {s.values.length === 1 && (
                    <circle cx={xAt(0)} cy={yAt(s.values[0])} r={4} fill={s.color} />
                  )}
                </g>
              )
            })}

            {hoverIndex !== null && (
              <g>
                <line
                  x1={xAt(hoverIndex)}
                  x2={xAt(hoverIndex)}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-dark-text-muted"
                />
                {series.map((s) => (
                  <circle
                    key={s.id}
                    cx={xAt(hoverIndex)}
                    cy={yAt(s.values[hoverIndex] ?? 0)}
                    r={4.5}
                    fill={s.color}
                    stroke="var(--color-dark-card)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            {labels.map((label, index) =>
              index % labelStep === 0 || index === labels.length - 1 ? (
                <text
                  key={label + index}
                  x={xAt(index)}
                  y={height - 8}
                  textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
                  className="fill-dark-text-muted text-[10px]"
                >
                  {label}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {hoverIndex !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-dark-border bg-dark-surface/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur"
            style={{
              left: Math.min(Math.max(xAt(hoverIndex) - 70, 0), Math.max(0, width - 150)),
            }}
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-dark-text-muted">
              {labels[hoverIndex]}
            </span>
            {series.map((s) => (
              <span key={s.id} className="mt-1 flex items-center gap-1.5 text-xs">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-dark-text-secondary">{s.label}</span>
                <span className="font-medium tabular-nums text-dark-text">
                  {formatCurrency(s.values[hoverIndex] ?? 0)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-dark-text-secondary">{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blocos de valor
// ---------------------------------------------------------------------------

/** Tile de estatística: rótulo, valor e detalhe — sem moldura colorida. */
export function StatTile({
  label,
  value,
  detail,
  tone = 'neutral',
  className = '',
}: {
  label: string
  value: string
  detail?: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'caution' | 'negative' | 'accent'
  className?: string
}) {
  const valueClass = {
    neutral: 'text-dark-text',
    positive: 'text-primary-400',
    warning: 'text-amber-300',
    caution: 'text-orange-300',
    negative: 'text-rose-400',
    accent: 'text-primary-400',
  }[tone]
  const surfaceClass = {
    neutral: 'border-dark-border/90 bg-dark-card/95',
    positive: 'border-primary-500/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.075),rgba(16,185,129,0.018)_58%,transparent)]',
    warning: 'border-amber-500/20 bg-[linear-gradient(145deg,rgba(245,158,11,0.07),rgba(245,158,11,0.015)_58%,transparent)]',
    caution: 'border-orange-500/20 bg-[linear-gradient(145deg,rgba(249,115,22,0.07),rgba(249,115,22,0.015)_58%,transparent)]',
    negative: 'border-rose-500/20 bg-[linear-gradient(145deg,rgba(244,63,94,0.07),rgba(244,63,94,0.015)_58%,transparent)]',
    accent: 'border-primary-500/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.075),rgba(16,185,129,0.018)_58%,transparent)]',
  }[tone]

  return (
    <div className={`app-panel-shadow relative overflow-hidden rounded-2xl border px-4 py-3.5 ${surfaceClass} ${className}`}>
      <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <span className="block text-xs font-medium uppercase tracking-wide text-dark-text-secondary">
        {label}
      </span>
      <strong
        className={`mt-2 block break-words text-[clamp(1.3rem,4.6vw,1.65rem)] font-semibold leading-tight tracking-[-0.03em] tabular-nums ${valueClass}`}
      >
        {value}
      </strong>
      {detail && <span className="mt-1 block text-xs leading-relaxed text-dark-text-secondary">{detail}</span>}
    </div>
  )
}

/** Valor com sinal e cor de ganho/perda. */
export function GainLabel({
  gain,
  pct,
  className = '',
}: {
  gain: number
  pct: number | null
  className?: string
}) {
  const positive = gain >= 0
  return (
    <span className={`tabular-nums ${positive ? 'text-primary-400' : 'text-rose-400'} ${className}`}>
      {positive ? '+' : '−'} {formatCurrency(Math.abs(gain))}
      {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-primary-400/20 bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(5,150,105,0.18)] transition-[background-color,transform,box-shadow] hover:-translate-y-px hover:bg-primary-500 hover:shadow-[0_10px_28px_rgba(5,150,105,0.24)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'neutral' | 'danger'
  className?: string
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-dark-border text-dark-text-secondary hover:border-rose-500/40 hover:bg-rose-500/[0.06] hover:text-rose-300'
      : 'border-dark-border text-dark-text-secondary hover:border-dark-text-muted/50 hover:bg-dark-hover hover:text-dark-text'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border bg-dark-surface/80 px-3.5 py-2 text-sm font-medium shadow-sm shadow-black/10 transition-[background-color,border-color,color,transform] hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${toneClass} ${className}`}
    >
      {children}
    </button>
  )
}

/** Chip de sugestão. */
export function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 rounded-full border border-dark-border bg-dark-surface/80 px-3 py-1.5 text-xs text-dark-text-secondary shadow-sm shadow-black/10 transition-colors hover:border-primary-500/50 hover:bg-primary-500/[0.05] hover:text-primary-300"
    >
      + {label}
    </button>
  )
}

/** Etiqueta estática — identidade, não ação. */
export function Tag({
  children,
  color,
  className = '',
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.045] bg-dark-input/85 px-2 py-0.5 text-xs font-medium text-dark-text-secondary shadow-sm shadow-black/10 ${className}`}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  )
}

/** Grupo de botões mutuamente exclusivos. `boolean` cobre os pares tipo nominal/real. */
export function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
  className = '',
  columnsClassName = '',
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** Permite quebra responsiva, por exemplo `grid-cols-3 sm:grid-cols-6`. */
  columnsClassName?: string
}) {
  return (
    <div
      className={`grid gap-1 rounded-xl border border-dark-border/90 bg-dark-input/80 p-1.5 shadow-inner shadow-black/15 ${columnsClassName} ${className}`}
      style={columnsClassName ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`min-h-9 rounded-lg border px-2 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow] ${
            value === option.value
              ? 'border-white/[0.055] bg-dark-surface text-dark-text shadow-sm shadow-black/25'
              : 'border-transparent text-dark-text-muted hover:bg-white/[0.025] hover:text-dark-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Confirmação em duas etapas, sem window.confirm. */
export function ConfirmButton({
  children,
  confirmLabel = 'Confirmar',
  onConfirm,
  tone = 'danger',
  className = '',
}: {
  children: ReactNode
  confirmLabel?: ReactNode
  onConfirm: () => void
  tone?: 'danger' | 'primary'
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(timer)
  }, [armed])

  if (!armed) {
    return (
      <SecondaryButton
        onClick={() => setArmed(true)}
        tone={tone === 'danger' ? 'danger' : 'neutral'}
        className={className}
      >
        {children}
      </SecondaryButton>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          onConfirm()
          setArmed(false)
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors ${
          tone === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-primary-600 hover:bg-primary-500'
        }`}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-lg px-2 py-2 text-sm text-dark-text-muted transition-colors hover:text-dark-text"
      >
        Cancelar
      </button>
    </span>
  )
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  hideCancel = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  hideCancel?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => confirmRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="app-panel-shadow w-full max-w-md rounded-2xl border border-dark-border bg-dark-card p-5 shadow-2xl shadow-black/50"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-dark-text">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm leading-relaxed text-dark-text-secondary">
          {description}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {!hideCancel && <SecondaryButton onClick={onClose}>{cancelLabel}</SecondaryButton>}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              onClose()
              onConfirm()
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-card ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 focus:ring-rose-400'
                : 'bg-primary-600 hover:bg-primary-500 focus:ring-primary-400'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
