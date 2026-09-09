import { memo, useState } from 'react'
import { Bell, Repeat2, UserRound, MoreHorizontal, Check } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import MoveSheet from './MoveSheet'
import { boardDateLabel, FLOW_COLUMNS } from '../../lib/board'
import { STATUS } from '../../lib/constants'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// CARTAO DO QUADRO — compacto de proposito.
//
// O TaskCard existente e um cartao de LEITURA: mostra descricao, badge de
// status, badge de categoria, badge de prioridade, chip de link, chip de
// lembrete e uma barra de cinco acoes. Num quadro de quatro colunas isso vira
// uma parede — dez cartoes desses nao se leem, se decifram. Este e um cartao de
// TRABALHO, e a regra e outra: mostrar o que muda a decisao, calar o resto.
//
// A hierarquia, na ordem exata em que o olho precisa dela:
//   1. titulo — sempre, e INTEIRO ate tres linhas: titulo cortado nao
//      identifica a tarefa, e um cartao 12px mais alto custa menos que isso;
//   2. estado temporal — "Ontem", "Hoje", "Sex, 04/09". Na coluna "Sem data"
//      nao aparece nada: a coluna ja disse;
//   3. prioridade — SO quando e alta ou urgente, e como um ponto de 5px antes
//      do titulo. Media e baixa sao silencio: a maioria e media, e pintar a
//      maioria e nao pintar nada;
//   4. categoria — ponto na cor da categoria + nome, 11px;
//   5. indicadores — lembrete, delegacao, reagendamentos. Tres, no maximo, e
//      so icone.
//
// ATRASO tem o tratamento mais forte do cartao (trilho esquerdo em `danger` +
// rotulo em `danger`) porque e a unica informacao que pede acao HOJE. Se tudo
// gritasse, nada gritaria.
// ---------------------------------------------------------------------------

const TONE_CLASS = {
  danger: 'text-danger font-semibold',
  accent: 'text-accent-text font-semibold',
  muted: 'text-muted',
}

const PRIORITY_DOT = {
  urgent: { class: 'bg-danger', label: 'Prioridade urgente' },
  high: { class: 'bg-warning', label: 'Prioridade alta' },
}

function BoardCard({ task, columnKey, today, onOpen, onMove, dragging = false }) {
  const { categoryById } = useData()
  const isDesktop = useIsDesktop()
  const [menuOpen, setMenuOpen] = useState(false)
  useEscapeKey(menuOpen && isDesktop, () => setMenuOpen(false))

  const label = columnKey === 'sem_data' ? null : boardDateLabel(task, today)
  const atrasada = label?.tone === 'danger'
  const done = task.status === STATUS.DONE
  const category = categoryById?.(task.category_id)
  const prio = PRIORITY_DOT[task.priority]

  const onDragStart = (e) => {
    e.dataTransfer.setData('text/task-id', task.id)
    e.dataTransfer.setData('text/plain', task.title)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable={isDesktop}
      onDragStart={isDesktop ? onDragStart : undefined}
      data-testid="board-card"
      data-task-id={task.id}
      className={cx(
        'group relative rounded-control bg-board-card ring-1 ring-hairline/45 transition-[opacity,box-shadow] lg:min-h-0 lg:cursor-grab lg:active:cursor-grabbing',
        dragging ? 'opacity-35' : 'hover:shadow-raised',
        // Concluida ja aconteceu: continua legivel, para de competir.
        done && !dragging && 'opacity-60',
      )}
    >
      {/* Trilho de atraso: 2px, na borda, sem consumir espaco do conteudo. */}
      {atrasada && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-danger"
        />
      )}

      <button
        type="button"
        onClick={() => onOpen?.(task)}
        className="block min-h-[44px] w-full rounded-control py-2 pl-2.5 pr-12 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 lg:min-h-0 lg:pr-2.5"
      >
        <span className="flex items-start gap-1.5">
          {prio && !done && (
            <span
              title={prio.label}
              aria-label={prio.label}
              className={cx('mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full', prio.class)}
            />
          )}
          {done && <Check size={12} className="mt-[3px] shrink-0 text-positive" aria-hidden />}
          <span
            className={cx(
              'line-clamp-3 text-[13px] font-medium leading-snug [overflow-wrap:anywhere]',
              done ? 'text-muted' : 'text-primary',
              // 8px a mais quando ha trilho, para o texto nao encostar nele.
              atrasada && 'pl-1',
            )}
          >
            {task.title}
          </span>
        </span>

        {(label ||
          (!done &&
            (category ||
              task.start_time ||
              task.alert_enabled ||
              task.status === STATUS.DELEGATED ||
              task.reschedule_count > 0))) && (
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-none">
            {label && <span className={TONE_CLASS[label.tone]}>{label.text}</span>}
            {task.start_time && !done && (
              <span className="tabular-nums text-muted">{task.start_time.slice(0, 5)}</span>
            )}
            {category && !done && (
              <span className="inline-flex items-center gap-1 text-muted">
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                {category.name}
              </span>
            )}
            {task.alert_enabled && !done && (
              <Bell size={11} className="text-muted" aria-label="Com lembrete" />
            )}
            {task.status === STATUS.DELEGATED && (
              <UserRound size={11} className="text-muted" aria-label="Delegada" />
            )}
            {task.reschedule_count > 0 && !done && (
              <span className="inline-flex items-center gap-0.5 text-muted" title="Reagendamentos">
                <Repeat2 size={11} />
                {task.reschedule_count}
              </span>
            )}
          </span>
        )}
      </button>

      {/* ALTERNATIVA AO ARRASTO. Nao e um extra de acessibilidade colado no
          fim: e o unico caminho que funciona por teclado, por leitor de tela e
          — no CP5.4 — por toque. O arrasto e o atalho, nao a via. */}
      {/* ALVO DE TOQUE: no mobile o botao e uma FAIXA de 44px colada na borda
          direita, alta como o cartao — o minimo confortavel para o polegar sem
          engordar o cartao. No desktop volta a ser o disco discreto de 28px que
          so aparece no hover. */}
      <div className="absolute bottom-0 right-0 top-0 lg:bottom-auto lg:right-0.5 lg:top-0.5">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Mover "${task.title}"`}
          aria-haspopup={isDesktop ? 'menu' : 'dialog'}
          aria-expanded={menuOpen}
          className={cx(
            'flex h-full w-11 items-center justify-center rounded-r-control text-muted transition-opacity active:bg-surface-2 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 lg:h-7 lg:w-7 lg:rounded-full lg:hover:bg-surface-2',
            // No toque o botao existe sempre (nao ha hover); no desktop ele so
            // aparece quando o cartao esta sob o cursor ou com foco.
            menuOpen ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100',
          )}
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && isDesktop && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="floating absolute right-0 top-8 z-40 w-48 overflow-hidden py-1"
            >
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                Mover para
              </p>
              {FLOW_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  role="menuitem"
                  disabled={col.key === columnKey}
                  onClick={() => {
                    setMenuOpen(false)
                    onMove?.(task, col.key)
                  }}
                  className="flex min-h-[38px] w-full items-center px-3 text-left text-[13px] text-primary transition-colors hover:bg-surface-2 disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent"
                >
                  {col.label}
                </button>
              ))}
              <div className="my-1 border-t hair" />
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onOpen?.(task)
                }}
                className="flex min-h-[38px] w-full items-center px-3 text-left text-[13px] text-primary transition-colors hover:bg-surface-2"
              >
                Abrir detalhes
              </button>
            </div>
          </>
        )}
      </div>

      {/* No toque, a mesma acao vira folha inferior: dois toques ate mover. */}
      {!isDesktop && (
        <MoveSheet
          open={menuOpen}
          task={task}
          columnKey={columnKey}
          onClose={() => setMenuOpen(false)}
          onMove={onMove}
          onOpenDetails={onOpen}
        />
      )}
    </div>
  )
}

export default memo(BoardCard)
