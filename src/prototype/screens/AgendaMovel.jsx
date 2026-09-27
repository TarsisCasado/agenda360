import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, UtensilsCrossed, Landmark,
  Presentation, UserRound, Lock, Check, Plus, AlertTriangle, MapPin, Bell,
} from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import {
  VISOES, semanaDe, eventosDoDia, semHorario, corDoEvento, situacaoDoEvento,
  faixaDeHoras, posicaoNaGrade, gradeDoMes, temConflito, disposicaoDoDia,
  recorteDaSemana, andarNoRecorte, detalheDoBloco, faixaDoBloco,
  PX_HORA_SEMANA, ALTURA_MINIMA_BLOCO,
} from '../store/agendaM3'
import {
  ESTADO, AGORA_DEMO, somarDias, iso, diaCurto, nomeDoDia, numeroDoDia,
  mesPorExtenso, mesCurto, rotuloDeData, emMinutos,
} from '../mock/dados'
import { alertaCurto } from '../mock/alerta'
import CompromissoForm from '../forms/CompromissoForm'
import TopoMovel from '../parts/topoMovel'
import DetalheMovel from '../parts/detalheMovel'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// AGENDA NO TELEFONE — A DIRECAO VISUAL APROVADA (UX-M3).
//
// Esta tela e a continuacao do Hoje (UX-M2): mesmo fundo, mesma tipografia,
// mesmas superficies, mesma barra de baixo. Trocar de destino nao pode parecer
// trocar de aplicativo.
//
// O que muda e a PERGUNTA, e cada visao responde a sua:
//
//   DIA     "o que acontece hoje e quando?"
//           Uma linha do tempo: hora a esquerda, um ponto no fio, o objeto a
//           direita. Os blocos nao sao cartoes soltos — eles pendem do mesmo
//           fio, que e o que faz a sequencia virar um dia.
//
//   SEMANA  "como e minha semana, e o que acontece nestes dias?"
//           Duas pecas (UX-M3.1): a faixa com os SETE dias em cima, para a
//           percepcao do todo, e uma grade temporal de TRES dias embaixo, onde
//           altura = duracao e o titulo volta a ser legivel. A grade de sete
//           colunas simultaneas foi abandonada porque so cabia com texto de
//           9,5px — a representacao passa a se adaptar ao conteudo.
//
//   MES     "onde ha atividade, e o que tem nesse dia?"
//           Um calendario limpo com pontos, e a agenda do dia escolhido
//           ABAIXO dele. O mes nunca vira miniagenda, e escolher um dia nao
//           cobre o calendario com um modal: o contexto espacial fica.
//
// COR: classificacao visual, nunca ranking. O mapa esta em `store/agendaM3`,
// e fechado, e sai de dado que ja existe (especie + categoria).
// ---------------------------------------------------------------------------

const ICONES = {
  Operação: Users,
  Comercial: UtensilsCrossed,
  Financeiro: Landmark,
  Diretoria: Presentation,
  // Pessoal e a categoria mais heterogenea do mock (dentista, treino): um
  // icone de atividade especifica mentiria na metade dos casos.
  Pessoal: UserRound,
}
const iconeDoEvento = (e) => (e.especie === 'reserva' ? Lock : ICONES[e.categoria] || CalendarDays)

const capitalizar = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)
const dataPorExtenso = (d) => `${capitalizar(nomeDoDia(d))}, ${numeroDoDia(d)} de ${mesPorExtenso(d)}`

export default function AgendaMovel({ aoBuscar, aoMenu }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const navegar = useNavigate()
  const agora = AGORA_DEMO

  // `?dia=` continua valendo: e assim que o aviso de "guardado na agenda" e os
  // atalhos de outras telas chegam num dia especifico.
  const [params] = useSearchParams()
  const pedido = params.get('dia')
  const [visao, setVisao] = useState('dia')
  const [dia, setDia] = useState(pedido || estado.hoje)
  const [mesRef, setMesRef] = useState(() => {
    const base = new Date(`${estado.hoje}T12:00:00`)
    return { ano: base.getFullYear(), mes: base.getMonth() }
  })
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)
  const rolagem = useRef(null)

  const dias = semanaDe(dia)

  // Voltar do detalhe devolve a pessoa ao mesmo lugar — inclusive a rolagem.
  // Mesma mecanica do Hoje: a raiz fica travada enquanto a folha esta aberta,
  // e a reposicao aqui e garantia para quando o conteudo muda de altura.
  useLayoutEffect(() => {
    if (aberto || rolagem.current === null) return
    const y = rolagem.current
    rolagem.current = null
    if (Math.abs(window.scrollY - y) < 2) return
    window.scrollTo(0, y)
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [aberto])

  const abrir = (item) => {
    rolagem.current = window.scrollY
    setAberto(item)
  }

  const contexto = visao === 'dia'
    ? dataPorExtenso(dia)
    : visao === 'semana'
      ? `Semana de ${numeroDoDia(dias[0])} a ${numeroDoDia(dias[6])} de ${mesPorExtenso(dias[6])}`
      : `${capitalizar(mesPorExtenso(iso(new Date(mesRef.ano, mesRef.mes, 15))))} de ${mesRef.ano}`

  return (
    <div className="m2 relative -mt-3" data-testid="m3-agenda">
      <div className="m2-fundo" aria-hidden="true" />

      <div className="relative">
        <TopoMovel contexto={contexto} titulo="Agenda" aoBuscar={aoBuscar} aoMenu={aoMenu} />

        {/* O eixo da tela. Uma escolha so, sempre visivel, sem menu. */}
        <div className="m3-segmentos mt-4" role="tablist" aria-label="Visão da agenda">
          {VISOES.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={visao === v}
              data-testid={`m3-visao-${v}`}
              onClick={() => setVisao(v)}
              className={cx('m3-segmento', visao === v && 'm3-segmento-ativo')}
            >
              {v === 'mes' ? 'Mês' : capitalizar(v)}
            </button>
          ))}
        </div>

        {visao === 'dia' && (
          <VisaoDia
            estado={estado}
            dia={dia}
            agora={agora}
            aoDia={setDia}
            aoMes={() => setVisao('mes')}
            aoAbrir={abrir}
            aoConcluir={(id) => acoes.mudarEstado(id, ESTADO.FEITO)}
            aoNovo={() => setNovo(true)}
          />
        )}

        {visao === 'semana' && (
          <VisaoSemana
            estado={estado}
            dias={dias}
            dia={dia}
            agora={agora}
            aoDia={setDia}
            aoSemana={(delta) => setDia(iso(somarDias(new Date(`${dia}T12:00:00`), delta * 7)))}
            aoAbrir={abrir}
            aoConcluir={(id) => acoes.mudarEstado(id, ESTADO.FEITO)}
            aoVerDia={(d) => { setDia(d); setVisao('dia') }}
          />
        )}

        {visao === 'mes' && (
          <VisaoMes
            estado={estado}
            mesRef={mesRef}
            aoMes={setMesRef}
            dia={dia}
            aoDia={setDia}
            agora={agora}
            aoAbrir={abrir}
            aoConcluir={(id) => acoes.mudarEstado(id, ESTADO.FEITO)}
          />
        )}
      </div>

      <CompromissoForm aberta={novo} aoFechar={() => setNovo(false)} padroes={{ data: dia }} />

      <Detalhe
        item={aberto}
        estado={estado}
        acoes={acoes}
        aoVoltar={() => setAberto(null)}
        aoAbrirCompleto={(id) => navegar(`/prototipo/tarefas/${id}`)}
      />
    </div>
  )
}

// ===========================================================================
// DIA
// ===========================================================================
function VisaoDia({ estado, dia, agora, aoDia, aoMes, aoAbrir, aoConcluir, aoNovo }) {
  const eventos = eventosDoDia(estado, dia)
  const soltas = semHorario(estado, dia)
  const mover = (delta) => aoDia(iso(somarDias(new Date(`${dia}T12:00:00`), delta)))

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior" className="m2-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[15px] font-medium">{dataPorExtenso(dia)}</p>
        <button type="button" onClick={aoMes} aria-label="Ver no mês" className="m2-redondo h-9 w-9">
          <CalendarDays size={17} />
        </button>
      </div>

      {temConflito(estado, dia) && (
        <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-warning">
          <AlertTriangle size={14} className="flex-none" />
          Dois compromissos se sobrepõem neste dia.
        </p>
      )}

      {eventos.length === 0 && soltas.length === 0 && (
        <p className="mt-6 text-[15px] text-muted">Nada marcado neste dia.</p>
      )}

      {eventos.length > 0 && (
        <div className="relative mt-4" data-testid="m3-timeline">
          {/* O FIO. E ele que transforma cinco superficies soltas numa
              sequencia — e por isso ele passa por tras dos pontos, nao entre
              os blocos. */}
          <span className="m3-fio" aria-hidden="true" />
          {eventos.map((e) => (
            <LinhaDaTimeline key={e.id} e={e} agora={agora} aoAbrir={() => aoAbrir({ tipo: 'evento', dado: e })} />
          ))}
        </div>
      )}

      {soltas.length > 0 && (
        <SemHorario itens={soltas} aoAbrir={aoAbrir} aoConcluir={aoConcluir} />
      )}

      {/* A porta de criacao e o [+] da barra de baixo. Aqui fica so uma acao
          contextual discreta — a mesma intencao, com o dia ja escolhido, sem
          um segundo botao grande competindo com o primeiro. */}
      <button
        type="button"
        onClick={aoNovo}
        data-testid="m3-novo"
        className="press mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-text"
      >
        <Plus size={16} /> Novo compromisso neste dia
      </button>
    </>
  )
}

function LinhaDaTimeline({ e, agora, aoAbrir }) {
  const cor = corDoEvento(e)
  const situacao = situacaoDoEvento(e, agora)
  const Icone = iconeDoEvento(e)
  return (
    <div className="relative flex items-stretch gap-2 pb-2.5">
      <span className="px-hora w-[42px] flex-none pt-3 text-right text-[13px] text-muted">{e.inicio}</span>
      <span className={cx('m3-ponto', `m3-${cor}`)} aria-hidden="true" />
      <button
        type="button"
        onClick={aoAbrir}
        data-testid="m3-evento"
        className={cx('m3-evento press ml-3 min-w-0 flex-1 text-left', `m3-${cor}`)}
      >
        <span className="min-w-0 flex-1">
          <span className="m2-linha block text-balance font-semibold leading-snug">{e.titulo}</span>
          <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
            {e.especie === 'reserva'
              ? `Horário reservado · até ${e.fim}`
              : [e.local, `até ${e.fim}`].filter(Boolean).join(' · ')}
          </span>
        </span>
        {situacao ? (
          <span className={cx('m3-etiqueta', situacao.tipo === 'agora' && 'm3-etiqueta-agora')}>
            {situacao.texto}
          </span>
        ) : (
          <span className={cx('m3-icone', `m3-${cor}`)}><Icone size={16} /></span>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SEM HORARIO — a mesma superficie branca do "Precisa de voce" no Hoje: uma
// linha por objeto, circulo a esquerda para resolver, linha para abrir.
// ---------------------------------------------------------------------------
function SemHorario({ itens, aoAbrir, aoConcluir }) {
  return (
    <section className="mt-6" data-testid="m3-sem-horario">
      <p className="px-secao">Sem horário</p>
      <div className="m2-superficie m2-branca mt-2 px-4 py-0">
        {itens.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="m2-divisor" />}
            <LinhaSemHora t={t} aoAbrir={() => aoAbrir({ tipo: 'tarefa', dado: t })} aoConcluir={() => aoConcluir(t.id)} />
          </div>
        ))}
      </div>
    </section>
  )
}

function LinhaSemHora({ t, aoAbrir, aoConcluir }) {
  const [saindo, setSaindo] = useState(false)
  const concluir = () => { setSaindo(true); setTimeout(aoConcluir, 180) }
  return (
    <div className={cx('flex items-start gap-3 py-3 transition-opacity duration-200', saindo && 'opacity-40')}>
      <button
        type="button"
        onClick={concluir}
        aria-label={`Concluir ${t.titulo}`}
        data-testid="m3-concluir"
        className={cx(
          'press mt-0.5 grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] transition-colors',
          saindo ? 'border-positive bg-positive text-white' : 'border-hairline text-transparent',
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>
      <button type="button" onClick={aoAbrir} data-testid="m3-tarefa" className="min-w-0 flex-1 text-left">
        <span className={cx('m2-linha block text-balance font-medium leading-snug', saindo && 'line-through')}>
          {t.titulo}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
          {['Sem hora', t.contexto].filter(Boolean).join(' · ')}
        </span>
      </button>
      <ChevronRight size={18} className="mt-1 flex-none text-faint" />
    </div>
  )
}

// ===========================================================================
// SEMANA (UX-M3.1)
//
// Duas perguntas, duas pecas, uma tela:
//
//   A FAIXA de sete dias responde "como e minha semana?" — ela nunca some,
//   e e nela que a percepcao do todo mora.
//
//   A GRADE de TRES dias responde "o que acontece nestes dias?" — e continua
//   sendo uma grade temporal: eixo de horas, posicao real, altura = duracao,
//   linha de agora, sobreposicao lado a lado. Nao virou tres listas.
//
// A versao de sete colunas simultaneas foi abandonada por um motivo so: para
// caber, o texto do bloco tinha ido a 9,5px. A regra agora e explicita —
// nunca reduzir a fonte para preservar geometria.
// ===========================================================================
const PX_HORA = PX_HORA_SEMANA
const ALTURA_CABECA = 26

// O gesto horizontal. Ele so assume o dedo quando o movimento e claramente
// horizontal; em qualquer duvida a rolagem vertical da agenda continua dona.
// `arrastou` fica de pe ate o proximo toque para que o clique que o navegador
// dispara no fim de um arrasto nao abra o compromisso que passou embaixo.
function useDeslize(aoIr) {
  const partida = useRef(null)
  const arrastou = useRef(false)

  const comecar = (ev) => {
    if (ev.touches.length !== 1) { partida.current = null; return }
    partida.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
    arrastou.current = false
  }
  const mover = (ev) => {
    if (!partida.current || ev.touches.length !== 1) return
    const dx = ev.touches[0].clientX - partida.current.x
    const dy = ev.touches[0].clientY - partida.current.y
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.6) arrastou.current = true
  }
  const terminar = (ev) => {
    const origem = partida.current
    partida.current = null
    const toque = ev.changedTouches && ev.changedTouches[0]
    if (!origem || !arrastou.current || !toque) return
    aoIr(toque.clientX < origem.x ? 1 : -1)
  }

  return {
    arrastou,
    props: {
      onTouchStart: comecar,
      onTouchMove: mover,
      onTouchEnd: terminar,
      onTouchCancel: () => { partida.current = null },
    },
  }
}

function VisaoSemana({ estado, dias, dia, agora, aoDia, aoSemana, aoAbrir, aoConcluir, aoVerDia }) {
  const recorte = recorteDaSemana(dias, dia)
  // A faixa de horas continua olhando a SEMANA inteira, nao so o recorte: a
  // altura da grade nao pode pular a cada deslize.
  const { inicio, fim } = faixaDeHoras(estado, dias)
  const horas = Array.from({ length: fim - inicio }, (_, i) => inicio + i)
  const soltas = semHorario(estado, dia)

  const andar = (delta) => aoDia(andarNoRecorte(dias, dia, delta))
  const deslize = useDeslize(andar)

  return (
    <>
      {/* A FAIXA DOS SETE DIAS — a visao geral. Escolher um dia aqui
          reposiciona o recorte da grade; tocar de novo no dia ja escolhido
          abre o Dia. */}
      <div className="mt-4 flex items-center gap-1">
        <button type="button" onClick={() => aoSemana(-1)} aria-label="Semana anterior" className="m2-redondo h-9 w-9 flex-none">
          <ChevronLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 justify-between gap-0.5">
          {dias.map((d) => {
            const sel = d === dia
            const naGrade = recorte.includes(d)
            const cores = [...new Set(eventosDoDia(estado, d).map(corDoEvento))].slice(0, 1)
            return (
              <button
                key={d}
                type="button"
                data-testid="m3-dia-semana"
                data-visivel={naGrade ? 'sim' : 'nao'}
                onClick={() => (sel ? aoVerDia(d) : aoDia(d))}
                aria-pressed={sel}
                className="press flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1"
              >
                <span className={cx(
                  'text-[10.5px] font-semibold uppercase tracking-wider',
                  sel ? 'text-accent-text' : naGrade ? 'text-secondary' : 'text-faint',
                )}>
                  {diaCurto(d)}
                </span>
                <span className={cx('m3-numero px-hora', sel && 'm3-numero-sel', d === estado.hoje && !sel && 'm3-numero-hoje')}>
                  {numeroDoDia(d)}
                </span>
                <span className={cx('h-[5px] w-[5px] rounded-full', cores.length ? `m3-${cores[0]} m3-ponto-chapado` : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => aoSemana(1)} aria-label="Próxima semana" className="m2-redondo h-9 w-9 flex-none">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* A GRADE DE TRES DIAS — o detalhe operacional. */}
      <div
        className="m2-superficie m2-branca mt-3 overflow-hidden px-0 py-0"
        data-testid="m3-grade"
        {...deslize.props}
      >
        <div className="flex px-2 pb-3 pt-2">
          <div className="w-[36px] flex-none">
            <div style={{ height: ALTURA_CABECA }} />
            {horas.map((h) => (
              <div key={h} style={{ height: PX_HORA }} className="relative">
                <span className="px-hora absolute -top-[6px] right-1 text-[10.5px] text-faint">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          {recorte.map((d) => (
            <ColunaDaSemana
              key={d}
              estado={estado}
              data={d}
              selecionado={d === dia}
              hoje={d === estado.hoje}
              agora={agora}
              inicio={inicio}
              horas={horas}
              arrastou={deslize.arrastou}
              aoAbrir={aoAbrir}
            />
          ))}
        </div>
      </div>

      {/* Os controles explicitos do recorte. O deslize e um atalho; isto e a
          garantia — e o unico caminho quando o dedo nao esta disponivel. */}
      <div className="mt-3 flex items-center justify-center gap-2">
        <button type="button" onClick={() => andar(-1)} aria-label="Dias anteriores" data-testid="m3-recorte-antes" className="m2-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => aoDia(estado.hoje)}
          data-testid="m3-recorte-hoje"
          className="press rounded-full border border-hairline bg-surface px-5 py-2 text-[14px] font-semibold text-accent-text"
        >
          Hoje
        </button>
        <button type="button" onClick={() => andar(1)} aria-label="Próximos dias" data-testid="m3-recorte-depois" className="m2-redondo h-9 w-9">
          <ChevronRight size={18} />
        </button>
      </div>

      {soltas.length > 0 && (
        <SemHorario itens={soltas} aoAbrir={aoAbrir} aoConcluir={aoConcluir} />
      )}
    </>
  )
}

function ColunaDaSemana({ estado, data, selecionado, hoje, agora, inicio, horas, arrastou, aoAbrir }) {
  const eventos = disposicaoDoDia(estado, data)
  return (
    <div className={cx('relative min-w-0 flex-1 border-l border-hairline/60', selecionado && 'm3-coluna-sel')}>
      {/* A cabeca repete o minimo para identificar a coluna — o veu do dia
          escolhido sobe ate aqui para que cabeca e grade sejam a mesma peca. */}
      <div style={{ height: ALTURA_CABECA }} className="flex items-center justify-center">
        <span className={cx('m3-cabeca-3', selecionado && 'm3-cabeca-3-sel')}>
          {diaCurto(data).toUpperCase()} {numeroDoDia(data)}
        </span>
      </div>

      <div className="relative">
        {horas.map((h) => (
          <div key={h} style={{ height: PX_HORA }} className="border-t border-hairline/40 first:border-t-0" />
        ))}

        {hoje && emMinutos(agora) >= inicio * 60 && (
          <span
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-danger/70"
            style={{ top: ((emMinutos(agora) - inicio * 60) / 60) * PX_HORA }}
            aria-hidden="true"
          />
        )}

        {eventos.map(({ evento: e, coluna, colunas }) => {
          const { topo, altura } = posicaoNaGrade(e, {
            inicio, px: PX_HORA, alturaMinima: ALTURA_MINIMA_BLOCO,
          })
          // Sobreposicao: os blocos se escalonam em vez de se espremerem —
          // a regra e o porque estao em `faixaDoBloco`. Quem cede e o
          // conteudo (`detalheDoBloco`), nunca a fonte.
          const { esquerda, largura } = faixaDoBloco(coluna, colunas)
          const mostra = detalheDoBloco(altura, colunas)
          // "Horario reservado" nao cabe em 98px e reticenciava em "Horário
          // re…", que nao informa nada. Na coluna estreita a palavra sozinha
          // diz a mesma coisa; o texto inteiro esta no Dia e no detalhe.
          const apoio = e.especie === 'reserva' ? 'Reservado' : e.local || null
          return (
            <button
              key={e.id}
              type="button"
              data-testid="m3-bloco"
              onClick={() => { if (!arrastou.current) aoAbrir({ tipo: 'evento', dado: e }) }}
              style={{
                top: topo,
                height: altura,
                left: `calc(${esquerda}% + 1px)`,
                width: `calc(${largura}% - 2px)`,
                zIndex: 1 + coluna,
              }}
              title={`${e.titulo} · ${e.inicio}–${e.fim}`}
              className={cx('m3-bloco m3-bloco-3 press', coluna > 0 && 'm3-bloco-sobre', `m3-${corDoEvento(e)}`)}
            >
              <span
                className="block overflow-hidden"
                style={{ display: '-webkit-box', WebkitLineClamp: mostra.linhas, WebkitBoxOrient: 'vertical' }}
              >
                {e.titulo}
              </span>
              {mostra.horario && (
                <span className="px-hora m3-apoio mt-px block truncate">
                  {mostra.intervalo ? `${e.inicio}–${e.fim}` : e.inicio}
                </span>
              )}
              {mostra.apoio && apoio && (
                <span className="m3-apoio block truncate">{apoio}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ===========================================================================
// MES
// ===========================================================================
const CABECA_MES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function VisaoMes({ estado, mesRef, aoMes, dia, aoDia, agora, aoAbrir, aoConcluir }) {
  const celulas = gradeDoMes(estado, mesRef.ano, mesRef.mes)
  const eventos = eventosDoDia(estado, dia)
  const soltas = semHorario(estado, dia)
  const mover = (delta) => {
    const d = new Date(mesRef.ano, mesRef.mes + delta, 1)
    aoMes({ ano: d.getFullYear(), mes: d.getMonth() })
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="m2-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[15px] font-medium">
          {capitalizar(mesPorExtenso(iso(new Date(mesRef.ano, mesRef.mes, 15))))} de {mesRef.ano}
        </p>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="m2-redondo h-9 w-9">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="m2-superficie m2-branca mt-3 px-2 py-2" data-testid="m3-mes">
        <div className="grid grid-cols-7">
          {CABECA_MES.map((d) => (
            <span key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-faint">{d}</span>
          ))}
          {celulas.map((c) => (
            <button
              key={c.data}
              type="button"
              data-testid="m3-celula"
              onClick={() => aoDia(c.data)}
              aria-pressed={c.data === dia}
              aria-label={`${c.dia} — ${c.total} ${c.total === 1 ? 'item' : 'itens'}`}
              className="press flex flex-col items-center gap-[3px] py-1.5"
            >
              <span className={cx(
                'm3-numero px-hora',
                !c.doMes && 'm3-numero-fora',
                c.data === dia && 'm3-numero-sel',
                c.data === estado.hoje && c.data !== dia && 'm3-numero-hoje',
              )}>
                {c.dia}
              </span>
              <span className="flex h-[5px] items-center gap-[3px]" aria-hidden="true">
                {c.doMes && c.pontos.map((cor) => (
                  <span key={cor} className={cx('m3-ponto-chapado h-[4px] w-[4px] rounded-full', `m3-${cor}`)} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* O dia escolhido abre AQUI, embaixo — o calendario continua a vista.
          Um modal cobrindo o mes tiraria justamente o contexto espacial que
          fez a pessoa vir para o mes. */}
      <section className="m2-superficie m2-branca mt-4 px-4 py-0" data-testid="m3-dia-do-mes">
        <div className="flex items-baseline justify-between gap-3 pt-4">
          <h2 className="min-w-0 text-[16px] font-bold leading-none tracking-[-0.02em]">{dataPorExtenso(dia)}</h2>
          <span className="flex-none text-[12.5px] text-muted">
            {eventos.length} {eventos.length === 1 ? 'compromisso' : 'compromissos'}
          </span>
        </div>

        <div className="pb-1 pt-1">
          {eventos.length === 0 && soltas.length === 0 && (
            <p className="py-4 text-[15px] text-muted">Nada marcado neste dia.</p>
          )}

          {eventos.map((e, i) => {
            const Icone = iconeDoEvento(e)
            const situacao = situacaoDoEvento(e, dia === estado.hoje ? agora : '00:00')
            return (
              <div key={e.id}>
                {i > 0 && <div className="m2-divisor" />}
                <button
                  type="button"
                  data-testid="m3-evento-mes"
                  onClick={() => aoAbrir({ tipo: 'evento', dado: e })}
                  className="press flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="px-hora w-[42px] flex-none text-[13px] text-muted">{e.inicio}</span>
                  <span className={cx('m3-marcador', `m3-${corDoEvento(e)}`)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="m2-linha block text-balance font-medium leading-snug">{e.titulo}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                      {e.especie === 'reserva'
                        ? `Horário reservado · até ${e.fim}`
                        : [e.local, `até ${e.fim}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {situacao
                    ? <span className={cx('m3-etiqueta', situacao.tipo === 'agora' && 'm3-etiqueta-agora')}>{situacao.texto}</span>
                    : <span className={cx('m3-icone', `m3-${corDoEvento(e)}`)}><Icone size={16} /></span>}
                </button>
              </div>
            )
          })}

          {soltas.length > 0 && (
            <>
              {eventos.length > 0 && <div className="m2-divisor" />}
              <p className="px-secao pt-3">Sem horário</p>
              {soltas.map((t) => (
                <LinhaSemHora
                  key={t.id}
                  t={t}
                  aoAbrir={() => aoAbrir({ tipo: 'tarefa', dado: t })}
                  aoConcluir={() => aoConcluir(t.id)}
                />
              ))}
            </>
          )}
        </div>
      </section>
    </>
  )
}

// ===========================================================================
// DETALHE — a mesma superficie do Hoje: sobe por cima, esconde a barra de
// baixo, e voltar devolve exatamente onde a pessoa estava.
// ===========================================================================
function Detalhe({ item, estado, acoes, aoVoltar, aoAbrirCompleto }) {
  if (!item) return null
  if (item.tipo === 'tarefa') {
    const t = item.dado
    return (
      <DetalheMovel
        aberto
        aoVoltar={aoVoltar}
        voltarRotulo="Agenda"
        titulo={t.titulo}
        acima="sem hora"
        rodape={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { acoes.mudarEstado(t.id, ESTADO.FEITO); aoVoltar() }}
              data-testid="m3-detalhe-concluir"
              className="press flex-1 rounded-control bg-accent py-3 text-[15px] font-semibold text-white"
            >
              Concluir
            </button>
            <button
              type="button"
              onClick={() => aoAbrirCompleto(t.id)}
              className="press rounded-control border border-hairline px-4 py-3 text-[14px] font-medium text-secondary"
            >
              Abrir tudo
            </button>
          </div>
        }
      >
        <h2 className="mt-2 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">{t.titulo}</h2>
        <p className="px-motivo mt-2">
          {[t.contexto, t.prazo ? `Prazo ${rotuloDeData(t.prazo, estado.hoje)}` : null].filter(Boolean).join(' · ')}
        </p>
        {t.descricao && <p className="mt-4 text-[16px] leading-relaxed text-secondary">{t.descricao}</p>}
      </DetalheMovel>
    )
  }

  const e = item.dado
  const tarefa = e.especie === 'reserva' ? estado.tarefas.find((t) => t.id === e.tarefaId) : null
  const Icone = iconeDoEvento(e)
  return (
    <DetalheMovel
      aberto
      aoVoltar={aoVoltar}
      voltarRotulo="Agenda"
      titulo={e.titulo}
      acima={`${e.inicio}–${e.fim}`}
      rodape={tarefa ? (
        <button
          type="button"
          onClick={() => aoAbrirCompleto(tarefa.id)}
          className="press w-full rounded-control bg-accent py-3 text-[15px] font-semibold text-white"
        >
          Abrir a tarefa
        </button>
      ) : null}
    >
      <span className={cx('m3-icone mt-2 h-10 w-10', `m3-${corDoEvento(e)}`)}><Icone size={20} /></span>
      <h2 className="mt-3 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">{e.titulo}</h2>
      <p className="mt-2 text-[15px] text-secondary">
        {capitalizar(nomeDoDia(e.data))}, {numeroDoDia(e.data)} de {mesCurto(e.data)} · {e.inicio}–{e.fim}
      </p>

      <div className="mt-4 space-y-2">
        {e.local && (
          <p className="flex items-center gap-2 text-[15px] text-secondary">
            <MapPin size={15} className="flex-none text-muted" /> {e.local}
          </p>
        )}
        {e.alerta && (
          <p className="flex items-center gap-2 text-[15px] text-secondary">
            <Bell size={15} className="flex-none text-muted" /> Aviso {alertaCurto(e.alerta)}
          </p>
        )}
        {e.especie === 'reserva' && (
          <p className="flex items-center gap-2 text-[15px] text-secondary">
            <Lock size={15} className="flex-none text-muted" /> Horário reservado para executar a tarefa
          </p>
        )}
      </div>

      {e.notas && <p className="mt-4 text-[16px] leading-relaxed text-secondary">{e.notas}</p>}
    </DetalheMovel>
  )
}
