import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MoreHorizontal, Check, CalendarClock } from 'lucide-react'
import { useProto, useDesktop, useAcoes } from '../store/contexto'
import { colunaDe } from '../store/reducer'
import { ESTADO, rotuloDeData } from '../mock/dados'
import { Vazio, Chip, Botao, Folha, Marcar } from '../parts/base'
import TarefaForm from '../forms/TarefaForm'
import { useTouchCardDrag } from '../../hooks/useTouchCardDrag'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// TAREFAS — o quadro tem de ser USAVEL, nao parecer um quadro.
//
// O UX1 desenhou linhas bonitas e tirou a manipulacao direta junto. Metade do
// valor de um Kanban e ESPACIAL: pegar a coisa e por noutro lugar. Aqui a
// atividade volta a ser um OBJETO — superficie, contorno, pega — e o arrasto
// funciona de verdade.
//
// TRES VIAS PARA A MESMA REGRA, e uma so funcao no estado (`moverTarefa`):
//   . arrastar, no desktop, com linha de insercao e coluna alvo acesa;
//   . segurar e arrastar, no toque (reaproveitando `useTouchCardDrag`, o gesto
//     ja validado no produto: 380ms, folga de 10px, Touch Events para nao
//     brigar com o scroll);
//   . "Mover para...", que nunca e plano B — e a via principal no telefone.
//
// "SEM DATA" NAO E COLUNA. Nunca foi um estagio de execucao: uma tarefa pode
// estar em andamento E sem data ao mesmo tempo. Virou filtro, onde sempre
// deveria ter estado.
// ---------------------------------------------------------------------------
const COLUNAS = [
  // `curto` existe porque no telefone os tres nomes disputam a mesma linha:
  // "Em andamento" quebrava em duas e desalinhava o seletor inteiro.
  { estado: ESTADO.A_FAZER, titulo: 'A fazer', curto: 'A fazer' },
  { estado: ESTADO.FAZENDO, titulo: 'Em andamento', curto: 'Andamento' },
  { estado: ESTADO.FEITO, titulo: 'Concluído', curto: 'Concluído' },
]

const FILTROS = [
  { chave: 'sem-data', label: 'Sem data' },
  { chave: 'hoje', label: 'Para hoje' },
  { chave: 'alta', label: 'Prioridade alta' },
  { chave: 'atrasadas', label: 'Atrasadas' },
]

export default function Tarefas() {
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
  const navegar = useNavigate()
  const [visao, setVisao] = useState('quadro')
  const [filtros, setFiltros] = useState([])
  const [colunaMovel, setColunaMovel] = useState(ESTADO.A_FAZER)
  const [form, setForm] = useState(null)      // { tarefa } | { padroes }
  const [mover, setMover] = useState(null)    // tarefa
  const [arrasto, setArrasto] = useState(null) // { id, coluna, antesDe }
  const pagerRef = useRef(null)

  const passa = useCallback((t) => {
    if (!filtros.length) return true
    return filtros.every((f) => {
      if (f === 'sem-data') return !t.planejadaPara && !t.prazo
      if (f === 'hoje') return t.paraHoje || t.planejadaPara === estado.hoje
      if (f === 'alta') return t.prioridade === 'alta'
      if (f === 'atrasadas') return t.prazo && t.prazo < estado.hoje && t.estado !== ESTADO.FEITO
      return true
    })
  }, [filtros, estado.hoje])

  const porColuna = (col) => colunaDe(estado, col).filter(passa)

  // --- toque: o mesmo gesto validado no produto -----------------------------
  const toque = useTouchCardDrag({
    pagerRef,
    enabled: !desktop && visao === 'quadro',
    onDrop: (taskId, coluna) => { if (coluna) acoes.moverTarefa(taskId, coluna) },
    onAdvance: () => {},
  })

  const alternarFiltro = (f) =>
    setFiltros((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))

  const soltar = (coluna) => {
    if (!arrasto) return
    acoes.moverTarefa(arrasto.id, coluna, arrasto.antesDe)
    setArrasto(null)
  }

  return (
    <div className="px-entra">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="px-titulo-tela">Tarefas</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-control border border-hairline p-0.5">
            {['quadro', 'lista'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                aria-pressed={visao === v}
                className={cx(
                  'press rounded-[7px] px-3 py-1.5 text-[13px] capitalize transition',
                  visao === v ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted hover:text-primary',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Botao variante="primario" onClick={() => setForm({ padroes: {} })}>
            <Plus size={16} /> Nova tarefa
          </Botao>
        </div>
      </header>

      {/* Filtros: precisam parecer selecionaveis, mostrar o que esta ligado e
          poder ser limpos. "Sem data" mora aqui — e propriedade, nao estagio. */}
      <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <Chip key={f.chave} on={filtros.includes(f.chave)} onClick={() => alternarFiltro(f.chave)}>
            {f.label}
          </Chip>
        ))}
        {filtros.length > 0 && (
          <button
            type="button"
            onClick={() => setFiltros([])}
            className="press ml-1 shrink-0 text-[12.5px] font-semibold text-accent-text hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>
      {filtros.length > 0 && (
        <p className="mt-1.5 text-[12px] text-muted">
          {estado.tarefas.filter(passa).length} de {estado.tarefas.length} atividades
        </p>
      )}

      {visao === 'lista' ? (
        <Lista tarefas={estado.tarefas.filter(passa)} aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)} aoMover={setMover} />
      ) : desktop ? (
        <div className="mt-5 grid grid-cols-3 gap-4">
          {COLUNAS.map((c) => (
            <Coluna
              key={c.estado}
              {...c}
              tarefas={porColuna(c.estado)}
              arrasto={arrasto}
              setArrasto={setArrasto}
              aoSoltar={soltar}
              aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)}
              aoMover={setMover}
              aoAdicionar={() => setForm({ padroes: { estado: c.estado } })}
            />
          ))}
        </div>
      ) : (
        <>
          {/* No telefone: uma coluna legivel por vez, com orientacao clara. */}
          <div className="mt-4 flex gap-1 rounded-control border border-hairline p-0.5">
            {COLUNAS.map((c) => (
              <button
                key={c.estado}
                type="button"
                onClick={() => setColunaMovel(c.estado)}
                aria-pressed={colunaMovel === c.estado}
                className={cx(
                  'press flex-1 whitespace-nowrap rounded-[7px] px-1.5 py-2 text-[12.5px] transition',
                  colunaMovel === c.estado ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted',
                )}
              >
                {c.curto}
                <span className="ml-1 text-[11px] opacity-70">{porColuna(c.estado).length}</span>
              </button>
            ))}
          </div>
          <div ref={pagerRef} className="mt-4">
            <Coluna
              {...COLUNAS.find((c) => c.estado === colunaMovel)}
              semCabecalho
              tarefas={porColuna(colunaMovel)}
              arrastandoToque={toque.taskId}
              alvoToque={toque.alvo}
              arrasto={arrasto}
              setArrasto={setArrasto}
              aoSoltar={soltar}
              aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)}
              aoMover={setMover}
              aoAdicionar={() => setForm({ padroes: { estado: colunaMovel } })}
            />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Segure um cartão para arrastar, ou use <strong className="font-semibold">Mover para…</strong> no menu do cartão.
          </p>
        </>
      )}

      <TarefaForm
        aberta={Boolean(form)}
        aoFechar={() => setForm(null)}
        tarefa={form?.tarefa}
        padroes={form?.padroes || {}}
      />

      <MoverPara tarefa={mover} aoFechar={() => setMover(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function Coluna({
  titulo, estado: col, tarefas, semCabecalho,
  arrasto, setArrasto, aoSoltar, aoAbrir, aoMover, aoAdicionar,
  arrastandoToque, alvoToque,
}) {
  const alvo = (arrasto && arrasto.coluna === col) || alvoToque === col

  const sobre = (e, antesDe) => {
    e.preventDefault()
    e.stopPropagation()
    if (!arrasto) return
    if (arrasto.coluna !== col || arrasto.antesDe !== antesDe) {
      setArrasto({ ...arrasto, coluna: col, antesDe })
    }
  }

  return (
    <section
      data-testid={`board-column-${col}`}
      onDragOver={(e) => sobre(e, null)}
      onDrop={(e) => { e.preventDefault(); aoSoltar(col) }}
      className={cx('px-coluna flex min-h-[140px] flex-col')}
      data-alvo={alvo ? 'true' : 'false'}
    >
      {!semCabecalho && (
        <header className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
          <h2 className="flex items-baseline gap-1.5">
            <span className="px-secao">{titulo}</span>
            <span className="text-[11px] text-faint">{tarefas.length}</span>
          </h2>
          <button
            type="button"
            onClick={aoAdicionar}
            aria-label={`Adicionar atividade em ${titulo}`}
            className="press grid h-6 w-6 place-items-center rounded-[7px] text-muted transition hover:bg-surface hover:text-accent-text"
          >
            <Plus size={15} />
          </button>
        </header>
      )}

      <div className="flex-1 space-y-1.5">
        {tarefas.length === 0 && (
          <p className="px-1 py-5 text-center text-[12.5px] text-faint">
            {arrasto ? 'Solte aqui' : 'Nada aqui'}
          </p>
        )}

        {tarefas.map((t) => (
          <div key={t.id} onDragOver={(e) => sobre(e, t.id)}>
            {arrasto?.coluna === col && arrasto?.antesDe === t.id && <div className="px-insercao" />}
            <CartaoTarefa
              t={t}
              arrastando={arrasto?.id === t.id || arrastandoToque === t.id}
              aoAbrir={aoAbrir}
              aoMover={aoMover}
              setArrasto={setArrasto}
              coluna={col}
            />
          </div>
        ))}

        {/* Solta no fim da coluna: a area cresce durante o arrasto para o alvo
            ser facil de acertar, inclusive numa coluna vazia. */}
        <div
          onDragOver={(e) => sobre(e, null)}
          className={cx('rounded-[10px] transition-all', arrasto ? 'h-9' : 'h-1')}
        >
          {arrasto?.coluna === col && !arrasto?.antesDe && <div className="px-insercao" />}
        </div>
      </div>

      <button
        type="button"
        onClick={aoAdicionar}
        className="press mt-1 flex w-full items-center gap-1.5 rounded-[10px] px-2 py-2 text-left text-[13px] text-muted transition hover:bg-surface hover:text-accent-text"
      >
        <Plus size={15} /> Adicionar atividade
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
function CartaoTarefa({ t, arrastando, aoAbrir, aoMover, setArrasto, coluna }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const feito = t.estado === ESTADO.FEITO
  const atrasada = t.prazo && t.prazo < estado.hoje && !feito

  return (
    <div
      data-task-id={t.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        setArrasto({ id: t.id, coluna, antesDe: null })
      }}
      onDragEnd={() => setArrasto(null)}
      className={cx('px-cartao px-pega', arrastando && 'opacity-40')}
      data-arrastando={arrastando ? 'true' : 'false'}
      data-concluido={feito ? 'true' : 'false'}
    >
      <div className="flex items-start gap-2">
        <Marcar
          feito={feito}
          label={feito ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
          onClick={() => acoes.mudarEstado(t.id, feito ? ESTADO.A_FAZER : ESTADO.FEITO)}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={() => aoAbrir(t)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cx('block text-[14px] font-medium leading-snug', feito && 'line-through')}>
            {t.titulo}
          </span>
          <span className="px-motivo mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {t.reserva ? (
              <span className="inline-flex items-center gap-1 font-medium text-accent-text">
                <CalendarClock size={12} />
                <span className="px-hora">{t.reserva.inicio}–{t.reserva.fim}</span>
              </span>
            ) : t.planejadaPara ? (
              <span>{rotuloDeData(t.planejadaPara, estado.hoje)}</span>
            ) : (
              <span className="text-faint">sem data</span>
            )}
            {atrasada && <span className="font-medium text-warning">atrasada</span>}
            {t.prioridade === 'alta' && <span className="text-danger">alta</span>}
            {t.contexto && <span>{t.contexto}</span>}
            {t.origemId && <span className="text-accent-text">origem</span>}
            {t.subtarefas?.length > 0 && (
              <span>{t.subtarefas.filter((s) => s.feito).length}/{t.subtarefas.length}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Mover ${t.titulo}`}
          onClick={() => aoMover(t)}
          className="press -mr-1 -mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-[7px] text-muted transition hover:bg-surface-2 hover:text-primary"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  )
}

// "Mover para..." — no toque e a via principal, nao o plano B.
function MoverPara({ tarefa, aoFechar }) {
  const acoes = useAcoes()
  if (!tarefa) return null
  return (
    <Folha aberta aoFechar={aoFechar} titulo="Mover para" subtitulo={tarefa.titulo} largura="max-w-[420px]">
      <div className="space-y-1.5">
        {COLUNAS.map((c) => {
          const atual = c.estado === tarefa.estado
          return (
            <button
              key={c.estado}
              type="button"
              disabled={atual}
              onClick={() => { acoes.moverTarefa(tarefa.id, c.estado); aoFechar() }}
              className={cx(
                'press flex w-full items-center justify-between rounded-row border px-4 py-3 text-[14.5px] transition',
                atual ? 'border-hairline bg-surface-2 text-muted' : 'border-hairline hover:border-accent hover:text-accent-text',
              )}
            >
              {c.titulo}
              {atual && <span className="inline-flex items-center gap-1 text-[12.5px]"><Check size={14} /> atual</span>}
            </button>
          )
        })}
      </div>
    </Folha>
  )
}

function Lista({ tarefas, aoAbrir, aoMover }) {
  const abertas = tarefas.filter((t) => t.estado !== ESTADO.FEITO)
  const feitas = tarefas.filter((t) => t.estado === ESTADO.FEITO)
  return (
    <div className="mt-5 space-y-1.5">
      {abertas.length === 0 && <Vazio>Nenhuma atividade com esses filtros.</Vazio>}
      {abertas.map((t) => (
        <CartaoTarefa key={t.id} t={t} aoAbrir={aoAbrir} aoMover={aoMover} setArrasto={() => {}} coluna={t.estado} />
      ))}
      {feitas.length > 0 && (
        <>
          <h2 className="px-secao pt-5">Concluído</h2>
          {feitas.map((t) => (
            <CartaoTarefa key={t.id} t={t} aoAbrir={aoAbrir} aoMover={aoMover} setArrasto={() => {}} coluna={t.estado} />
          ))}
        </>
      )}
    </div>
  )
}
