import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MoreHorizontal, Check, CalendarClock, Bell, CornerUpRight, Ban, LayoutGrid, List as ListIcon, ChevronRight } from 'lucide-react'
import { useProto, useDesktop, useAcoes } from '../store/contexto'
import { colunaDe, ehMinha, delegadasPorMim, recebidas } from '../store/reducer'
import { ESTADO, RESPONSABILIDADE, rotuloDeData } from '../mock/dados'
import { Vazio, Chip, Botao, Folha, Marcar } from '../parts/base'
import { Seletor, BotaoDeFiltros, MenuAcoes, TituloDeTela } from '../parts/movel'
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
// Espelha `ZONA_BORDA_PX` do hook do produto, que não a exporta. Se as duas
// discordarem, o quadro anda numa faixa e o alvo muda noutra.
const ZONA_BORDA_PX = 64

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
  // O quadro do telefone é um PAGER: as três colunas existem no DOM ao mesmo
  // tempo, uma em foco por vez. `etapa` é o índice da coluna em foco.
  const [etapa, setEtapa] = useState(0)
  const [form, setForm] = useState(null)      // { tarefa } | { padroes }
  const [mover, setMover] = useState(null)    // tarefa
  const [arrasto, setArrasto] = useState(null) // { id, coluna, antesDe }
  const pagerRef = useRef(null)
  const colunaRefs = useRef([])
  const etapaRef = useRef(0)
  const irParaEtapaRef = useRef(null)
  // ALVO DO ARRASTO NO TOQUE — coluna e posição, decididos pelo protótipo (ver
  // `Observador`, abaixo). O ref é o que o `onDrop` lê; o estado é o que a tela
  // pinta. São a mesma informação, separados só porque um gesto não pode
  // depender de um render para saber onde soltar.
  const alvoRef = useRef({ coluna: null, antesDe: null })
  const [alvoToque, setAlvoToque] = useState({ coluna: null, antesDe: null })
  const [bordaAtiva, setBordaAtiva] = useState(0)
  const animacao = useRef(0)
  etapaRef.current = etapa

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

  // -------------------------------------------------------------------------
  // PAGER — ler o scroll para saber a coluna em foco; tocar na etapa para
  // escrever o scroll. É a mesma mecânica do quadro do produto: o deslize é o
  // scroll nativo do iOS, com inércia e rubber-band, e não um gesto próprio
  // disputando o dedo com a rolagem vertical.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = pagerRef.current
    if (!el || desktop) return undefined
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
          if (dist < menor) { menor = dist; melhor = i }
        })
        setEtapa(melhor)
      })
    }
    el.addEventListener('scroll', ler, { passive: true })
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', ler) }
  }, [desktop, visao])

  const irParaEtapa = useCallback((i, { comOToqueAtivo = false } = {}) => {
    const node = colunaRefs.current[i]
    const el = pagerRef.current
    if (!node || !el) return
    const destino = node.offsetLeft - (el.clientWidth - node.offsetWidth) / 2
    cancelAnimationFrame(animacao.current)
    if (!comOToqueAtivo) {
      el.scrollTo({ left: destino, behavior: 'smooth' })
    } else {
      // COM O DEDO ENCOSTADO O QUADRO ANDA POR NOSSA CONTA.
      // `behavior: 'smooth'` é uma animação do navegador sobre o mesmo scroller
      // em que há um toque ativo — e o WebKit trata toque no scroller como
      // motivo para descartar a animação. Ou seja: o quadro deixaria de andar
      // exatamente no momento em que PRECISA andar, que é com um cartão na mão.
      // Escrever `scrollLeft` quadro a quadro não depende dessa arbitragem.
      const inicio = el.scrollLeft
      const t0 = performance.now()
      const passo = (t) => {
        const p = Math.min(1, (t - t0) / 260)
        el.scrollLeft = inicio + (destino - inicio) * (1 - (1 - p) ** 3)
        if (p < 1) animacao.current = requestAnimationFrame(passo)
      }
      animacao.current = requestAnimationFrame(passo)
    }
    setEtapa(i)
  }, [])
  irParaEtapaRef.current = irParaEtapa

  // ---------------------------------------------------------------------------
  // AVANÇO DE BORDA, COM ESPERA.
  //
  // O hook do produto avisa assim que o dedo entra na faixa da borda — o
  // primeiro aviso é imediato. Trocar de coluna nesse instante é o que torna a
  // troca acidental: basta passar perto da borda a caminho de outra coisa.
  //
  // A ESPERA mora aqui, e não no hook, porque o hook é código do produto e o
  // quadro real depende dele. O prototipo é quem DECIDE quando agir: exige dois
  // avisos seguidos na mesma direção (o hook os espaça em ~620ms), o que dá um
  // dwell curto antes do primeiro salto e um salto por vez depois disso. Perder
  // o contato com a borda ou inverter a direção zera a contagem.
  // ---------------------------------------------------------------------------
  const borda = useRef({ dir: 0, avisos: 0, em: 0 })

  const avancarEtapa = useCallback((dir) => {
    const agora = Date.now()
    const b = borda.current
    // Aviso muito depois do anterior, ou para o outro lado: recomeça a contagem.
    if (b.dir !== dir || agora - b.em > 1100) borda.current = { dir, avisos: 1, em: agora }
    else borda.current = { dir, avisos: b.avisos + 1, em: agora }
    if (borda.current.avisos < 2) return
    // Avancou: a contagem recomeca. Sem isto, continuar encostado atravessaria
    // uma coluna a cada aviso do hook; com isto, cada travessia pede um novo
    // dwell — da para atravessar duas colunas sem soltar, uma decisao por vez.
    borda.current = { dir, avisos: 0, em: agora }

    const i = Math.min(COLUNAS.length - 1, Math.max(0, etapaRef.current + dir))
    if (i === etapaRef.current) return
    etapaRef.current = i
    irParaEtapaRef.current?.(i, { comOToqueAtivo: true })
  }, [])

  // --- toque: o mesmo gesto validado no produto -----------------------------
  const toque = useTouchCardDrag({
    pagerRef,
    enabled: !desktop && visao === 'quadro',
    // A MESMA função de mover do arrasto de desktop e do "Mover para…". Quem
    // diz ONDE é o observador abaixo; o hook entrega a coluna sob o dedo como
    // reserva, para o caso de soltar sem ter movido.
    onDrop: (taskId, colunaDoHook) => {
      const { coluna, antesDe } = alvoRef.current
      const destino = coluna ?? colunaDoHook
      const tarefa = estado.tarefas.find((t) => t.id === taskId)
      // Levantar e soltar no mesmo lugar não é movimento: não reordena nada.
      if (destino && !(destino === tarefa?.estado && !antesDe)) {
        acoes.moverTarefa(taskId, destino, antesDe)
      }
      alvoRef.current = { coluna: null, antesDe: null }
      setAlvoToque({ coluna: null, antesDe: null })
      setBordaAtiva(0)
      borda.current = { dir: 0, avisos: 0, em: 0 }
    },
    onAdvance: avancarEtapa,
  })

  // -------------------------------------------------------------------------
  // OBSERVADOR DE ALVO (UX1.2.1 → UX1.2.2 → UX1.2.2.1).
  //
  // O hook do produto entrega "solte a tarefa X na coluna Y", e Y é a coluna
  // que estiver sob o dedo. Isso é certo no meio do quadro e ERRADO na borda:
  // ali o dedo já está sobre a FRESTA da coluna vizinha, que ainda não entrou
  // em foco — soltar naquele ponto derruba o cartão numa coluna que o usuário
  // nem está vendo. Foi o que obrigou o QA anterior a "voltar para dentro antes
  // de soltar", e um gesto que precisa de instrução não está pronto.
  //
  // Então o protótipo decide: na faixa da borda vale a coluna EM FOCO; fora
  // dela, a coluna sob o dedo. O mesmo listener lê a posição de inserção e
  // acende a fresta da borda. Ele é PASSIVO: não chama `preventDefault`, não
  // tem máquina de estados e não disputa o dedo com ninguém.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = pagerRef.current
    if (!el || desktop || !toque.taskId) return undefined

    const aplicar = (coluna, antesDe) => {
      const a = alvoRef.current
      if (a.coluna === coluna && a.antesDe === antesDe) return
      alvoRef.current = { coluna, antesDe }
      setAlvoToque({ coluna, antesDe })
    }

    const ler = (e) => {
      const t = e.touches?.[0]
      if (!t) return
      const r = el.getBoundingClientRect()
      const lado = t.clientX > r.right - ZONA_BORDA_PX ? 1 : t.clientX < r.left + ZONA_BORDA_PX ? -1 : 0
      setBordaAtiva(lado)
      // SAIR DA BORDA ZERA A CONTAGEM. O hook so avisa quando o dedo esta na
      // faixa, e nunca avisa que saiu — sem este reset, voltar para o meio do
      // quadro devagar ainda somava um aviso e o quadro andava mais uma coluna
      // depois de o usuario ja ter decidido parar.
      if (!lado) borda.current = { dir: 0, avisos: 0, em: 0 }

      const sob = document.elementFromPoint(t.clientX, t.clientY)
      const colunaSob = sob?.closest?.('[data-testid^="board-column-"]')
      // Fora de qualquer coluna não há destino: é assim que se desiste sem
      // levantar o dedo sobre a coluna errada.
      if (!colunaSob) { aplicar(null, null); return }

      const coluna = lado
        ? COLUNAS[etapaRef.current].estado
        : colunaSob.dataset.testid.replace('board-column-', '')

      // Metade de cima do cartão sob o dedo: entra ANTES dele; metade de baixo:
      // depois. Na borda não há posição — o destino ali é a coluna, não o ponto.
      let antesDe = null
      const cartao = lado ? null : sob?.closest?.('[data-task-id]')
      if (cartao && cartao.dataset.taskId !== toque.taskId) {
        const rc = cartao.getBoundingClientRect()
        const irmaos = [...colunaSob.querySelectorAll('[data-task-id]')]
        const i = irmaos.indexOf(cartao)
        antesDe = t.clientY < rc.top + rc.height / 2
          ? cartao.dataset.taskId
          : irmaos[i + 1]?.dataset.taskId ?? null
      }
      aplicar(coluna, antesDe)
    }

    el.addEventListener('touchmove', ler, { passive: true })
    return () => el.removeEventListener('touchmove', ler)
  }, [desktop, toque.taskId])

  const alternarFiltro = (f) =>
    setFiltros((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))

  const soltar = (coluna) => {
    if (!arrasto) return
    acoes.moverTarefa(arrasto.id, coluna, arrasto.antesDe)
    setArrasto(null)
  }

  // Um cartão está na mão — por mouse no desktop ou por dedo no telefone.
  const arrastando = Boolean(arrasto || toque.taskId)

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

          {/* BARRA DE ETAPAS — diz o nome, a quantidade e a POSIÇÃO no fluxo.
              As setas entre os nomes são o que impede isto de virar outra barra
              de filtros: A fazer → Em andamento → Concluído é uma sequência, e
              o quadro embaixo se move na mesma direção. Sem caixa, sem borda:
              só a etapa em foco recebe peso. */}
          {visao === 'quadro' && (
            <div
              role="tablist"
              aria-label="Etapa do fluxo"
              data-testid="board-stages"
              className="no-scrollbar mt-3 flex items-center gap-1 overflow-x-auto"
            >
              {COLUNAS.map((c, i) => (
                <div key={c.estado} className="flex flex-none items-center">
                  {i > 0 && <ChevronRight size={13} className="mx-0.5 flex-none text-faint" aria-hidden="true" />}
                  <button
                    role="tab"
                    aria-selected={i === etapa}
                    onClick={() => irParaEtapa(i)}
                    className={cx(
                      'press flex min-h-[38px] items-center gap-1.5 rounded-control px-2.5 text-[13px] transition',
                      i === etapa ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted',
                    )}
                  >
                    {c.curto}
                    <span className={cx('px-hora text-[12px]', i === etapa ? 'opacity-80' : 'text-faint')}>
                      {porColuna(c.estado).length}
                    </span>
                  </button>
                </div>
              ))}
            </div>
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
          {/* O QUADRO NO TELEFONE.
              As três colunas existem ao mesmo tempo; cada uma ocupa 90% da
              largura útil e os 10% restantes mostram uma FRESTA da vizinha — o
              bastante para dizer "há mais para o lado" sem virar uma segunda
              coluna disputando a leitura. É o que devolve a sensação de QUADRO
              que o seletor de estado tinha perdido: mover deixa de parecer
              trocar um campo e volta a ser atravessar um espaço.

              O encaixe (`snap`) sai de cena enquanto um cartão está na mão: com
              ele ligado, o avanço de borda e o encaixe disputam o mesmo scroll e
              o quadro treme entre duas colunas. */}
          <div className="relative -mx-4 mt-3">
          <div
            ref={pagerRef}
            data-testid="board-pager"
            className={cx(
              'no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain px-4',
              arrastando ? 'snap-none' : 'snap-x snap-mandatory',
            )}
          >
            {COLUNAS.map((c, i) => (
              <div
                key={c.estado}
                ref={(n) => (colunaRefs.current[i] = n)}
                className="flex w-[92%] shrink-0 snap-center flex-col"
              >
                <Coluna
                  {...c}
                  semCabecalho
                  compacto
                  tarefas={porColuna(c.estado)}
                  arrastandoToque={toque.taskId}
                  alvoToque={alvoToque.coluna}
                  insercaoToque={alvoToque.coluna === c.estado ? alvoToque.antesDe : null}
                  arrasto={arrasto}
                  setArrasto={setArrasto}
                  aoSoltar={soltar}
                  aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)}
                  aoMover={setMover}
                  aoAdicionar={() => setForm({ padroes: { estado: c.estado } })}
                />
              </div>
            ))}
          </div>

            {/* As frestas só existem com um cartão na mão: fora do arrasto a
                borda não faz nada e não deve prometer nada. */}
            {toque.taskId && etapa > 0 && (
              <div className="px-borda px-borda-esq" data-testid="borda-esq" data-ativa={bordaAtiva === -1 ? 'true' : 'false'} />
            )}
            {toque.taskId && etapa < COLUNAS.length - 1 && (
              <div className="px-borda px-borda-dir" data-testid="borda-dir" data-ativa={bordaAtiva === 1 ? 'true' : 'false'} />
            )}
          </div>
          <p className="mt-2.5 text-[11.5px] text-faint">
            Deslize para mudar de coluna. Segure um cartão para arrastá-lo entre elas.
          </p>
        </>
      )}

      <TarefaForm
        aberta={Boolean(form)}
        aoFechar={() => setForm(null)}
        tarefa={form?.tarefa}
        padroes={form?.padroes || {}}
      />

      <MoverPara
        tarefa={mover}
        aoFechar={() => setMover(null)}
        aoAbrir={(t) => navegar(`/prototipo/tarefas/${t.id}`)}
        aoEditar={(t) => setForm({ tarefa: t })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function Coluna({
  titulo, estado: col, tarefas, semCabecalho, compacto,
  arrasto, setArrasto, aoSoltar, aoAbrir, aoMover, aoAdicionar,
  arrastandoToque, alvoToque, insercaoToque,
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
            {arrasto || arrastandoToque ? 'Solte aqui' : 'Nada aqui'}
          </p>
        )}

        {tarefas.map((t) => (
          <div key={t.id} onDragOver={(e) => sobre(e, t.id)}>
            {/* A MESMA linha de inserção do mouse serve ao dedo: onde o cartão
                vai cair, dito uma vez só. */}
            {((arrasto?.coluna === col && arrasto?.antesDe === t.id) || insercaoToque === t.id) && (
              <div className="px-insercao" />
            )}
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
          className={cx('rounded-[10px] transition-all', arrasto || arrastandoToque ? 'h-9' : 'h-1')}
        >
          {((arrasto?.coluna === col && !arrasto?.antesDe) ||
            (alvoToque === col && !insercaoToque && arrastandoToque)) && <div className="px-insercao" />}
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
//
// UX1.2.2 — UMA LINHA DE META, E SÓ UMA.
//
// O cartão tinha até três camadas: quando + prioridade + rosto, e embaixo um
// selo de exceção. Quatro informações simultâneas num objeto de 5cm é uma
// ficha, não um cartão.
//
// A regra agora é: o que muda a decisão AGORA ganha a linha; o resto está no
// detalhe, a um toque. Quando a tarefa está travada — bloqueada, devolvida,
// esperando aceite — é ISSO que decide, e a linha é dela. Quando não está, a
// linha é o quando, com prioridade e responsável só se acrescentarem algo.
//
// Sem chips: texto corrido separado por "·". Chip é para estado selecionável,
// não para enfeitar metadado.
function CartaoCompacto({ t, arrastando, aoAbrir, aoMover }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const feito = t.estado === ESTADO.FEITO
  const atrasada = t.prazo && t.prazo < estado.hoje && !feito
  const meu = (t.responsavelId || 'p-tarsis') === 'p-tarsis'
  const pessoa = estado.pessoas?.find((p) => p.id === t.responsavelId)

  // A EXCEÇÃO manda na linha quando existe.
  const excecao = t.bloqueio
    ? { texto: `Bloqueada · ${t.bloqueio}`, tom: 'text-danger' }
    : t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
      ? { texto: 'Devolvida · precisa de decisão', tom: 'text-danger' }
      : t.responsabilidade === RESPONSABILIDADE.AGUARDANDO
        ? { texto: `Aguardando aceite${pessoa && !pessoa.eu ? ` · ${pessoa.nome}` : ''}`, tom: 'text-warning' }
        : null

  // Atraso também é condição que pede decisão — entra com o mesmo peso.
  const linha = excecao || (atrasada
    ? { texto: `Atrasada · ${rotuloDeData(t.prazo, estado.hoje)}`, tom: 'text-warning' }
    : null)

  // Sem exceção: quando, e só o que ajuda a decidir junto dele.
  const quando = atrasada
    ? null
    : t.reserva
      ? `${rotuloDeData(t.reserva.data, estado.hoje)} · ${t.reserva.inicio}`
      : t.planejadaPara
        ? rotuloDeData(t.planejadaPara, estado.hoje)
        : t.prazo
          ? `Prazo ${rotuloDeData(t.prazo, estado.hoje)}`
          : null
  const partes = [
    quando,
    t.prioridade === 'alta' && !atrasada ? 'Alta' : null,
    !meu && pessoa ? pessoa.nome : null,
  ].filter(Boolean)

  return (
    // Sem `draggable`: no telefone o arrasto é por toque, e o atributo trazia
    // junto a folha do navegador — a mesma de onde vinha, por acidente, a única
    // proteção contra a seleção de texto do iOS (ver `prototype.css`).
    <div
      data-task-id={t.id}
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
          {/* A cor vem por classe utilitária, e por isso a linha NÃO usa
              `px-motivo` quando há tom: `px-motivo` define `color` e venceria a
              utilitária por ordem de folha, apagando justamente o destaque. */}
          {(linha || partes.length > 0) && (
            <span
              className={cx(
                'mt-1 block truncate text-[12px]',
                linha ? `font-medium ${linha.tom}` : 'px-motivo',
              )}
            >
              {linha ? linha.texto : partes.join(' · ')}
            </span>
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

// ---------------------------------------------------------------------------
// AÇÕES DO CARTÃO — o "..." do telefone.
//
// MOVER continua sendo a via explícita ao gesto: o arrasto nunca pode ser a
// única maneira. Ele abre primeiro e a coluna atual vem marcada.
//
// O resto do que se faz com uma tarefa — abrir, editar, delegar, reservar
// horário, excluir — mora aqui em vez de na superfície do cartão. São ações que
// dependem do contexto e que ninguém procura no meio de uma lista; tê-las
// permanentemente à vista era metade do ruído.
// ---------------------------------------------------------------------------
function MoverPara({ tarefa, aoFechar, aoAbrir, aoEditar }) {
  const acoes = useAcoes()
  const { estado } = useProto()
  const [delegando, setDelegando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
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

  const pessoa = estado.pessoas?.find((p) => p.id === tarefa.responsavelId)
  const secundarias = [
    { rotulo: 'Abrir tarefa', fazer: () => aoAbrir?.(tarefa) },
    { rotulo: 'Editar', fazer: () => aoEditar?.(tarefa) },
    {
      rotulo: pessoa && !pessoa.eu ? `Trocar responsável (${pessoa.nome})` : 'Delegar…',
      // Esta NÃO fecha a folha: ela troca o conteúdo dela pelo seletor de
      // pessoa. Fechar antes desmontaria o componente e o seletor nunca abriria.
      manterAberta: true,
      fazer: () => setDelegando(true),
    },
    tarefa.planejadaPara && !tarefa.reserva
      ? { rotulo: 'Reservar horário', fazer: () => acoes.reservarHorario(tarefa.id, tarefa.planejadaPara, '09:00', '10:00') }
      : tarefa.reserva
        ? { rotulo: 'Retirar horário reservado', fazer: () => acoes.retirarReserva(tarefa.id) }
        : null,
  ].filter(Boolean)

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

      <div className="mt-4 space-y-1 border-t border-hairline pt-4">
        {secundarias.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => { if (!a.manterAberta) aoFechar(); a.fazer() }}
            className="press flex w-full items-center rounded-row px-4 py-2.5 text-left text-[14px] text-secondary transition hover:bg-surface-2"
          >
            {a.rotulo}
          </button>
        ))}
        {confirmando ? (
          <div className="flex items-center gap-2 px-1 pt-1">
            <Botao variante="perigo" onClick={() => { acoes.excluirTarefa(tarefa.id); aoFechar() }}>
              Excluir mesmo
            </Botao>
            <Botao variante="fantasma" onClick={() => setConfirmando(false)}>Cancelar</Botao>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="press flex w-full items-center rounded-row px-4 py-2.5 text-left text-[14px] text-danger transition hover:bg-danger/5"
          >
            Excluir
          </button>
        )}
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
