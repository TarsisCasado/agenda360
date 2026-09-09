import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { CalendarDays, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cx } from '../../lib/utils'
import { PRIMARY, SECONDARY } from '../../lib/navigation'
import { lerRecolhida, guardarRecolhida } from '../../lib/sidebarPref'

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
//
// -------------------- CP5.10: RECOLHIVEL NO DESKTOP ------------------------
//
// A barra custa 224px o tempo todo, inclusive para quem ja decorou os quatro
// destinos ha meses. Recolhida ela vira um RAIL de 72px: os mesmos destinos, na
// mesma ordem, na mesma hierarquia — so sem os rotulos, que passam a aparecer
// como balao no hover E no foco.
//
// Tres decisoes:
//
//   1. O BREAKPOINT E `lg`, e nao um novo. `lg` (1024px) ja e onde o drawer
//      vira barra fixa e onde a Topbar troca de forma. Inventar um segundo
//      limiar so para isto criaria uma faixa de larguras com duas gramaticas de
//      navegacao ao mesmo tempo. Abaixo de `lg` nada muda: drawer + barra
//      inferior, exatamente como aprovado;
//   2. O ROTULO SOME, NAO ENCOLHE. Recolhido, o texto nao e renderizado — nao
//      existe meio-rotulo, nem reticencia, nem texto espremido durante a
//      animacao, porque nao ha texto para espremer. So a largura anima;
//   3. `prefers-reduced-motion` ja e global (ver index.css), entao a transicao
//      se anula sozinha para quem pediu menos movimento.
// ---------------------------------------------------------------------------

function NavItem({ to, label, icon: Icon, end, size = 'md', onNavigate, recolhida }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      // Recolhida, o nome do destino nao esta escrito na tela: quem le por voz
      // precisa dele no elemento.
      aria-label={recolhida ? label : undefined}
      className={({ isActive }) =>
        cx(
          'press group relative flex items-center rounded-row transition-colors',
          recolhida ? 'justify-center px-0 py-2.5' : 'gap-3',
          !recolhida && (size === 'md' ? 'px-3 py-2.5 text-[15px]' : 'px-3 py-2 text-[14px]'),
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
          {recolhida ? <span className="rail-tip">{label}</span> : label}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  // Lida no PRIMEIRO render, nao num efeito: assim a barra ja pinta na largura
  // certa. Num efeito, ela apareceria expandida por um quadro e encolheria — o
  // flash que denuncia que o estado guardado chegou tarde.
  const [recolhida, setRecolhida] = useState(lerRecolhida)

  const alternar = () => {
    setRecolhida((v) => {
      guardarRecolhida(!v)
      return !v
    })
  }

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
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col bg-surface pt-safe',
          'transition-transform duration-300 ease-out lg:static lg:translate-x-0',
          // A largura so anima no desktop; o drawer do mobile continua
          // deslizando por transform, como sempre.
          'lg:transition-[width] lg:duration-200',
          recolhida ? 'lg:w-[4.5rem]' : 'lg:w-56',
          open ? 'translate-x-0 shadow-float lg:shadow-none' : '-translate-x-full',
        )}
        data-testid="sidebar"
        data-recolhida={recolhida ? 'sim' : 'nao'}
      >
        <div
          className={cx(
            'flex items-center px-4 pb-2 pt-4',
            recolhida ? 'lg:justify-center lg:px-0' : 'justify-between',
          )}
        >
          {/* Recolhida, a marca fica so no simbolo: o nome por extenso seria
              exatamente o "titulo cortado" que este checkpoint quer evitar. */}
          <div className={cx('flex items-center gap-2.5', recolhida && 'lg:gap-0')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-white">
              <CalendarDays size={17} />
            </span>
            <span className={cx('text-title', recolhida && 'lg:hidden')}>Agenda 360</span>
          </div>
          <button onClick={onClose} className="icon-btn lg:hidden" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        {/* `overflow-y-auto` recorta tudo o que sai da caixa, inclusive na
            horizontal — e o balao do rail vive fora dela, a 8px da borda
            direita. Com rolagem ligada ele existia, tinha opacidade 1 e era
            invisivel: cortado. Recolhida a barra nao precisa rolar (nove icones
            cabem de sobra), entao a rolagem sai e o balao aparece. */}
        <nav
          className={cx(
            'flex-1 space-y-1 pt-2',
            recolhida ? 'lg:overflow-visible lg:px-2 overflow-y-auto' : 'overflow-y-auto px-2',
          )}
        >
          {PRIMARY.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onClose} recolhida={recolhida} />
          ))}

          {/* A hierarquia primario/secundario nao se perde no rail: o titulo
              "Mais" e texto e sai, entao a separacao passa a ser uma linha. */}
          {recolhida ? (
            <div className="mx-2 my-3 border-t hair" aria-hidden />
          ) : (
            <p className="text-section px-3 pb-1 pt-5">Mais</p>
          )}
          {SECONDARY.map((item) => (
            <NavItem key={item.to} {...item} size="sm" onNavigate={onClose} recolhida={recolhida} />
          ))}
        </nav>

        {/* O controle mora no rodape da propria barra, nos DOIS estados: nao e
            uma aba flutuando sobre o conteudo, e nao muda de lugar quando o
            estado muda — so de icone e de rotulo. */}
        <div className={cx('hidden pb-safe pt-3 lg:block', recolhida ? 'px-2' : 'px-4')}>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!recolhida}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            data-testid="alternar-sidebar"
            className={cx(
              'press group relative flex min-h-[40px] items-center rounded-row text-secondary transition-colors hover:bg-surface-2',
              recolhida ? 'w-full justify-center' : 'w-full gap-3 px-3',
            )}
          >
            {recolhida ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {recolhida ? (
              <span className="rail-tip">Expandir menu</span>
            ) : (
              <span className="text-[14px] font-medium">Recolher</span>
            )}
          </button>
          <p className={cx('text-caption pt-3', recolhida && 'hidden')}>Agenda 360 · v0.1</p>
        </div>

        {/* No mobile o rodape continua sendo so a versao (o controle e desktop). */}
        <div className="px-4 pb-safe pt-3 lg:hidden">
          <p className="text-caption pb-3">Agenda 360 · v0.1</p>
        </div>
      </aside>
    </>
  )
}
