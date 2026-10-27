import { NavLink } from 'react-router-dom'
import { Sun, Calendar, ListTodo, Library, Plus } from 'lucide-react'
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
// C2 — o quarto destino passa a ser Memoria. "Ideias" continua existindo como
// tela e como rota; o que muda e o nome do LUGAR no primeiro nivel.
const RIGHT = [
  { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/memoria', label: 'Memória', icon: Library },
]

// ---------------------------------------------------------------------------
// UX1.6 — ACABAMENTO DO ITEM.
//
// Duas mudancas, e so duas: a barra nao muda de destinos nem de ordem.
//
//   1. O ALVO passa a ter altura declarada (48px). Antes ele era o que
//      sobrasse de icone + rotulo + padding — dava perto disso, mas por
//      acidente. Alvo de toque nao deve depender do tamanho da fonte do
//      sistema, que o usuario pode aumentar;
//   2. O ATIVO deixa de ser uma barrinha de 3px encostada na borda superior.
//      Ali ela divide o pixel com o hairline da propria barra e, no iPhone,
//      com o brilho do fundo translucido — some justamente onde precisa ser
//      lida. Agora o icone ativo senta numa pilula suave, que e a mesma
//      gramatica do destino ativo da barra lateral. Um so jeito de dizer
//      "voce esta aqui" no produto inteiro.
// ---------------------------------------------------------------------------
function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'press relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 pb-1 pt-1.5 text-[11px] transition-colors',
          isActive ? 'font-semibold text-accent-text' : 'font-medium text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cx(
              'flex h-[26px] w-[46px] items-center justify-center rounded-full transition-colors',
              isActive && 'bg-accent-soft',
            )}
          >
            <Icon size={20} strokeWidth={isActive ? 2.3 : 1.9} />
          </span>
          <span className="leading-none">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav({ onCreate }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t hair bg-surface/85 pb-safe backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 pt-1">
        {LEFT.map((it) => (
          <Item key={it.to} {...it} />
        ))}

        <div className="flex flex-1 justify-center">
          <button
            onClick={onCreate}
            aria-label="Capturar"
            className="press -mt-7 flex h-[54px] w-[54px] items-center justify-center rounded-[19px] bg-accent text-white shadow-float ring-[5px] ring-canvas"
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
