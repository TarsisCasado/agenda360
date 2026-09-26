import { useState } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'
import {
  Sun, House, CalendarDays, ListTodo, Library, Plus, Search, Sparkles, Bell,
  PanelLeftClose, PanelLeftOpen, PieChart, CircleDashed, Settings,
} from 'lucide-react'
import { cx } from '../../lib/utils'
import { useAviso, useAcoes, useProto, useTema } from '../store/contexto'
import { naoLidas } from '../store/reducer'

// ---------------------------------------------------------------------------
// A NAVEGACAO DO 2.0 (UX1.2) — QUATRO DESTINOS, E TUDO O MAIS E CAPACIDADE.
//
// A lateral antiga era um menu de MODULOS: Ideias, Links, Inbox, Alertas,
// Delegacao, cada um virando uma tela. Isso empurrava a pessoa a decidir "onde
// isso mora?" antes de decidir "o que eu quero fazer?".
//
// Aqui os DESTINOS organizam o produto — Hoje, Agenda, Tarefas, Memoria — e as
// capacidades atravessam todos eles: capturar, buscar, o Copiloto, criar com
// formulario, notificacoes, delegacao. Nenhuma delas e um lugar.
//
// A hierarquia da lateral diz isso em voz alta:
//
//   ACAO GLOBAL      [+] Criar / Capturar
//   UTILIDADE        Buscar · Notificacoes
//   DESTINOS         Hoje · Agenda · Tarefas · Memoria
//   ASSISTENCIA      Copiloto
//   ACOMPANHAMENTO   Revisao · Relatorios
//   BASE             Perfil / Configuracoes
//
// Recolher a lateral devolve ~150px para a grade da agenda e para o quadro, que
// e onde a largura vale dinheiro. Recolhida, ela continua inteira: os mesmos
// itens, identificados por hover e por foco.
// ---------------------------------------------------------------------------
const DESTINOS = [
  { to: '/prototipo/hoje', label: 'Hoje', icon: Sun },
  { to: '/prototipo/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/prototipo/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/prototipo/memoria', label: 'Memória', icon: Library },
]

const LARGA = 216
const ESTREITA = 62

// `semCabecalhoMovel` (UX-M1): a barra de marca do telefone e util em telas
// que precisam de um titulo de aplicativo, e e peso morto numa HOME — ali ela
// gasta 44px para dizer o nome do produto dentro do proprio produto. O piloto
// do Hoje desenha o proprio topo; as demais telas do prototipo continuam com o
// cabecalho de sempre.
export default function Shell({
  children, largo, semCabecalhoMovel, aoCentral, aoBuscar, aoNotificacoes, aoMenuPessoal,
}) {
  const [recolhida, setRecolhida] = useState(false)
  const { classe } = useTema()
  const largura = recolhida ? ESTREITA : LARGA

  return (
    <div className={cx(classe, 'min-h-[100dvh] bg-canvas text-primary')}>
      <Lateral
        recolhida={recolhida}
        aoAlternar={() => setRecolhida((r) => !r)}
        aoCentral={aoCentral}
        aoBuscar={aoBuscar}
        aoNotificacoes={aoNotificacoes}
      />
      {!semCabecalhoMovel && (
        <CabecalhoMovel
          aoBuscar={aoBuscar}
          aoNotificacoes={aoNotificacoes}
          aoMenuPessoal={aoMenuPessoal}
        />
      )}
      <main style={{ '--px-lateral': `${largura}px` }} className="lg:pl-[var(--px-lateral)]">
        {/* Cada superficie usa o espaco conforme a funcao: a agenda e o quadro
            precisam de largura para representar tempo e fluxo; leitura, nao. */}
        <div className={cx(
          'w-full px-4 pb-28 pt-3 lg:px-7 lg:pb-12 lg:pt-6',
          largo ? 'max-w-[1560px]' : 'mx-auto max-w-[880px]',
        )}>
          {children}
        </div>
      </main>
      <BarraInferior aoCentral={aoCentral} />
      <Aviso />
    </div>
  )
}

// --- lateral do desktop -----------------------------------------------------
function Grupo({ titulo, recolhida, children }) {
  return (
    <div className="mt-4 first:mt-0">
      {recolhida ? (
        <div className="mx-3 mb-1.5 border-t border-hairline" />
      ) : (
        <p className="px-grupo">{titulo}</p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Item({ to, label, icon: Icon, recolhida, onClick, insignia, destaque }) {
  const classes = ({ isActive }) =>
    cx(
      'group relative flex items-center rounded-control py-2 text-[13.5px] transition',
      recolhida ? 'justify-center px-0' : 'gap-2.5 px-3',
      isActive
        ? 'bg-accent-soft font-semibold text-accent-text'
        : destaque
          ? 'text-primary hover:bg-surface-2'
          : 'text-secondary hover:bg-surface-2',
    )

  const conteudo = (
    <>
      <span className="relative flex-none">
        <Icon size={17} />
        {insignia > 0 && (
          <span className={cx(
            'absolute grid place-items-center rounded-full bg-danger text-[9px] font-bold text-white',
            recolhida ? '-right-1.5 -top-1.5 h-3.5 min-w-[14px] px-0.5' : '-right-1.5 -top-1 h-3.5 min-w-[14px] px-0.5',
          )}>
            {insignia}
          </span>
        )}
      </span>
      {!recolhida && <span className="truncate">{label}</span>}
      {/* Recolhida, a identificacao vem no hover e no foco — o item continua
          nomeado, so nao ocupa largura. */}
      {recolhida && (
        <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-[7px] border border-hairline bg-surface px-2 py-1 text-[12px] text-primary shadow-float group-hover:block group-focus-visible:block">
          {label}
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={recolhida ? label : undefined}
        aria-label={label}
        className={classes({ isActive: false })}
      >
        {conteudo}
      </button>
    )
  }
  return (
    <NavLink to={to} title={recolhida ? label : undefined} aria-label={label} className={classes}>
      {conteudo}
    </NavLink>
  )
}

function Lateral({ recolhida, aoAlternar, aoCentral, aoBuscar, aoNotificacoes }) {
  const { estado } = useProto()
  const pendentes = naoLidas(estado).length

  return (
    <aside
      style={{ width: recolhida ? ESTREITA : LARGA }}
      className="fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-hairline bg-surface py-4 transition-[width] duration-200 lg:flex"
    >
      <div className={cx('flex items-center', recolhida ? 'justify-center' : 'justify-between px-3')}>
        {!recolhida && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight">Agenda 360</span>
            <span className="rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-text">2.0</span>
          </span>
        )}
        <button
          type="button"
          onClick={aoAlternar}
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhida}
          className="press grid h-7 w-7 place-items-center rounded-[7px] text-muted transition hover:bg-surface-2 hover:text-primary"
        >
          {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-2">
        {/* AÇÃO GLOBAL — uma porta só. Criar e capturar são a mesma intenção
            vista de dois lados, e separá-las em dois botões obrigava a decidir
            o tipo antes de escrever. */}
        <button
          type="button"
          onClick={aoCentral}
          aria-label="Criar ou capturar"
          className={cx(
            'press flex w-full items-center rounded-control bg-accent text-[13.5px] font-semibold text-white shadow-raised transition hover:brightness-110',
            recolhida ? 'justify-center px-0 py-2.5' : 'gap-2 px-3.5 py-2.5',
          )}
        >
          <Plus size={17} />
          {!recolhida && 'Criar / Capturar'}
        </button>

        <Grupo titulo="Utilidade" recolhida={recolhida}>
          <Item label="Buscar" icon={Search} recolhida={recolhida} onClick={aoBuscar} />
        </Grupo>

        <Grupo titulo="Destinos" recolhida={recolhida}>
          {DESTINOS.map((d) => (
            <Item key={d.to} {...d} recolhida={recolhida} destaque />
          ))}
        </Grupo>

        <Grupo titulo="Assistência" recolhida={recolhida}>
          <Item to="/prototipo/copiloto" label="Copiloto" icon={Sparkles} recolhida={recolhida} />
        </Grupo>

        <Grupo titulo="Acompanhamento" recolhida={recolhida}>
          <Item to="/prototipo/revisao" label="Revisão" icon={CircleDashed} recolhida={recolhida} />
          <Item to="/prototipo/relatorios" label="Relatórios" icon={PieChart} recolhida={recolhida} />
        </Grupo>
      </nav>

      {/* UX1.2.1 — Notificações desceu para junto do perfil. Buscar é o que se
          usa NO meio do trabalho e continua em cima; notificação é sobre o que
          chegou, e mora ao lado de quem sou eu. O contador continua aqui. */}
      <div className="mt-2 space-y-0.5 border-t border-hairline px-2 pt-3">
        <Item label="Notificações" icon={Bell} recolhida={recolhida} onClick={aoNotificacoes} insignia={pendentes} />
        <Item to="/prototipo/config" label="Perfil e configurações" icon={Settings} recolhida={recolhida} />
        {!recolhida && (
          <p className="px-3 pt-3 text-[11px] leading-relaxed text-faint">Protótipo · dados fictícios</p>
        )}
      </div>
    </aside>
  )
}

// --- cabeçalho do telefone ---------------------------------------------------
// Busca, notificações e o menu pessoal precisam existir no telefone sem roubar
// uma vaga da barra inferior — que é dos quatro destinos e do [+].
function CabecalhoMovel({ aoBuscar, aoNotificacoes, aoMenuPessoal }) {
  const { estado } = useProto()
  const pendentes = naoLidas(estado).length
  return (
    <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-hairline bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[14px] font-semibold tracking-tight">Agenda 360</span>
        <span className="rounded-[5px] bg-accent-soft px-1 py-0.5 text-[9.5px] font-semibold text-accent-text">2.0</span>
      </span>
      <button type="button" onClick={aoBuscar} aria-label="Buscar" className="press ml-auto grid h-9 w-9 place-items-center rounded-[9px] text-secondary">
        <Search size={19} />
      </button>
      <button type="button" onClick={aoNotificacoes} aria-label="Notificações" className="press relative grid h-9 w-9 place-items-center rounded-[9px] text-secondary">
        <Bell size={19} />
        {pendentes > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-danger px-0.5 text-[9px] font-bold text-white">
            {pendentes}
          </span>
        )}
      </button>
      <button type="button" onClick={aoMenuPessoal} aria-label="Menu pessoal" className="press ml-0.5">
        <span className="px-pessoa px-pessoa-eu h-8 w-8 text-[11px]">
          {estado.pessoas?.find((p) => p.eu)?.iniciais || 'TC'}
        </span>
      </button>
    </header>
  )
}

// --- barra inferior do telefone ---------------------------------------------
function BarraInferior({ aoCentral }) {
  const { pathname } = useLocation()
  // UX-M2 — a barra da direcao aprovada. Os destinos e a ordem NAO mudam.
  //
  //   . o alvo tem altura declarada (48px) em vez de ser o que sobrar de icone
  //     + rotulo + padding;
  //   . o ativo e violeta e ganha um PONTO sob o rotulo. A pilula do piloto
  //     anterior pintava uma area de fundo que competia com o [+]; o ponto diz
  //     a mesma coisa com um sexto da tinta, e e o que a referencia aprovada
  //     mostra;
  //   . a barra tem cantos superiores suaves e pousa sobre o fundo tonal, em
  //     vez de ser uma faixa cortada por uma linha.
  const item = (to, label, Icon) => {
    const ativo = pathname.startsWith(to)
    return (
      <Link
        key={to}
        to={to}
        aria-current={ativo ? 'page' : undefined}
        className={cx(
          'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-[3px] py-1 text-[11px] font-medium transition',
          ativo ? 'text-accent-text' : 'text-muted',
        )}
      >
        <Icon size={21} strokeWidth={ativo ? 2.2 : 1.8} />
        <span className="leading-none">{label}</span>
        <span className={cx('h-[4px] w-[4px] rounded-full', ativo ? 'bg-accent' : 'bg-transparent')} />
      </Link>
    )
  }
  return (
    <nav className="pb-safe m2-barra fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <div className="mx-auto flex max-w-md items-center px-2 pt-1.5">
        {/* No telefone o Hoje e uma CASA, como na direcao aprovada: a home do
            produto. Na lateral do desktop ele continua sendo o sol — o desktop
            esta congelado neste checkpoint. */}
        {item('/prototipo/hoje', 'Hoje', House)}
        {item('/prototipo/agenda', 'Agenda', CalendarDays)}
        {/* O [+] abre a MESMA central de ação do desktop: um só modelo mental
            nas duas larguras. Dominante por cor e forma, nunca por tamanho —
            52px é o que cabe entre dois destinos sem espremê-los. */}
        <button
          onClick={aoCentral}
          aria-label="Criar ou capturar"
          className="press mx-1 grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-accent text-white shadow-raised"
        >
          <Plus size={24} />
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
