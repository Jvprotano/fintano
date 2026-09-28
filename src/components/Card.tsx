import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CardProps {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
  collapsible?: boolean
  storageKey?: string
  defaultCollapsed?: boolean
  headerExtra?: ReactNode
}

export function Card({
  title,
  icon,
  children,
  className = '',
  collapsible = false,
  storageKey,
  defaultCollapsed = false,
  headerExtra,
}: CardProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible || !storageKey) return defaultCollapsed
    try {
      const stored = localStorage.getItem(`uf_collapsed_${storageKey}`)
      return stored !== null ? stored === 'true' : defaultCollapsed
    } catch {
      return defaultCollapsed
    }
  })

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    if (storageKey) {
      try {
        localStorage.setItem(`uf_collapsed_${storageKey}`, String(next))
      } catch {
        /* quota exceeded */
      }
    }
  }

  const HeaderTag = collapsible ? 'button' : 'div'

  return (
    <section
      className={`app-panel-shadow overflow-hidden rounded-2xl border border-dark-border/90 bg-dark-card/95 ${className}`}
    >
      <HeaderTag
        {...(collapsible
          ? { type: 'button' as const, onClick: toggleCollapse, 'aria-expanded': !collapsed }
          : {})}
        className={`flex w-full min-w-0 items-center gap-3 px-4 py-4 text-left sm:px-6 ${
          collapsed ? '' : 'border-b border-dark-border-subtle'
        } ${collapsible ? 'select-none transition-colors hover:bg-dark-hover/40' : ''}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.045] bg-white/[0.035] text-dark-text-muted">{icon}</span>
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-dark-text">{title}</h2>
        {headerExtra && (
          <span
            onClick={(event) => event.stopPropagation()}
            className="shrink-0"
            role="presentation"
          >
            {headerExtra}
          </span>
        )}
        {collapsible && (
          <ChevronDown
            size={16}
            className={`shrink-0 text-dark-text-muted transition-transform duration-200 ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        )}
      </HeaderTag>
      {!collapsed && <div className="p-4 sm:p-6">{children}</div>}
    </section>
  )
}
