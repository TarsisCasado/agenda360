import { NavLink } from 'react-router-dom'
import { CalendarDays, X } from 'lucide-react'
import { cx } from '../../lib/utils'
import { PRIMARY, SECONDARY } from '../../lib/navigation'

// ---------------------------------------------------------------------------
// DRAWER / navegacao lateral.
//
// As 4 areas do produto ganham peso; o resto vira uma lista secundaria calma.
// Sem moldura de menu administrativo — o item ativo e marcado por SUPERFICIE +
// peso do texto, nao por retangulo colorido.
//
// CP5.2 — de 11 destinos para 9, e a razao nao e "menu menor": e que dois deles
// nao eram DESTINOS, eram RECORTES.
//   "Calendario"      -> visao Mes dentro de Agenda    (mesmo eixo: tempo)
//   "Kanban semanal"  -> visao Semana dentro de Tarefas (mesma base de tarefas)
// Trocar de recorte passou a custar um toque no seletor da propria tela, em vez
// de uma viagem pelo menu. As rotas antigas continuam existindo e redirecionam.
//
// "Assistente" virou "Copiloto" e desceu para Mais: ele e capacidade
// transversal (o + Capturar e a porta principal), nao uma secao administrativa.
//
// pt-safe/pb-safe: sem isso o cabecalho fica sob a status bar do iPhone
// (relogio sobreposto ao logo) — bug visto no QA real.
// ---------------------------------------------------------------------------

function NavItem({ to, label, icon: Icon, end, size = 'md', onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'press flex items-center gap-3 rounded-row transition-colors',
          size === 'md' ? 'px-3 py-2.5 text-[15px]' : 'px-3 py-2 text-[14px]',
          isActive
            ? 'bg-surface-2 font-semibold text-primary'
            : 'font-medium text-secondary active:bg-surface-2/70',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={size === 'md' ? 19 : 17}
            strokeWidth={isActive ? 2.3 : 1.9}
            className={isActive ? 'text-accent' : 'text-muted'}
          />
          {label}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <div
          className="animate-backdrop fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col bg-surface pt-safe transition-transform duration-300 ease-out lg:static lg:w-56 lg:translate-x-0',
          open ? 'translate-x-0 shadow-float lg:shadow-none' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-white">
              <CalendarDays size={17} />
            </span>
            <span className="text-title">Agenda 360</span>
          </div>
          <button onClick={onClose} className="icon-btn lg:hidden" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pt-2">
          {PRIMARY.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onClose} />
          ))}

          <p className="text-section px-3 pb-1 pt-5">Mais</p>
          {SECONDARY.map((item) => (
            <NavItem key={item.to} {...item} size="sm" onNavigate={onClose} />
          ))}
        </nav>

        <div className="px-4 pb-safe pt-3">
          <p className="text-caption pb-3">Agenda 360 · v0.1</p>
        </div>
      </aside>
    </>
  )
}
