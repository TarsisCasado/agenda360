import { NavLink, useLocation } from 'react-router-dom'
import { Sun, CalendarDays, ListTodo, Library, Plus, Search, Sparkles } from 'lucide-react'
import { cx } from '../../lib/utils'
import { useAviso, useAcoes, useProto } from '../store/contexto'
import { Link } from 'react-router-dom'

// ---------------------------------------------------------------------------
// A NAVEGACAO DO 2.0 — quatro destinos e uma capacidade.
//
// HOJE · AGENDA · [+] · TAREFAS · MEMORIA
//
// O [+] nao e um quinto destino: e a captura, disponivel de qualquer lugar.
// No telefone ele fica no centro da barra, onde o polegar chega primeiro; no
// desktop, no topo da lateral, onde o olho comeca.
//
// "Memoria" e nome de trabalho — aparece aqui para ser julgado, nao por estar
// decidido.
// ---------------------------------------------------------------------------
const DESTINOS = [
  { to: '/prototipo/hoje', label: 'Hoje', icon: Sun },
  { to: '/prototipo/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/prototipo/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/prototipo/memoria', label: 'Memória', icon: Library },
]

export default function Shell({ children, onCapturar, onBuscar }) {
  return (
    <div className="min-h-[100dvh] bg-canvas text-primary">
      <Lateral onCapturar={onCapturar} onBuscar={onBuscar} />
      <main className="lg:pl-[228px]">
        <div className="mx-auto w-full max-w-[760px] px-5 pb-32 pt-6 lg:max-w-[860px] lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </div>
      </main>
      <BarraInferior onCapturar={onCapturar} />
      <Aviso />
    </div>
  )
}

function Lateral({ onCapturar, onBuscar }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[228px] flex-col border-r border-hairline bg-surface px-4 py-6 lg:flex">
      <div className="px-2">
        <p className="px-secao">Agenda 360</p>
        <p className="px-serif mt-1 text-[19px] font-semibold leading-tight">2.0</p>
      </div>

      <button
        onClick={onCapturar}
        className="press mt-6 flex items-center gap-2 rounded-control bg-accent px-3.5 py-2.5 text-[13.5px] font-semibold text-white transition hover:opacity-90"
      >
        <Plus size={17} /> Capturar
      </button>
      <button
        onClick={onBuscar}
        className="press mt-2 flex items-center gap-2 rounded-control px-3.5 py-2 text-[13.5px] text-secondary transition hover:bg-surface-2"
      >
        <Search size={16} /> Buscar
      </button>

      <nav className="mt-7 space-y-0.5">
        {DESTINOS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-2.5 rounded-control px-3 py-2 text-[14px] transition',
                isActive
                  ? 'bg-accent-soft font-semibold text-accent-text'
                  : 'text-secondary hover:bg-surface-2',
              )
            }
          >
            <Icon size={17} /> {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-0.5 pt-6">
        <NavLink
          to="/prototipo/copiloto"
          className={({ isActive }) =>
            cx(
              'flex items-center gap-2.5 rounded-control px-3 py-2 text-[13.5px] transition',
              isActive ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted hover:bg-surface-2',
            )
          }
        >
          <Sparkles size={16} /> Copiloto
        </NavLink>
        <NavLink
          to="/prototipo/revisao"
          className={({ isActive }) =>
            cx(
              'flex items-center gap-2.5 rounded-control px-3 py-2 text-[13.5px] transition',
              isActive ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted hover:bg-surface-2',
            )
          }
        >
          <span className="w-4 text-center">◔</span> Revisão
        </NavLink>
        <p className="px-3 pt-4 text-[11px] leading-relaxed text-faint">
          Protótipo · dados fictícios
        </p>
      </div>
    </aside>
  )
}

function BarraInferior({ onCapturar }) {
  const { pathname } = useLocation()
  const item = (to, label, Icon) => {
    const ativo = pathname.startsWith(to)
    return (
      <Link
        key={to}
        to={to}
        className={cx(
          'flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] font-medium transition',
          ativo ? 'text-accent-text' : 'text-muted',
        )}
      >
        <Icon size={20} strokeWidth={ativo ? 2.3 : 1.8} />
        {label}
      </Link>
    )
  }
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-center px-2">
        {item('/prototipo/hoje', 'Hoje', Sun)}
        {item('/prototipo/agenda', 'Agenda', CalendarDays)}
        <button
          onClick={onCapturar}
          aria-label="Capturar"
          className="press mx-1 grid h-12 w-12 flex-none place-items-center rounded-full bg-accent text-white shadow-raised"
        >
          <Plus size={23} />
        </button>
        {item('/prototipo/tarefas', 'Tarefas', ListTodo)}
        {item('/prototipo/memoria', 'Memória', Library)}
      </div>
    </nav>
  )
}

// "Guardado · Por organizar" — informa e some. Nao leva ninguem para lugar
// nenhum; quem quiser ver, clica em "Ver".
function Aviso() {
  const aviso = useAviso()
  const { limparAviso } = useAcoes()
  const { estado } = useProto()
  if (!aviso) return null

  const destino =
    aviso.ver === 'memoria'
      ? `/prototipo/memoria${aviso.verId ? `/${aviso.verId}` : ''}`
      : aviso.ver === 'agenda'
        ? `/prototipo/agenda${aviso.verData ? `?dia=${aviso.verData}` : ''}`
        : aviso.ver === 'tarefas'
          ? `/prototipo/tarefas${aviso.verId ? `/${aviso.verId}` : ''}`
          : null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[74px] z-40 flex justify-center px-5 lg:bottom-6 lg:left-[228px]">
      <div className="px-aviso pointer-events-auto flex items-center gap-3 rounded-full border border-hairline bg-surface px-4 py-2.5 shadow-float">
        <span className="text-[13px] text-primary">{aviso.texto}</span>
        {destino && (
          <Link
            to={destino}
            onClick={limparAviso}
            className="text-[13px] font-semibold text-accent-text hover:underline"
          >
            {aviso.ver === 'agenda' ? 'Ver na agenda' : 'Ver'}
          </Link>
        )}
        <span className="sr-only">{estado.hoje}</span>
      </div>
    </div>
  )
}
