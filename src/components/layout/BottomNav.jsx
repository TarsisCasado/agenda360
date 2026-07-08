import { NavLink } from 'react-router-dom'
import { Sun, KanbanSquare, Calendar, Link2, Sparkles } from 'lucide-react'
import { cx } from '../../lib/utils'

// Menu inferior fixo — visivel apenas no mobile (escondido em lg+).
const ITEMS = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/semana', label: 'Semana', icon: KanbanSquare },
  { to: '/mes', label: 'Calendario', icon: Calendar },
  { to: '/links', label: 'Links', icon: Link2 },
  { to: '/assistente', label: 'IA', icon: Sparkles },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-400 dark:text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-brand-50 dark:bg-brand-900/40',
                  )}
                >
                  <Icon size={20} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
