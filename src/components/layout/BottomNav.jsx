import { NavLink } from 'react-router-dom'
import { Sun, Calendar, ListTodo, Lightbulb, Plus } from 'lucide-react'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// BOTTOM NAV — 4 areas + Captura central.
//
// Refinamentos: barra translucida com blur (o conteudo passa por baixo em vez
// de bater numa faixa opaca), item ativo marcado por um ponto discreto acima
// do rotulo, e o "+" central com anel do proprio canvas (parece recortado na
// barra, nao colado por cima).
// ---------------------------------------------------------------------------
const LEFT = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/dia', label: 'Agenda', icon: Calendar },
]
const RIGHT = [
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
          'press relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] transition-colors',
          isActive ? 'font-semibold text-accent' : 'font-medium text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
          {label}
          <span
            className={cx(
              'absolute -top-px h-[3px] w-6 rounded-full transition-opacity',
              isActive ? 'bg-accent opacity-100' : 'opacity-0',
            )}
          />
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav({ onCreate }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t hair bg-surface/85 pb-safe backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-end justify-around px-1">
        {LEFT.map((it) => (
          <Item key={it.to} {...it} />
        ))}

        <div className="flex flex-1 justify-center">
          <button
            onClick={onCreate}
            aria-label="Capturar"
            className="press -mt-6 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-accent text-white shadow-float ring-[5px] ring-canvas"
          >
            <Plus size={25} strokeWidth={2.4} />
          </button>
        </div>

        {RIGHT.map((it) => (
          <Item key={it.to} {...it} />
        ))}
      </div>
    </nav>
  )
}
