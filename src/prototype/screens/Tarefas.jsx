import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MoreHorizontal, Check, CalendarClock, Bell, CornerUpRight, Ban, LayoutGrid, List as ListIcon } from 'lucide-react'
import { useProto, useDesktop, useAcoes } from '../store/contexto'
import { colunaDe, ehMinha, delegadasPorMim, recebidas } from '../store/reducer'
import { ESTADO, RESPONSABILIDADE, rotuloDeData } from '../mock/dados'
import { Vazio, Chip, Botao, Folha, Marcar } from '../parts/base'
import { Seletor, BotaoDeFiltros, Segmentos, MenuAcoes, TituloDeTela } from '../parts/movel'
import { alertaCurto } from '../mock/alerta'
import { Pessoa, SeloResponsabilidade, EscolherPessoa } from '../parts/pessoas'
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

// ---------------------------------------------------------------------------
// OS TRES RECORTES DA DELEGACAO.
//
// Nao sao tres listas: sao tres PERGUNTAS sobre o mesmo conjunto. "Conferir
// documentacao dos seminovos" aparece em "Delegadas por mim" e, para o Rubens,
// apareceria em "Recebidas" — e a MESMA tarefa, com o mesmo andamento. Nao ha
// copia, nao ha tarefa espelho, e e por isso que o delegador ve o progresso
// real em vez de um relatorio.
// ---------------------------------------------------------------------------
const ESCOPOS = [
  { chave: 'todas', label: 'Todas' },
  { chave: 'minhas', label: 'Minhas' },
  { chave: 'delegadas', label: 'Delegadas por mim' },
  { chave: 'recebidas', label: 'Recebidas' },
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
  const [escopo, setEscopo] = useState('todas')
  const [colunaMovel, setColunaMovel] = useState(ESTADO.A_FAZER)
  const [form, setForm] = useState(null)      // { tarefa } | { padroes }
  const [mover, setMover] = useState(null)    // tarefa
  const [arrasto, setArrasto] = useState(null) // { id, coluna, antesDe }
  const pagerRef = useRef(null)

  const noEscopo = useCallback((t) => {
    if (escopo === 'minhas') return ehMinha(t)
    if (escopo === 'delegadas') return t.delegadorId === 'p-tarsis' && !ehMinha(t)
    if (escopo === 'recebidas') return ehMinha(t) && t.delegadorId && t.delegadorId !== 'p-tarsis'
    return true
  }, [escopo])

  const passa = useCallback((t) => {
    if (!noEscopo(t)) return false
    if (!filtros.length) return true
    return filtros.every((f) => {
      if (f === 'sem-data') return !t.planejadaPara && !t.prazo
      if (f === 'hoje') return t.paraHoje || t.planejadaPara === estado.hoje
      if (f === 'alta') return t.prioridade === 'alta'
      if (f === 'atrasadas') return t.prazo && t.prazo < estado.hoje && t.estado !== ESTADO.FEITO
      return true
    })
  }, [filtros, estado.hoje, noEscopo])

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
      {!desktop ? (
        // ------------------------------------------------------------------
        // TELEFONE (UX1.2.1) — a tela tinha TRÊS eixos empilhados antes do
        // conteúdo: escopo, filtros e estado. Três fileiras é meia tela para
        // decidir o que ver antes de ver qualquer coisa.
        //
        // Agora são dois controles numa linha (escopo e filtros, ambos com a
        // escolha atual visível) e o estado logo abaixo. O conteúdo começa no
        // primeiro viewport. Nada sumiu: o que era fileira virou seletor.
        // ------------------------------------------------------------------
        <>
          <TituloDeTela
            titulo="Tarefas"
            acao={
              <span className="flex items-center gap-1">
                <MenuAcoes
                  titulo="Tarefas"
                  rotulo="Modo de exibição"
                  acoes={[
                    {
                      rotulo: visao === 'quadro' ? 'Ver em lista' : 'Ver em quadro',
                      icone: visao === 'quadro' ? ListIcon : LayoutGrid,
                      fazer: () => setVisao(visao === 'quadro' ? 'lista' : 'quadro'),
                    },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => setForm({ padroes: {} })}
                  aria-label="Nova tarefa"
                  className="press grid h-9 w-9 place-items-center rounded-control bg-accent text-white shadow-raised"
                >
                  <Plus size={19} />
                </button>
              </span>
            }
          />

          <div className="mt-3 flex items-center gap-2">
            <Seletor
              rotulo="De quem"
              valor={escopo}
              aoEscolher={setEscopo}
              opcoes={ESCOPOS.map((e) => ({
                chave: e.chave,
                label: e.label,
                contagem: e.chave === 'todas'
                  ? estado.tarefas.length
                  : e.chave === 'minhas'
                    ? estado.tarefas.filter(ehMinha).length
                    : e.chave === 'delegadas'
                      ? delegadasPorMim(estado).length
                      : recebidas(estado).length,
              }))}
            />
            <BotaoDeFiltros
              opcoes={FILTROS}
              ativos={filtros}
              aoAlternar={alternarFiltro}
              aoLimpar={() => setFiltros([])}
            />
            {filtros.length > 0 && (
              <span className="px-motivo ml-auto">
                {estado.tarefas.filter(passa).length} de {estado.tarefas.length}
              </span>
            )}
          </div>

          {visao === 'quadro' && (
            <Segmentos
              className="mt-2"
              valor={colunaMovel}
              aoEscolher={setColunaMovel}
              opcoes={COLUNAS.map((c) => ({ chave: c.estado, label: c.curto, contagem: porColuna(c.estado).length }))}
            />
          )}
        </>
      ) : (
      <>
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

      {/* De quem é o trabalho — o eixo da RESPONSABILIDADE, separado do eixo da
          execução (as colunas) e do eixo das propriedades (os filtros). */}
      <div className="no-scrollbar mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
        {ESCOPOS.map((e) => {
          const n = e.chave === 'todas'
            ? estado.tarefas.length
            : e.chave === 'minhas'
              ? estado.tarefas.filter(ehMinha).length
              : e.chave === 'delegadas'
                ? delegadasPorMim(estado).length
                : recebidas(estado).length
          return (
            <Chip key={e.chave} on={escopo === e.chave} onClick={() => setEscopo(e.chave)}>
              {e.label} <span className="opacity-60">{n}</span>
            </Chip>
          )
        })}
      </div>

      {/* Filtros: precisam parecer selecionaveis, mostrar o que esta ligado e
          poder ser limpos. "Sem data" mora aqui — e propriedade, nao estagio. */}
      <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto pb-1">
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
      </>
      )}

      {visao === 'lista' ? (
        <Lista tarefas={estado.tarefas.filter(passa)} aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)} aoMover={setMover} />
      ) : desktop ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
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
          {/* O seletor de estado já está no topo: aqui fica só a coluna. Uma
              coluna por viewport continua sendo a leitura certa no telefone. */}
          <div ref={pagerRef} className="mt-3">
            <Coluna
              {...COLUNAS.find((c) => c.estado === colunaMovel)}
              semCabecalho
              compacto
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
          <p className="mt-2.5 text-[11.5px] text-faint">
            Segure para arrastar entre estados.
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
  titulo, estado: col, tarefas, semCabecalho, compacto,
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
      className={cx('px-coluna flex min-h-[200px] flex-col')}
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

      <div className="flex-1 space-y-1">
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
              compacto={compacto}
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
// ---------------------------------------------------------------------------
// O CARTAO.
//
// UX1.2.1 — no telefone ele estava virando FICHA ADMINISTRATIVA: cinco
// etiquetas, avatar, selo e origem, tudo ao mesmo tempo, num objeto de 5cm.
//
// A versao compacta segue uma regra simples: MOSTRAR O QUE DECIDE.
//   . titulo;
//   . uma linha com QUANDO e, quando pertinente, prioridade e quem responde;
//   . uma terceira linha SO quando ha excecao — bloqueada, devolvida,
//     aguardando aceite. Se nada esta travado, a linha nao existe.
// Contexto, alerta, passos e origem continuam na tarefa; aparecem ao abrir.
// ---------------------------------------------------------------------------
function CartaoTarefa({ t, arrastando, aoAbrir, aoMover, setArrasto, coluna, compacto }) {
  if (compacto) {
    return (
      <CartaoCompacto
        t={t}
        arrastando={arrastando}
        aoAbrir={aoAbrir}
        aoMover={aoMover}
        setArrasto={setArrasto}
        coluna={coluna}
      />
    )
  }
  return (
    <CartaoCompleto t={t} arrastando={arrastando} aoAbrir={aoAbrir} aoMover={aoMover} setArrasto={setArrasto} coluna={coluna} />
  )
}

function CartaoCompleto({ t, arrastando, aoAbrir, aoMover, setArrasto, coluna }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const feito = t.estado === ESTADO.FEITO
  const atrasada = t.prazo && t.prazo < estado.hoje && !feito
  const feitos = t.subtarefas?.filter((s) => s.feito).length || 0

  // Duas linhas de meta, e so quando ha o que dizer: QUANDO (dia, prazo,
  // horario reservado) e ONDE/COMO (contexto, prioridade, lembrete, origem).
  // Um cartao com tres linhas de etiqueta vira ficha; um sem nenhuma obriga a
  // abrir tudo para decidir.
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
          className="mt-px"
        />
        <button type="button" onClick={() => aoAbrir(t)} className="min-w-0 flex-1 text-left">
          <span className={cx('block text-[13.5px] font-medium leading-[1.3]', feito && 'line-through')}>
            {t.titulo}
          </span>

          <span className="px-motivo mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {atrasada ? (
              <span className="font-medium text-warning">atrasada · {rotuloDeData(t.prazo, estado.hoje)}</span>
            ) : t.reserva ? (
              <span className="inline-flex items-center gap-1 font-medium text-accent-text">
                <CalendarClock size={11} />
                <span className="px-hora">{rotuloDeData(t.reserva.data, estado.hoje)} {t.reserva.inicio}–{t.reserva.fim}</span>
              </span>
            ) : t.planejadaPara ? (
              <span>{rotuloDeData(t.planejadaPara, estado.hoje)}</span>
            ) : (
              <span className="text-faint">sem data</span>
            )}
            {t.prazo && !atrasada && !t.reserva && (
              <span>prazo {rotuloDeData(t.prazo, estado.hoje)}</span>
            )}
            {t.prioridade === 'alta' && <span className="text-danger">alta</span>}
            {t.bloqueio && (
              <span className="inline-flex items-center gap-0.5 font-medium text-danger">
                <Ban size={10} /> bloqueada
              </span>
            )}
          </span>

          {(t.contexto || t.alerta || t.origemId || t.subtarefas?.length > 0) && (
            <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-faint">
              {t.contexto && <span>{t.contexto}</span>}
              {t.alerta && (
                <span className="inline-flex items-center gap-0.5"><Bell size={10} /> {alertaCurto(t.alerta)}</span>
              )}
              {t.subtarefas?.length > 0 && <span>{feitos}/{t.subtarefas.length} passos</span>}
              {t.origemId && (
                <span className="inline-flex items-center gap-0.5 text-accent-text"><CornerUpRight size={10} /> origem</span>
              )}
            </span>
          )}

          {/* Quem responde por isto. Só aparece quando não sou eu — um avatar em
              toda tarefa seria ruído numa agenda pessoal. */}
          {!ehMinha(t) || t.delegadorId ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pessoa id={t.responsavelId} />
              <SeloResponsabilidade t={t} />
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={`Mover ${t.titulo}`}
          onClick={() => aoMover(t)}
          className="press -mr-1 -mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-[6px] text-muted transition hover:bg-surface-2 hover:text-primary"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    </div>
  )
}


// A versão do telefone. Mesmo objeto, mesma pega, menos ruído.
function CartaoCompacto({ t, arrastando, aoAbrir, aoMover, setArrasto, coluna }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const feito = t.estado === ESTADO.FEITO
  const atrasada = t.prazo && t.prazo < estado.hoje && !feito
  const meu = (t.responsavelId || 'p-tarsis') === 'p-tarsis'

  // A EXCEÇÃO — e só ela ganha a terceira linha.
  // O motivo do bloqueio inteiro não cabe num selo de cartão — e não precisa:
  // o que o cartão tem de dizer é QUE está travada. O porquê está no detalhe.
  const excecao = t.bloqueio
    ? { texto: 'bloqueada', classe: 'px-selo-bloqueada' }
    : t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
      ? { texto: 'devolvida', classe: 'px-selo-devolvida' }
      : t.responsabilidade === RESPONSABILIDADE.AGUARDANDO
        ? { texto: 'aguardando aceite', classe: 'px-selo-aguardando' }
        : null

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
      <div className="flex items-start gap-2.5">
        <Marcar
          feito={feito}
          label={feito ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
          onClick={() => acoes.mudarEstado(t.id, feito ? ESTADO.A_FAZER : ESTADO.FEITO)}
          className="mt-0.5"
        />
        <button type="button" onClick={() => aoAbrir(t)} className="min-w-0 flex-1 text-left">
          <span className={cx('block text-[14px] font-medium leading-[1.35]', feito && 'line-through')}>
            {t.titulo}
          </span>

          <span className="px-motivo mt-1 flex flex-wrap items-center gap-x-2">
            {atrasada ? (
              <span className="font-medium text-warning">atrasada · {rotuloDeData(t.prazo, estado.hoje)}</span>
            ) : t.reserva ? (
              <span className="px-hora inline-flex items-center gap-1 font-medium text-accent-text">
                <CalendarClock size={11} />
                {rotuloDeData(t.reserva.data, estado.hoje)} {t.reserva.inicio}
              </span>
            ) : t.planejadaPara ? (
              <span>{rotuloDeData(t.planejadaPara, estado.hoje)}</span>
            ) : t.prazo ? (
              <span>prazo {rotuloDeData(t.prazo, estado.hoje)}</span>
            ) : (
              <span className="text-faint">sem data</span>
            )}
            {t.prioridade === 'alta' && <span className="text-danger">alta</span>}
            {!meu && <Pessoa id={t.responsavelId} />}
          </span>

          {excecao && (
            <span className={cx('px-selo mt-1.5 max-w-full truncate', excecao.classe)}>{excecao.texto}</span>
          )}
        </button>
        <button
          type="button"
          aria-label={`Ações de ${t.titulo}`}
          onClick={() => aoMover(t)}
          className="press -mr-1 grid h-8 w-8 flex-none place-items-center rounded-[8px] text-muted"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  )
}

// "Mover para..." — no toque e a via principal, nao o plano B.
//
// A folha reune as duas acoes rapidas do cartao, e elas ficam em blocos
// separados de proposito: MOVER e execucao, DELEGAR e responsabilidade. Junta-
// las numa lista so faria "Concluído" e "Rubens" parecerem a mesma especie de
// escolha.
function MoverPara({ tarefa, aoFechar }) {
  const acoes = useAcoes()
  const [delegando, setDelegando] = useState(false)
  if (!tarefa) return null
  if (delegando) {
    return (
      <EscolherPessoa
        aberta
        t={tarefa}
        aoFechar={() => { setDelegando(false); aoFechar() }}
        aoEscolher={(id) => { acoes.delegar(tarefa.id, id); setDelegando(false); aoFechar() }}
      />
    )
  }
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

      <div className="mt-4 border-t border-hairline pt-4">
        <p className="px-secao mb-2">Responsabilidade</p>
        <button
          type="button"
          onClick={() => setDelegando(true)}
          className="press flex w-full items-center gap-3 rounded-row border border-hairline px-4 py-3 text-left text-[14.5px] transition hover:border-accent hover:text-accent-text"
        >
          <Pessoa id={tarefa.responsavelId} />
          <span className="flex-1">Delegar…</span>
        </button>
      </div>
    </Folha>
  )
}

function Lista({ tarefas, aoAbrir, aoMover }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
  const abertas = tarefas.filter((t) => t.estado !== ESTADO.FEITO)
  const feitas = tarefas.filter((t) => t.estado === ESTADO.FEITO)

  // A lista existe para VARRER muitos itens — por isso é mais densa que o
  // quadro, e no desktop alinha por coluna: o olho desce a mesma faixa em vez
  // de caçar a informação dentro de cada linha.
  const COLUNAS_GRADE = 'minmax(0,1fr) 118px 96px 110px 104px 84px'

  const linha = (t) => {
    const feito = t.estado === ESTADO.FEITO
    const atrasada = t.prazo && t.prazo < estado.hoje && !feito
    return (
      <div
        key={t.id}
        className={cx('px-tabela-linha', feito && 'opacity-60')}
        style={desktop ? { gridTemplateColumns: COLUNAS_GRADE } : undefined}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Marcar
            feito={feito}
            label={feito ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
            onClick={() => acoes.mudarEstado(t.id, feito ? ESTADO.A_FAZER : ESTADO.FEITO)}
          />
          <button type="button" onClick={() => aoAbrir(t)} className="min-w-0 flex-1 text-left">
            <span className={cx('block truncate text-[13.5px]', feito && 'line-through')}>{t.titulo}</span>
            {!desktop && (
              <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
                {atrasada ? (
                  <span className="text-warning">atrasada</span>
                ) : t.reserva ? (
                  <span className="text-accent-text">{rotuloDeData(t.reserva.data, estado.hoje)} {t.reserva.inicio}</span>
                ) : t.planejadaPara ? (
                  <span>{rotuloDeData(t.planejadaPara, estado.hoje)}</span>
                ) : (
                  <span className="text-faint">sem data</span>
                )}
                {t.prioridade === 'alta' && <span className="text-danger">alta</span>}
                {t.contexto && <span>{t.contexto}</span>}
              </span>
            )}
          </button>
        </div>

        {desktop && (
          <>
            <span className="px-motivo truncate">
              {t.estado === ESTADO.FAZENDO ? 'em andamento' : feito ? 'concluído' : 'a fazer'}
            </span>
            <span className={cx('px-motivo truncate', atrasada && 'font-medium text-warning')}>
              {atrasada
                ? `prazo ${rotuloDeData(t.prazo, estado.hoje)}`
                : t.planejadaPara
                  ? rotuloDeData(t.planejadaPara, estado.hoje)
                  : t.prazo
                    ? `prazo ${rotuloDeData(t.prazo, estado.hoje)}`
                    : 'sem data'}
            </span>
            <span className="px-motivo truncate">
              {t.reserva ? (
                <span className="px-hora inline-flex items-center gap-1 text-accent-text">
                  <CalendarClock size={11} /> {t.reserva.inicio}–{t.reserva.fim}
                </span>
              ) : (
                t.contexto || '—'
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Pessoa id={t.responsavelId} />
              <SeloResponsabilidade t={t} />
            </span>
            <span className="flex items-center justify-end gap-1">
              {t.prioridade === 'alta' && <span className="px-motivo text-danger">alta</span>}
              <button
                type="button"
                aria-label={`Mover ${t.titulo}`}
                onClick={() => aoMover(t)}
                className="press grid h-6 w-6 place-items-center rounded-[6px] text-muted transition hover:bg-surface hover:text-primary"
              >
                <MoreHorizontal size={15} />
              </button>
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4">
      {desktop && (
        <div
          className="grid gap-3 border-b border-hairline px-2 pb-1.5"
          style={{ gridTemplateColumns: COLUNAS_GRADE }}
        >
          <span className="px-secao">Atividade</span>
          <span className="px-secao">Situação</span>
          <span className="px-secao">Quando</span>
          <span className="px-secao">Contexto</span>
          <span className="px-secao">Quem responde</span>
          <span className="px-secao text-right">Ações</span>
        </div>
      )}

      {abertas.length === 0 && <Vazio>Nenhuma atividade com esses filtros.</Vazio>}
      {abertas.map(linha)}

      {feitas.length > 0 && (
        <>
          <h2 className="px-secao mt-5 px-2 pb-1">Concluído · {feitas.length}</h2>
          {feitas.map(linha)}
        </>
      )}
    </div>
  )
}
