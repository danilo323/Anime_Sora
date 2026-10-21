import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useApp } from '../../context/AppContext'

export function Toast() {
  const { toastMsg } = useApp()
  if (!toastMsg) return null
  return (
    <div
      key={toastMsg.key}
      role="status"
      className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[70] max-w-[calc(100%-32px)] -translate-x-1/2 animate-fade rounded-full bg-ink px-5.5 py-3 text-center text-sm text-surface-100 shadow-modal md:bottom-7"
    >
      {toastMsg.message}
    </div>
  )
}

export function SectionHeader({ title, to, action = 'Ver más', children }) {
  return (
    <div className="mt-8 mb-3.5 flex items-baseline justify-between gap-4 md:mt-11 md:mb-[18px]">
      <h2 className="text-[19px] font-semibold md:text-[22px]">{title}</h2>
      {children}
      {to && (
        <Link to={to} className="text-sm font-medium text-link hover:underline">
          {action}
        </Link>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = Heart, message, children }) {
  return (
    <div className="px-5 py-20 text-center text-ink-muted">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-100 text-link">
        <Icon className="size-7" strokeWidth={1.8} />
      </div>
      <p className="mx-auto mt-3.5 mb-5.5 max-w-[380px] leading-relaxed">{message}</p>
      {children}
    </div>
  )
}

export function PageHeader({ title, count, children }) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-3.5 md:gap-10">
        <h1 className="text-[26px] font-semibold tracking-tight md:text-[32px]">{title}</h1>
        {children}
      </div>
      {count != null && <p className="mt-5 mb-[18px] text-[13px] text-ink-muted">{count} títulos</p>}
    </>
  )
}

/** Pestañas subrayadas del diseño (`.tabs`). */
export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`flex gap-[18px] overflow-x-auto no-scrollbar md:gap-[30px] ${className}`}>
      {items.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          id={`tab-${key}`}
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`relative flex-none pt-2 pb-2.5 text-[15px] transition-colors ${
            value === key
              ? "font-medium text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded after:bg-brand-500 after:content-['']"
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
