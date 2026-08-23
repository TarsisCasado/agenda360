import { NavLink } from 'react-router-dom'
import {
  Sun,
  ListTodo,
  Lightbulb,
  Inbox,
  CalendarDays,
  KanbanSquare,
  Calendar,
  Link2,
  Sparkles,
  BarChart3,
  Settings,
  X,
} from 'lucide-react'
import { cx } from '../../lib/utils'

// Areas principais (as 4 do produto) + acessos secundarios preservados.
const PRIMARY = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/ideias', label: 'Ideias', icon: Lightbulb },
  { to: '/dia', label: 'Agenda', icon: CalendarDays },
]
const SECONDARY = [
  { to: '/semana', label: 'Kanban semanal', icon: KanbanSquare },
  { to: '/mes', label: 'Calendario', icon: Calendar },
  { to: '/caixa', label: 'Caixa de Entrada', icon: Inbox },
  { to: '/links', label: 'Central de links', icon: Link2 },
  { to: '/assistente', label: 'Assistente IA', icon: Sparkles },
  { to: '/relatorios', label: 'Relatorios', icon: BarChart3 },
  { to: '/config', label: 'Configuracoes', icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <CalendarDays size={20} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                Agenda 360
              </p>
              <p className="text-[11px] text-slate-400">Inteligente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {PRIMARY.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Mais
          </p>
          {SECONDARY.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4 text-center text-[11px] text-slate-400 dark:border-slate-800">
          Agenda Inteligente 360 · v0.1
        </div>
      </aside>
    </>
  )
}
