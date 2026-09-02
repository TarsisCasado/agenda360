import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Archive, ChevronDown } from 'lucide-react'
import BoardColumn from './BoardColumn'
import BoardCard from './BoardCard'
import DatePrompt from './DatePrompt'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import {
  FLOW_COLUMNS,
  buildBoard,
  patchForColumn,
  filterBoardTasks,
  splitDoneWindow,
  BOARD_FILTERS,
  DONE_WINDOW_DAYS,
} from '../../lib/board'
import { STATUS } from '../../lib/constants'
import { toISODate } from '../../lib/date'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// QUADRO DE FLUXO — a superficie de TRABALHO de Tarefas.
//
// O criterio nao e "ter quatro colunas", e conseguir responder em ~3 segundos:
// o que nao organizei / o que preciso fazer / o que estou fazendo / o que
// terminei.
//
// DUAS FORMAS DE UM QUADRO SO
//   >=1024px  grade de quatro colunas simultaneas (CP5.3, aprovado).
//   <1024px   PAGER: uma coluna em foco por vez, com o vizinho espiando na
//             borda, e passagem lateral por deslize ou por toque na etapa.
//
// Sao o MESMO componente e a mesma arvore — muda o container. Empilhar as
// quatro colunas verticalmente (o fallback do CP5.3) funcionava tecnicamente e
// falhava cognitivamente: virava de novo uma pagina com quatro secoes, e a
// logica ESPACIAL do Kanban e metade do que faz um Kanban ser util.
//
// O PAGER E CSS, NAO GESTO
//   `overflow-x-auto` + `snap-x snap-mandatory`. O deslize e o scroll nativo do
//   iOS, com a inercia e o rubber-band de sempre. Nao ha listener de touchmove,
//   nao ha biblioteca de arrasto, nao ha gesto proprio disputando o dedo com o
//   scroll. O JS so LE em que coluna o scroll parou, para acender a etapa certa
//   na barra — e escreve quando a pessoa toca numa etapa.
//
//   So a area do quadro se move na horizontal. O body nunca: o pager e um
//   elemento com overflow proprio dentro do <main>, e o teste trava isso.
//
// TEXTO POR COLUNA (rotulo, vazio, placeholder) mora aqui, e nao em
// lib/board.js, porque lib/ e dominio e isto e voz de produto. As REGRAS
// continuam vindo de la — este componente nunca decide para onde uma tarefa vai.
//
// PERSISTENCIA OTIMISTA COM ROLLBACK: mover pinta a mudanca na hora e so depois
// grava. Se a gravacao falhar, o cartao volta e o toast diz por que. E o unico
// jeito de a acao nao parecer travada sem que a tela passe a mentir.
// ---------------------------------------------------------------------------

const COLUNA_UX = {
  sem_data: {
    empty: 'Nada esperando organização.',
    placeholder: 'O que precisa sair da cabeça?',
    // Sem data e o backlog: entra exatamente como esta, sem dia.
    defaults: { status: STATUS.TODO, date: null },
  },
  a_fazer: {
    empty: 'Nada pendente com data.',
    placeholder: 'Nova tarefa…',
    // ESTADO OPERACIONAL != DIMENSAO TEMPORAL. "A fazer" quer dizer AGENDADO,
    // nao "hoje". No CP5.3 esta coluna criava a tarefa em hoje e avisava disso
    // no placeholder; declarar a suposicao nao a torna menos suposicao. Agora
    // pergunta o dia, do mesmo jeito que pergunta ao arrastar para ca.
    defaults: { status: STATUS.TODO },
    needsDate: true,
  },
  em_andamento: {
    empty: 'Nenhuma tarefa em andamento.',
    placeholder: 'O que você começou agora?',
    defaults: { status: STATUS.IN_PROGRESS, date: null },
  },
  concluido: {
    empty: `Nada concluído nos últimos ${DONE_WINDOW_DAYS} dias.`,
    // Concluido nao ganha "+ Adicionar": criar uma tarefa ja feita e um caso de
    // registro retroativo, nao de operacao — e o quadro e operacao.
    defaults: null,
  },
}

export default function FlowBoard({ tasks, setTasks, reload, onOpenTask, className }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()

  const [filtro, setFiltro] = useState('todas')
  const [draggingId, setDraggingId] = useState(null)
  const [alvo, setAlvo] = useState(null)
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [verTodasConcluidas, setVerTodasConcluidas] = useState(false)
  const [pedindoData, setPedindoData] = useState(null)
  const [etapa, setEtapa] = useState(0)

  const pagerRef = useRef(null)
  const colunaRefs = useRef([])
  const tabRefs = useRef([])
  // Resolvedor do composer: mantem o campo aberto (com o texto digitado) ate a
  // escolha de data terminar. Cancelar nao pode custar o que a pessoa escreveu.
  const composerRef = useRef(null)

  const hoje = toISODate(new Date())

  const { colunas, arquivadas, concluidasOcultas, vazio } = useMemo(() => {
    const board = buildBoard(filterBoardTasks(tasks, filtro))
    const { recentes, antigas } = splitDoneWindow(board.colunas.concluido, { today: hoje })
    return {
      colunas: {
        ...board.colunas,
        concluido: verTodasConcluidas ? board.colunas.concluido : recentes,
      },
      arquivadas: board.arquivadas,
      concluidasOcultas: verTodasConcluidas ? 0 : antigas.length,
      vazio: Object.values(board.colunas).every((c) => c.length === 0),
    }
  }, [tasks, filtro, hoje, verTodasConcluidas])

  // -------------------------------------------------------------------------
  // PAGER: ler o scroll -> etapa ativa; tocar na etapa -> escrever o scroll.
  // Na grade de desktop o pager nao rola (overflow-visible), entao nada disto
  // dispara e a etapa fica em 0, sem efeito.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = pagerRef.current
    if (!el) return
    let frame = 0
    const ler = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const centro = el.scrollLeft + el.clientWidth / 2
        let melhor = 0
        let menor = Infinity
        colunaRefs.current.forEach((node, i) => {
          if (!node) return
          const meio = node.offsetLeft + node.offsetWidth / 2
          const dist = Math.abs(meio - centro)
          if (dist < menor) {
            menor = dist
            melhor = i
          }
        })
        setEtapa(melhor)
      })
    }
    el.addEventListener('scroll', ler, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', ler)
    }
  }, [])

  // A etapa ativa nunca pode ficar fora de vista na barra: quando quatro nomes
  // com contagem nao cabem em 390px, a barra rola junto com o quadro.
  useEffect(() => {
    tabRefs.current[etapa]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [etapa])

  const irParaEtapa = useCallback((i) => {
    const node = colunaRefs.current[i]
    const el = pagerRef.current
    if (!node || !el) return
    el.scrollTo({ left: node.offsetLeft - (el.clientWidth - node.offsetWidth) / 2, behavior: 'smooth' })
    setEtapa(i)
  }, [])

  // -------------------------------------------------------------------------
  // MOVIMENTACAO. Um caminho so para arrasto, menu, folha e teclado: quem chama
  // passa a tarefa e a coluna de destino, `patchForColumn` decide o resto.
  // -------------------------------------------------------------------------
  const aplicar = useCallback(
    async (task, patch) => {
      const anterior = tasks
      setTasks((atual) => atual.map((x) => (x.id === task.id ? { ...x, ...patch } : x)))
      try {
        await taskService.update(user.id, task, patch)
        reloadData()
      } catch (err) {
        setTasks(anterior) // rollback: a tela volta a dizer a verdade
        toast('Não foi possível mover: ' + (err?.message || 'erro desconhecido'), 'error')
        reload?.()
      }
    },
    [tasks, setTasks, user, reloadData, toast, reload],
  )

  const mover = useCallback(
    (task, colunaDestino) => {
      if (!task) return
      const { needsDate, ...patch } = patchForColumn(task, colunaDestino)
      if (Object.keys(patch).length === 0) return
      // Nada a fazer: soltar no mesmo lugar nao pode gerar escrita nem log.
      if (Object.entries(patch).every(([k, v]) => task[k] === v) && !needsDate) return
      if (needsDate) {
        setPedindoData({ tipo: 'mover', task, patch })
        return
      }
      aplicar(task, patch)
    },
    [aplicar],
  )

  const soltar = useCallback(
    (taskId, colunaDestino) => {
      setDraggingId(null)
      setAlvo(null)
      const task = tasks.find((x) => x.id === taskId)
      if (task) mover(task, colunaDestino)
    },
    [tasks, mover],
  )

  const criar = useCallback(
    async (titulo, colunaKey, extra) => {
      const ux = COLUNA_UX[colunaKey]
      try {
        await taskService.create(workspaceId, user.id, { title: titulo, ...ux.defaults, ...extra })
        reload?.()
        reloadData()
        return true
      } catch (err) {
        toast('Erro ao criar: ' + err.message, 'error')
        return false
      }
    },
    [workspaceId, user, reload, reloadData, toast],
  )

  const adicionar = useCallback(
    (titulo, colunaKey) => {
      if (!COLUNA_UX[colunaKey].needsDate) return criar(titulo, colunaKey)
      // Precisa de dia: pergunta primeiro e so entao cria. A promessa so
      // resolve no fim, entao o campo continua aberto com o texto se a pessoa
      // desistir da data.
      return new Promise((resolve) => {
        composerRef.current = resolve
        setPedindoData({ tipo: 'criar', titulo, coluna: colunaKey })
      })
    },
    [criar],
  )

  const fecharData = useCallback(() => {
    setPedindoData(null)
    composerRef.current?.(false)
    composerRef.current = null
  }, [])

  const confirmarData = useCallback(
    async (date) => {
      const pedido = pedindoData
      setPedindoData(null)
      if (!pedido) return
      if (pedido.tipo === 'criar') {
        const ok = await criar(pedido.titulo, pedido.coluna, { date })
        composerRef.current?.(ok)
        composerRef.current = null
        return
      }
      aplicar(pedido.task, { ...pedido.patch, date })
    },
    [pedindoData, criar, aplicar],
  )

  return (
    <div
      className={cx('flex min-h-0 flex-col', className)}
      onDragStart={(e) => setDraggingId(e.target?.dataset?.taskId || null)}
      onDragEnd={() => {
        setDraggingId(null)
        setAlvo(null)
      }}
    >
      {/* CONTEXTO/FILTROS — uma linha so, inclusive a 390px. Filtro e leitura:
          recorta o que aparece e nunca toca no dominio. No toque "Arquivadas"
          perde o rotulo e fica so icone + contagem: e o que faz a linha caber
          sem quebrar e sem encolher fonte. */}
      <div className="mb-2 flex shrink-0 items-center gap-1 px-0.5 short:mb-1 lg:mb-2.5 lg:gap-1.5">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            aria-pressed={filtro === f.key}
            className={cx(
              // 44px no toque (minimo confortavel para o polegar), 30px no
              // desktop, onde o alvo e o ponteiro.
              'press min-h-[44px] shrink-0 rounded-full px-3 text-[12.5px] transition-colors short:min-h-[38px] lg:min-h-[30px]',
              filtro === f.key
                ? 'bg-primary font-semibold text-canvas'
                : 'font-medium text-muted hover:bg-surface-2 hover:text-primary',
            )}
          >
            {f.label}
          </button>
        ))}
        {arquivadas.length > 0 && (
          <button
            onClick={() => setVerArquivadas((v) => !v)}
            aria-expanded={verArquivadas}
            aria-label={`Arquivadas, ${arquivadas.length}`}
            className="press ml-auto inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-primary short:min-h-[38px] lg:min-h-[30px] lg:gap-1.5"
          >
            <Archive size={14} />
            <span className="hidden lg:inline">Arquivadas</span>
            <span className="tabular-nums text-faint">{arquivadas.length}</span>
            <ChevronDown
              size={13}
              className={cx('transition-transform', verArquivadas && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* BARRA DE ETAPAS (so no toque) — deslizar nao pode ser a unica forma de
          trocar de coluna, e ela tambem responde "onde eu estou" e "quantas
          etapas existem". Rola na horizontal quando os quatro nomes com
          contagem nao cabem, em vez de encolher a fonte ate ficar ilegivel. */}
      <div
        role="tablist"
        aria-label="Etapa do fluxo"
        data-testid="board-stages"
        className="no-scrollbar -mx-3 mb-2 flex shrink-0 gap-1 overflow-x-auto px-3 short:mb-1 lg:hidden"
      >
        {FLOW_COLUMNS.map((col, i) => {
          const ativa = i === etapa
          return (
            <button
              key={col.key}
              ref={(n) => (tabRefs.current[i] = n)}
              role="tab"
              aria-selected={ativa}
              onClick={() => irParaEtapa(i)}
              className={cx(
                'press flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-row px-3 text-[13px] transition-colors short:min-h-[36px]',
                ativa ? 'bg-surface font-semibold text-primary shadow-raised' : 'font-medium text-muted',
              )}
            >
              {col.label}
              <span
                className={cx('tabular-nums text-[12px]', ativa ? 'text-secondary' : 'text-faint')}
              >
                {colunas[col.key].length}
              </span>
            </button>
          )
        })}
      </div>

      {/* O QUADRO.
          >=1024px: grade de quatro colunas ocupando a largura util inteira.
          <1024px:  pager com encaixe. Cada coluna ocupa 91% da largura util
                    (47% em telas medias e no iPhone deitado, onde duas cabem
                    bem) e os 9% restantes mostram uma FRESTA do vizinho — o
                    bastante para dizer "ha mais para o lado" sem virar uma
                    segunda coluna legivel disputando a leitura.
          As colunas se esticam para terminarem na mesma linha; com o quadro
          INTEIRO vazio isso viraria quatro caixas gigantes, entao ai encolhem
          para o tamanho do proprio texto. */}
      <div
        ref={pagerRef}
        data-testid="board-pager"
        className={cx(
          'no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3',
          'lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0',
          vazio ? 'flex-none' : 'min-h-0 flex-1',
        )}
      >
        {FLOW_COLUMNS.map((col, i) => {
          const ux = COLUNA_UX[col.key]
          return (
            <div
              key={col.key}
              ref={(n) => (colunaRefs.current[i] = n)}
              // min-h-0: sem isto o conteudo natural da coluna (25 cartoes)
              // vira a altura MINIMA deste item, a linha da grade cresce junto
              // e o quadro do desktop deixa de caber na viewport — a lista
              // interna nunca chega a rolar. Foi o que o smoke do CP5.3 pegou
              // quando este wrapper entrou para o pager.
              className="flex min-h-0 w-[91%] shrink-0 snap-center flex-col sm:w-[47%] lg:w-auto lg:shrink"
            >
              <BoardColumn
                column={{ ...col, ...ux }}
                tasks={colunas[col.key]}
                today={hoje}
                draggingId={draggingId}
                isDropTarget={alvo === col.key && draggingId != null}
                onOpen={onOpenTask}
                onMove={mover}
                onAdd={ux.defaults ? adicionar : undefined}
                onDragEnterColumn={setAlvo}
                onDropColumn={soltar}
                footer={
                  col.key === 'concluido' && (concluidasOcultas > 0 || verTodasConcluidas) ? (
                    <button
                      onClick={() => setVerTodasConcluidas((v) => !v)}
                      className="min-h-[40px] px-3 text-left text-[12px] font-medium text-muted transition-colors hover:text-primary lg:min-h-[36px]"
                    >
                      {verTodasConcluidas
                        ? `Mostrar só os últimos ${DONE_WINDOW_DAYS} dias`
                        : `Ver mais ${concluidasOcultas} concluída${concluidasOcultas === 1 ? '' : 's'}`}
                    </button>
                  ) : null
                }
              />
            </div>
          )
        })}
      </div>

      {/* ARQUIVADAS — furei, não foi necessária, cancelada. Não são estágios do
          trabalho, então não são colunas; mas continuam a um toque e continuam
          recuperáveis pelo mesmo "Mover para" dos outros cartões. */}
      {verArquivadas && arquivadas.length > 0 && (
        <div className="mt-2 shrink-0 rounded-row bg-board p-1.5">
          <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
            Arquivadas
          </p>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            {arquivadas.map((task) => (
              <div key={task.id} className="w-56 shrink-0">
                <BoardCard
                  task={task}
                  columnKey="arquivadas"
                  today={hoje}
                  onOpen={onOpenTask}
                  onMove={mover}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <DatePrompt
        open={Boolean(pedindoData)}
        titulo={pedindoData?.tipo === 'criar' ? pedindoData.titulo : pedindoData?.task?.title}
        acao={pedindoData?.tipo}
        onClose={fecharData}
        onConfirm={confirmarData}
      />
    </div>
  )
}
