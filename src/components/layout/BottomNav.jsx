import { NavLink } from 'react-router-dom'
import { Sun, Calendar, ListTodo, Lightbulb, Plus } from 'lucide-react'
import { cx } from '../../lib/utils'

// Bottom nav V2 — 4 areas + Captura central. A IA e transversal (nao ocupa
// aba). O "+" central e o gesto mais usado: destaque visual (circulo de marca
// elevado). Nesta fase o "+" abre a criacao rapida existente (onCreate);
// a Captura Universal com IA vira depois.
const ITEMS = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/dia', label: 'Agenda', icon: Calendar },
]
const ITEMS_RIGHT = [
  { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/ideias', label: 'Ideias', icon: Lightbulb },
]

function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors',
          isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav({ onCreate }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-safe backdrop-blur-lg dark:border-slate-800/80 dark:bg-slate-950/85 lg:hidden">
      <div className="mx-auto flex max-w-lg items-end justify-around px-2">
        {ITEMS.map((it) => <Item key={it.to} {...it} />)}

        {/* Captura central elevada */}
        <div className="flex flex-1 justify-center">
          <button
            onClick={onCreate}
            aria-label="Capturar"
            className="press -mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-white transition-transform dark:ring-slate-950"
          >
            <Plus size={26} />
          </button>
        </div>

        {ITEMS_RIGHT.map((it) => <Item key={it.to} {...it} />)}
      </div>
    </nav>
  )
}
