import { useMemo, useState, useCallback } from 'react'
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
// O criterio do CP5.3 nao e "ter quatro colunas", e conseguir responder em
// ~3 segundos: o que nao organizei / o que preciso fazer / o que estou fazendo /
// o que terminei. Por isso o quadro ocupa a largura toda e as quatro colunas
// aparecem JUNTAS: a resposta e a leitura horizontal, nao a navegacao.
//
// TEXTO POR COLUNA (rotulo, vazio, placeholder) mora aqui, e nao em
// lib/board.js, porque lib/ e dominio e isto e voz de produto. As REGRAS
// continuam vindo de la — este componente nunca decide para onde uma tarefa vai.
//
// PERSISTENCIA OTIMISTA COM ROLLBACK: mover um cartao pinta a mudanca na hora e
// so depois grava. Se a gravacao falhar, o cartao volta para onde estava e o
// toast diz por que. E o unico jeito de o arrasto nao parecer travado sem que a
// tela passe a mentir sobre o que esta no banco.
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
    placeholder: 'Nova tarefa para hoje…',
    // "A fazer" e o que TEM data. O placeholder declara o dia em vez de
    // inventa-lo em silencio: quem digita ali sabe que vai cair em hoje, e
    // muda depois com um arrasto ou dois cliques.
    defaults: () => ({ status: STATUS.TODO, date: toISODate(new Date()) }),
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
  // MOVIMENTACAO. Um unico caminho para arrasto, menu e teclado: quem chama
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
        setPedindoData({ task, patch })
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

  const adicionar = useCallback(
    async (titulo, colunaKey) => {
      const ux = COLUNA_UX[colunaKey]
      const defaults = typeof ux.defaults === 'function' ? ux.defaults() : ux.defaults
      try {
        await taskService.create(workspaceId, user.id, { title: titulo, ...defaults })
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

  return (
    <div
      className={cx('flex min-h-0 flex-col', className)}
      onDragStart={(e) => setDraggingId(e.target?.dataset?.taskId || null)}
      onDragEnd={() => {
        setDraggingId(null)
        setAlvo(null)
      }}
    >
      {/* CONTEXTO/FILTROS — uma linha, sem barra de ferramentas. Filtro e
          leitura: recorta o que aparece e nunca toca no dominio. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 px-0.5">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            aria-pressed={filtro === f.key}
            className={cx(
              'press min-h-[30px] rounded-full px-3 text-[12.5px] transition-colors',
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
            className="press ml-auto inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Archive size={13} />
            Arquivadas
            <span className="tabular-nums text-faint">{arquivadas.length}</span>
            <ChevronDown
              size={13}
              className={cx('transition-transform', verArquivadas && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* O QUADRO. Em >=1024px, quatro colunas simultaneas ocupando a largura
          util inteira — sem max-width, sem centralizar, sem vazio lateral.
          Abaixo disso as mesmas quatro colunas empilham (fallback funcional; o
          padrao focus/pager do video B e o CP5.4).
          
          As colunas se esticam ate o fim da tela para terminarem na MESMA
          linha — e o que faz quatro listas lerem como um quadro. Com o quadro
          INTEIRO vazio isso viraria o oposto: quatro caixas gigantes e vazias.
          Entao ai elas encolhem para o tamanho do proprio texto — a estrutura
          continua visivel, o vazio para de ocupar a tela. */}
      <div
        className={cx(
          'grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3',
          vazio ? 'flex-none' : 'flex-1',
        )}
      >
        {FLOW_COLUMNS.map((col) => {
          const ux = COLUNA_UX[col.key]
          return (
            <BoardColumn
              key={col.key}
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
                    className="min-h-[36px] px-3 text-left text-[12px] font-medium text-muted transition-colors hover:text-primary"
                  >
                    {verTodasConcluidas
                      ? `Mostrar só os últimos ${DONE_WINDOW_DAYS} dias`
                      : `Ver mais ${concluidasOcultas} concluída${concluidasOcultas === 1 ? '' : 's'}`}
                  </button>
                ) : null
              }
            />
          )
        })}
      </div>

      {/* ARQUIVADAS — furei, não foi necessária, cancelada. Não são estágios do
          trabalho, então não são colunas; mas continuam a um clique e continuam
          recuperáveis pelo mesmo menu "Mover para" dos outros cartões. */}
      {verArquivadas && arquivadas.length > 0 && (
        <div className="mt-2.5 shrink-0 rounded-row bg-board p-1.5">
          <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
            Arquivadas
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
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
        task={pedindoData?.task}
        onClose={() => setPedindoData(null)}
        onConfirm={(date) => {
          const { task, patch } = pedindoData
          setPedindoData(null)
          aplicar(task, { ...patch, date })
        }}
      />
    </div>
  )
}
