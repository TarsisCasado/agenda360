import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, Lock, Check, Plus, AlertTriangle, Bell,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS } from '../../lib/constants'
import { toISODate, fromISODate, addDays } from '../../lib/date'
import { cx, capitalizeFirst } from '../../lib/utils'
import {
  eventosDoDia, semHorarioDoDia, disposicaoDoDia, faixaDeHorasDaSemana,
  conflitosDoDiaReal, gradeDoMes, situacaoDoEvento,
} from '../../lib/agendaReal'
import {
  semanaDe, recorteDaSemana, andarNoRecorte, detalheDoBloco, faixaDoBloco,
  posicaoNaGrade, PX_HORA_SEMANA, ALTURA_MINIMA_BLOCO,
} from '../../lib/agendaGrade'
import AcaoCopiloto from '../copiloto/AcaoCopiloto'
import { SUPERFICIE } from '../../lib/copilotoContexto'
import { ErrorState } from '../ui/Common'

// ---------------------------------------------------------------------------
// A AGENDA NO TELEFONE, COM OS DADOS REAIS (C2).
//
// Esta e a direcao aprovada em UX-M3 (Dia, Mes) e UX-M3.1 (Semana) ligada aos
// servicos do produto. A composicao do DESKTOP nao foi tocada: ela continua em
// `pages/DayAgenda.jsx`, acima de `lg`, linha por linha como estava — mesma
// disciplina que o UX1.6 usou para o Hoje.
//
// Cada visao responde uma pergunta diferente, e e isso que decide o desenho:
//
//   DIA     "o que acontece hoje e quando?"      -> linha do tempo
//   SEMANA  "como e minha semana, e o que acontece nestes dias?"
//           -> faixa de SETE dias (o todo) + grade temporal de TRES (o detalhe)
//   MES     "onde ha atividade, e o que tem nesse dia?"
//           -> calendario com pontos + a agenda do dia escolhido ABAIXO dele
//
// -------------------- O QUE E REAL AQUI, E O QUE NAO MUDOU -----------------
//
// O dado vem de `useTasks` (o mesmo hook das outras telas) e e traduzido por
// `lib/agendaReal.js`. Nenhum mock do prototipo e lido.
//
// Abrir um objeto abre o `TaskModal` do produto — nao uma folha propria. E ele
// que guarda edicao, exclusao, alerta, recorrencia e delegacao; reescrever um
// detalhe "bonito" por aqui significaria perder essas quatro coisas ou
// duplica-las, e duplicar e como elas divergem.
//
// NAO HA barra de navegacao nesta tela: a de baixo e do `Layout` e continua
// sendo a unica. Tambem nao ha busca nem menu no topo — eles vivem na Topbar.
// ---------------------------------------------------------------------------

const VISOES = ['dia', 'semana', 'mes']
const ROTULO_VISAO = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }

const nomeDoDia = (iso) => format(fromISODate(iso), 'EEEE', { locale: ptBR })
const diaCurto = (iso) => format(fromISODate(iso), 'EEEEEE', { locale: ptBR })
const numeroDoDia = (iso) => format(fromISODate(iso), 'd')
const mesPorExtenso = (iso) => format(fromISODate(iso), 'MMMM', { locale: ptBR })
const dataPorExtenso = (iso) =>
  `${capitalizeFirst(nomeDoDia(iso))}, ${numeroDoDia(iso)} de ${mesPorExtenso(iso)}`

const horaAgora = (agora) =>
  `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`

// O apoio de um evento — do dado, nunca inventado. O intervalo so e escrito
// quando `end_time` existe de verdade (ver a nota em `lib/agendaReal.js`).
function apoioDoEvento(e) {
  const partes = []
  if (e.especie === 'reserva') partes.push('Horário reservado')
  if (e.fim) partes.push(`até ${e.fim}`)
  if (e.categoria) partes.push(e.categoria)
  return partes.join(' · ')
}

// ---------------------------------------------------------------------------
// O CIRCULO DE CONCLUIR. O controle mais leve do produto, e o mesmo gesto do
// Hoje no telefone: marca no proprio item, esmaece, e so entao o estado muda —
// sem isso, concluir parece que a tarefa evaporou.
// ---------------------------------------------------------------------------
function Concluir({ task, onChanged }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [saindo, setSaindo] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const alternar = async (ev) => {
    ev.stopPropagation()
    if (ocupado) return
    setOcupado(true)
    setSaindo(true)
    try {
      await taskService.changeStatus(user.id, task, STATUS.DONE)
      onChanged?.()
    } catch (err) {
      setSaindo(false)
      toast('Erro ao concluir: ' + (err?.message || err), 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={ocupado}
      aria-label={`Concluir ${task.title}`}
      data-testid="am-concluir"
      className={cx(
        'press mt-0.5 grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] transition-colors',
        saindo ? 'border-positive bg-positive text-white' : 'border-hairline text-transparent',
      )}
    >
      <Check size={14} strokeWidth={3} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// SEM HORARIO — tarefa que foi escolhida PARA o dia e nao tem hora marcada.
// Fica abaixo da regua e nunca dentro dela: po-la na regua exigiria inventar
// um horario, que e a unica coisa que a Agenda nao faz.
// ---------------------------------------------------------------------------
function LinhaSemHora({ task, onOpen, onChanged }) {
  const { categoryById } = useData()
  const cor = categoryById(task.category_id)?.color
  const feito = task.status === STATUS.DONE
  return (
    <div className="flex items-start gap-3 py-3">
      <Concluir task={task} onChanged={onChanged} />
      <button
        type="button"
        onClick={() => onOpen(task)}
        data-testid="am-tarefa"
        className="min-w-0 flex-1 text-left"
      >
        <span className={cx('am-linha block text-balance font-medium leading-snug', feito && 'line-through text-muted')}>
          {task.title}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
          {['Sem hora', categoryById(task.category_id)?.name].filter(Boolean).join(' · ')}
        </span>
      </button>
      {cor && <span className="mt-1.5 h-[18px] w-[3px] flex-none rounded-full" style={{ backgroundColor: cor }} />}
      <ChevronRight size={18} className="mt-1 flex-none text-faint" />
    </div>
  )
}

function SemHorario({ itens, onOpen, onChanged, testid = 'dia-tarefas' }) {
  return (
    <section className="mt-6" data-testid={testid}>
      <p className="am-secao px-2">Sem horário</p>
      <div className="am-superficie am-branca mt-2 px-4 py-0">
        {itens.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="am-divisor" />}
            <LinhaSemHora task={t} onOpen={onOpen} onChanged={onChanged} />
          </div>
        ))}
      </div>
    </section>
  )
}

// ===========================================================================
// DIA — timeline. Os blocos nao sao cartoes soltos: eles pendem do mesmo fio,
// e e o fio que faz a sequencia virar um dia.
// ===========================================================================
function LinhaDaTimeline({ e, agora, onOpen }) {
  const situacao = situacaoDoEvento(e, agora)
  const apoio = apoioDoEvento(e)
  return (
    <div className="relative flex items-stretch gap-2 pb-2.5">
      <span className="am-num w-[42px] flex-none pt-3 text-right text-[13px] text-muted">{e.inicio}</span>
      <span className="am-ponto" style={{ '--am-cor': e.cor }} aria-hidden="true" />
      <button
        type="button"
        onClick={() => onOpen(e.task)}
        data-testid="am-evento"
        style={{ '--am-cor': e.cor }}
        className={cx('am-evento press ml-3 min-w-0 flex-1 text-left', e.especie === 'reserva' && 'am-reservado')}
      >
        <span className="min-w-0 flex-1">
          <span className={cx('am-linha block text-balance font-semibold leading-snug', e.feito && 'line-through opacity-70')}>
            {e.titulo}
          </span>
          {apoio && (
            <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{apoio}</span>
          )}
        </span>
        {situacao ? (
          <span className={cx('am-etiqueta', situacao.tipo === 'agora' && 'am-etiqueta-agora')}>
            {situacao.texto}
          </span>
        ) : (
          <span className="am-icone" style={{ '--am-cor': e.cor }}>
            {e.especie === 'reserva' ? <Lock size={15} /> : e.alerta ? <Bell size={15} /> : <CalendarDays size={15} />}
          </span>
        )}
      </button>
    </div>
  )
}

function VisaoDia({ tasks, dia, hojeISO, agora, cat, onDia, onMes, onOpen, onChanged, onNew }) {
  const eventos = useMemo(() => eventosDoDia(tasks, dia, cat), [tasks, dia, cat])
  const soltas = useMemo(() => semHorarioDoDia(tasks, dia), [tasks, dia])
  const conflito = useMemo(() => conflitosDoDiaReal(tasks, dia, cat).length > 0, [tasks, dia, cat])
  const mover = (delta) => onDia(toISODate(addDays(fromISODate(dia), delta)))

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior" className="am-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[15px] font-medium" data-testid="am-dia-rotulo">
          {dia === hojeISO ? 'Hoje' : dataPorExtenso(dia)}
        </p>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo dia" className="am-redondo h-9 w-9">
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={onMes} aria-label="Ver no mês" className="am-redondo h-9 w-9">
          <CalendarDays size={17} />
        </button>
      </div>

      {/* VOLTAR PARA HOJE em um toque. A referencia do prototipo nao tinha
          este botao, mas a Agenda do produto tinha — e andar sete dias para a
          frente sem caminho de volta e uma funcao perdida, nao uma
          simplificacao. Ele so aparece quando ha para onde voltar. */}
      {dia !== hojeISO && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => onDia(hojeISO)}
            data-testid="am-dia-hoje"
            className="press rounded-full border border-hairline bg-surface px-5 py-1.5 text-[13.5px] font-semibold text-accent-text"
          >
            Hoje
          </button>
        </div>
      )}

      {conflito && (
        <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-warning">
          <AlertTriangle size={14} className="flex-none" />
          Dois compromissos se sobrepõem neste dia.
        </p>
      )}

      {eventos.length === 0 && soltas.length === 0 && (
        <p className="mt-6 text-[15px] text-muted" data-testid="am-dia-vazio">Nada marcado neste dia.</p>
      )}

      {eventos.length > 0 && (
        <div className="relative mt-4" data-testid="dia-timeline">
          <span className="am-fio" aria-hidden="true" />
          {eventos.map((e) => (
            <LinhaDaTimeline key={e.id} e={e} agora={agora} onOpen={onOpen} />
          ))}
        </div>
      )}

      {soltas.length > 0 && <SemHorario itens={soltas} onOpen={onOpen} onChanged={onChanged} />}

      {/* A porta de criacao e o [+] da barra de baixo. Aqui fica so uma acao
          contextual discreta — a mesma intencao, com o dia ja escolhido. */}
      <button
        type="button"
        onClick={() => onNew(dia)}
        data-testid="am-novo"
        className="press mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-text"
      >
        <Plus size={16} /> Novo compromisso neste dia
      </button>
    </>
  )
}

// ===========================================================================
// SEMANA (UX-M3.1) — duas perguntas, duas pecas, uma tela.
//
// A FAIXA de sete dias responde "como e minha semana?" e nunca some.
// A GRADE de TRES dias responde "o que acontece nestes dias?" e continua sendo
// uma grade temporal: eixo de horas, posicao real, altura = duracao, linha do
// agora, sobreposicao escalonada. Nao virou tres listas.
//
// A versao de sete colunas simultaneas foi abandonada por um motivo so: para
// caber, o texto do bloco tinha ido a 9,5px. A regra agora e explicita — nunca
// reduzir a fonte para preservar geometria.
// ===========================================================================
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

function ColunaDaSemana({ tasks, data, cat, selecionado, hoje, agora, inicio, horas, arrastou, onOpen }) {
  const disposicao = useMemo(() => disposicaoDoDia(tasks, data, cat), [tasks, data, cat])
  const agoraMin = Number(agora.slice(0, 2)) * 60 + Number(agora.slice(3, 5))

  return (
    <div
      data-testid={`am-coluna-${data}`}
      className={cx('relative min-w-0 flex-1 border-l border-hairline/60', selecionado && 'am-coluna-sel')}
    >
      {/* A cabeca repete o minimo para identificar a coluna — o veu do dia
          escolhido sobe ate aqui para que cabeca e grade sejam a mesma peca. */}
      <div style={{ height: ALTURA_CABECA }} className="flex items-center justify-center">
        <span className={cx('am-cabeca', selecionado && 'am-cabeca-sel')}>
          {diaCurto(data).toUpperCase()} {numeroDoDia(data)}
        </span>
      </div>

      <div className="relative">
        {horas.map((h) => (
          <div key={h} style={{ height: PX_HORA_SEMANA }} className="border-t border-hairline/40 first:border-t-0" />
        ))}

        {hoje && agoraMin >= inicio * 60 && (
          <span
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-danger/70"
            style={{ top: ((agoraMin - inicio * 60) / 60) * PX_HORA_SEMANA }}
            aria-hidden="true"
          />
        )}

        {disposicao.map(({ evento: e, coluna, colunas }) => {
          const { topo, altura } = posicaoNaGrade(e, {
            inicio, px: PX_HORA_SEMANA, alturaMinima: ALTURA_MINIMA_BLOCO,
          })
          // Sobreposicao: os blocos ESCALONAM em vez de se espremerem (a regra
          // e o porque estao em `faixaDoBloco`). Quem cede e o conteudo
          // (`detalheDoBloco`), nunca a fonte.
          const { esquerda, largura } = faixaDoBloco(coluna, colunas)
          const mostra = detalheDoBloco(altura, colunas)
          // "Horário reservado" nao cabe em 98px e reticenciava em "Horário
          // re…", que nao informa nada. Na coluna estreita a palavra sozinha
          // diz a mesma coisa; o texto inteiro esta no Dia e no detalhe.
          const apoio = e.especie === 'reserva' ? 'Reservado' : e.categoria || null
          return (
            <button
              key={e.id}
              type="button"
              data-testid="am-bloco"
              onClick={() => { if (!arrastou.current) onOpen(e.task) }}
              style={{
                top: topo,
                height: altura,
                left: `calc(${esquerda}% + 1px)`,
                width: `calc(${largura}% - 2px)`,
                zIndex: 1 + coluna,
                '--am-cor': e.cor,
              }}
              title={e.fimReal ? `${e.titulo} · ${e.inicio}–${e.fimReal}` : `${e.titulo} · ${e.inicio}`}
              className={cx('am-bloco press', coluna > 0 && 'am-bloco-sobre', e.especie === 'reserva' && 'am-reservado')}
            >
              <span
                className="block overflow-hidden"
                style={{ display: '-webkit-box', WebkitLineClamp: mostra.linhas, WebkitBoxOrient: 'vertical' }}
              >
                {e.titulo}
              </span>
              {mostra.horario && (
                <span className="am-num am-apoio mt-px block truncate">
                  {mostra.intervalo && e.fimReal ? `${e.inicio}–${e.fimReal}` : e.inicio}
                </span>
              )}
              {mostra.apoio && apoio && <span className="am-apoio block truncate">{apoio}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function VisaoSemana({ tasks, dias, dia, agora, cat, hojeISO, onDia, onSemana, onOpen, onChanged, onVerDia }) {
  const recorte = recorteDaSemana(dias, dia)
  // A faixa de horas olha a SEMANA inteira, nao so o recorte: a altura da
  // grade nao pode pular a cada deslize.
  const { inicio, fim } = useMemo(() => faixaDeHorasDaSemana(tasks, dias, cat), [tasks, dias, cat])
  const horas = Array.from({ length: fim - inicio }, (_, i) => inicio + i)
  const soltas = useMemo(() => semHorarioDoDia(tasks, dia), [tasks, dia])

  const andar = (delta) => onDia(andarNoRecorte(dias, dia, delta))
  const deslize = useDeslize(andar)

  return (
    <>
      {/* A FAIXA DOS SETE DIAS — a visao geral. Escolher um dia aqui
          reposiciona o recorte da grade; tocar de novo no dia ja escolhido
          abre o Dia. */}
      <div className="mt-4 flex items-center gap-1">
        <button type="button" onClick={() => onSemana(-1)} aria-label="Semana anterior" className="am-redondo h-9 w-9 flex-none">
          <ChevronLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 justify-between gap-0.5">
          {dias.map((d) => {
            const sel = d === dia
            const naGrade = recorte.includes(d)
            const cores = [...new Set(eventosDoDia(tasks, d, cat).map((e) => e.cor))].slice(0, 1)
            return (
              <button
                key={d}
                type="button"
                data-testid={`semana-dia-${d}`}
                data-visivel={naGrade ? 'sim' : 'nao'}
                onClick={() => (sel ? onVerDia(d) : onDia(d))}
                aria-pressed={sel}
                className="press flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1"
              >
                <span className={cx(
                  'text-[10.5px] font-semibold uppercase tracking-wider',
                  sel ? 'text-accent-text' : naGrade ? 'text-secondary' : 'text-faint',
                )}>
                  {diaCurto(d)}
                </span>
                <span className={cx('am-numero am-num', sel && 'am-numero-sel', d === hojeISO && !sel && 'am-numero-hoje')}>
                  {numeroDoDia(d)}
                </span>
                <span
                  className={cx('h-[5px] w-[5px] rounded-full', cores.length ? 'am-ponto-chapado' : 'bg-transparent')}
                  style={cores.length ? { '--am-cor': cores[0] } : undefined}
                />
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => onSemana(1)} aria-label="Próxima semana" className="am-redondo h-9 w-9 flex-none">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* A GRADE DE TRES DIAS — o detalhe operacional.

          ELA SANGRA ATE A BORDA (`-mx-3`, que anula o `px-3` do <main>). Nao e
          capricho: medido no build, o intervalo "09:30–10:30" em 13px precisa
          de 79px e a coluna dava 73px em 375 e 78px em 390 — ele reticenciava
          em "09:30–10:…", que e a unica coisa num bloco que nunca pode ser
          cortada. A saida obvia seria baixar a fonte, e e exatamente o que o
          UX-M3.1 proibiu. Entao quem cede e a MARGEM: a grade da semana e a
          unica superficie da tela que usa a largura inteira do aparelho, que e
          o que uma grade temporal pede. Com isso a coluna vai a ~86px em 390 e
          ~81px em 375, e o intervalo cabe inteiro nas tres larguras. */}
      <div
        className="am-superficie am-branca -mx-3 mt-3 overflow-hidden px-0 py-0 sm:mx-0"
        data-testid="am-grade"
        {...deslize.props}
      >
        <div className="flex px-1 pb-3 pt-2">
          <div className="w-[34px] flex-none">
            <div style={{ height: ALTURA_CABECA }} />
            {horas.map((h) => (
              <div key={h} style={{ height: PX_HORA_SEMANA }} className="relative">
                <span className="am-num absolute -top-[6px] right-1 text-[10.5px] text-faint">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          {recorte.map((d) => (
            <ColunaDaSemana
              key={d}
              tasks={tasks}
              data={d}
              cat={cat}
              selecionado={d === dia}
              hoje={d === hojeISO}
              agora={agora}
              inicio={inicio}
              horas={horas}
              arrastou={deslize.arrastou}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>

      {/* Os controles explicitos do recorte. O deslize e um atalho; isto e a
          garantia — e o unico caminho quando o dedo nao esta disponivel. */}
      <div className="mt-3 flex items-center justify-center gap-2">
        <button type="button" onClick={() => andar(-1)} aria-label="Dias anteriores" data-testid="am-recorte-antes" className="am-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => onDia(hojeISO)}
          data-testid="am-recorte-hoje"
          className="press rounded-full border border-hairline bg-surface px-5 py-2 text-[14px] font-semibold text-accent-text"
        >
          Hoje
        </button>
        <button type="button" onClick={() => andar(1)} aria-label="Próximos dias" data-testid="am-recorte-depois" className="am-redondo h-9 w-9">
          <ChevronRight size={18} />
        </button>
      </div>

      {soltas.length > 0 && (
        <SemHorario itens={soltas} onOpen={onOpen} onChanged={onChanged} testid="am-semana-sem-horario" />
      )}
    </>
  )
}

// ===========================================================================
// MES — orientacao, nao miniagenda.
//
// A celula NAO carrega titulo: quem responde "o que tem nesse dia" e a agenda
// que aparece ABAIXO do calendario. Escolher um dia nao cobre o mes com um
// modal — o contexto espacial que motivou a escolha fica a vista.
//
// A semana comeca na SEGUNDA, como em todo o resto do produto. A referencia
// aprovada mostrava domingo; ver a nota em `lib/agendaReal.js`.
// ===========================================================================
const CABECA_MES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

function VisaoMes({ tasks, mesRef, cat, dia, hojeISO, agora, onMes, onDia, onOpen, onChanged }) {
  const celulas = useMemo(() => gradeDoMes(tasks, mesRef.ano, mesRef.mes, cat), [tasks, mesRef, cat])
  const eventos = useMemo(() => eventosDoDia(tasks, dia, cat), [tasks, dia, cat])
  const soltas = useMemo(() => semHorarioDoDia(tasks, dia), [tasks, dia])
  const mover = (delta) => {
    const d = new Date(mesRef.ano, mesRef.mes + delta, 1)
    onMes({ ano: d.getFullYear(), mes: d.getMonth() })
  }
  const titulo = capitalizeFirst(
    format(new Date(mesRef.ano, mesRef.mes, 15), "MMMM 'de' yyyy", { locale: ptBR }),
  )

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="am-redondo h-9 w-9">
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[15px] font-medium">{titulo}</p>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="am-redondo h-9 w-9">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="am-superficie am-branca mt-3 px-2 py-2" data-testid="am-mes">
        <div className="grid grid-cols-7">
          {CABECA_MES.map((d) => (
            <span key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-faint">{d}</span>
          ))}
          {celulas.map((c) => (
            <button
              key={c.data}
              type="button"
              data-testid={`mes-dia-${c.data}`}
              onClick={() => onDia(c.data)}
              aria-pressed={c.data === dia}
              aria-label={`${c.dia} — ${c.total} ${c.total === 1 ? 'item' : 'itens'}`}
              className="press flex flex-col items-center gap-[3px] py-1.5"
            >
              <span className={cx(
                'am-numero am-num',
                !c.doMes && 'am-numero-fora',
                c.data === dia && 'am-numero-sel',
                c.data === hojeISO && c.data !== dia && 'am-numero-hoje',
              )}>
                {c.dia}
              </span>
              <span className="flex h-[5px] items-center gap-[3px]" aria-hidden="true">
                {c.doMes && c.pontos.map((cor) => (
                  <span key={cor} className="am-ponto-chapado h-[4px] w-[4px] rounded-full" style={{ '--am-cor': cor }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="am-superficie am-branca mt-4 px-4 py-0" data-testid="mes-painel-dia">
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
            const situacao = situacaoDoEvento(e, dia === hojeISO ? agora : '00:00')
            return (
              <div key={e.id}>
                {i > 0 && <div className="am-divisor" />}
                <button
                  type="button"
                  data-testid="am-evento-mes"
                  onClick={() => onOpen(e.task)}
                  className="press flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="am-num w-[42px] flex-none text-[13px] text-muted">{e.inicio}</span>
                  <span className="am-marcador" style={{ background: e.cor, minHeight: 26 }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="am-linha block text-balance font-medium leading-snug">{e.titulo}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{apoioDoEvento(e)}</span>
                  </span>
                  {situacao
                    ? <span className={cx('am-etiqueta', situacao.tipo === 'agora' && 'am-etiqueta-agora')}>{situacao.texto}</span>
                    : <ChevronRight size={18} className="flex-none text-faint" />}
                </button>
              </div>
            )
          })}

          {soltas.length > 0 && (
            <>
              {eventos.length > 0 && <div className="am-divisor" />}
              <p className="am-secao pt-3">Sem horário</p>
              {soltas.map((t) => (
                <LinhaSemHora key={t.id} task={t} onOpen={onOpen} onChanged={onChanged} />
              ))}
            </>
          )}
        </div>
      </section>
    </>
  )
}

// ===========================================================================
// As tasks chegam de FORA (`pages/DayAgenda.jsx`), e nao de um `useTasks`
// proprio: a tela tem de fazer UMA consulta, nao duas. Qual intervalo pedir e
// decisao de quem busca — `lib/agendaReal.js:intervaloDoRecorte` tem a regra.
export default function AgendaMobile({
  date, visao, tasks = [], error, reload, onDate, onVisao, onOpenTask, onNew,
}) {
  const { categoryById } = useData()
  const cat = useMemo(() => ({ categoriaPorId: categoryById }), [categoryById])

  const agoraRef = useMemo(() => new Date(), [])
  const agora = horaAgora(agoraRef)
  const hojeISO = toISODate(agoraRef)

  const dias = useMemo(() => semanaDe(date), [date])
  const [mesRef, setMesRef] = useState(() => {
    const base = fromISODate(date) || new Date()
    return { ano: base.getFullYear(), mes: base.getMonth() }
  })

  // Trocar de dia por fora (faixa da semana, celula do mes, ?date= na URL) tem
  // de levar o mes exibido junto — senao escolher 1º de dezembro deixaria o
  // calendario parado em novembro com a selecao invisivel.
  useEffect(() => {
    const base = fromISODate(date)
    if (!base) return
    setMesRef((m) =>
      m.ano === base.getFullYear() && m.mes === base.getMonth()
        ? m
        : { ano: base.getFullYear(), mes: base.getMonth() },
    )
  }, [date])

  const contexto = visao === 'dia'
    ? dataPorExtenso(date)
    : visao === 'semana'
      ? `Semana de ${numeroDoDia(dias[0])} a ${numeroDoDia(dias[6])} de ${mesPorExtenso(dias[6])}`
      : capitalizeFirst(format(new Date(mesRef.ano, mesRef.mes, 15), "MMMM 'de' yyyy", { locale: ptBR }))

  const rotuloCopiloto = visao === 'dia' ? 'Planejar este dia'
    : visao === 'mes' ? 'Planejar este mês' : 'Planejar esta semana'
  const periodoCopiloto = visao === 'dia' ? dataPorExtenso(date)
    : visao === 'mes' ? 'este mês'
      : `${numeroDoDia(dias[0])} a ${numeroDoDia(dias[6])} de ${mesPorExtenso(dias[6])}`

  return (
    <div className="am relative" data-testid="am-agenda">
      <div className="am-fundo" aria-hidden="true" />

      <div className="relative">
        <header className="px-2">
          <p className="text-[15px] leading-snug text-secondary">{contexto}</p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-[1.12] tracking-[-0.03em]">Agenda</h1>
          {/* O convite do Copiloto acompanha o RECORTE aberto, e so o periodo
              visivel viaja junto. Ele existia antes deste checkpoint e
              continua existindo: integrar visual nao remove funcao. */}
          <AcaoCopiloto
            superficie={SUPERFICIE.AGENDA}
            rotulo={rotuloCopiloto}
            extra={{ periodo: periodoCopiloto }}
            className="-ml-2 mt-1"
          />
        </header>

        {/* O eixo da tela. Uma escolha so, sempre visivel, sem menu. */}
        <div className="am-segmentos mt-3" role="tablist" aria-label="Visão da agenda">
          {VISOES.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={visao === v}
              data-testid={`am-visao-${v}`}
              onClick={() => onVisao(v)}
              className={cx('am-segmento', visao === v && 'am-segmento-ativo')}
            >
              {ROTULO_VISAO[v]}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-6"><ErrorState onRetry={reload} /></div>
        ) : visao === 'dia' ? (
          <VisaoDia
            tasks={tasks}
            dia={date}
            hojeISO={hojeISO}
            agora={agora}
            cat={cat}
            onDia={onDate}
            onMes={() => onVisao('mes')}
            onOpen={onOpenTask}
            onChanged={reload}
            onNew={onNew}
          />
        ) : visao === 'semana' ? (
          <VisaoSemana
            tasks={tasks}
            dias={dias}
            dia={date}
            agora={agora}
            cat={cat}
            hojeISO={hojeISO}
            onDia={onDate}
            onSemana={(delta) => onDate(toISODate(addDays(fromISODate(date), delta * 7)))}
            onOpen={onOpenTask}
            onChanged={reload}
            onVerDia={(d) => { onDate(d); onVisao('dia') }}
          />
        ) : (
          <VisaoMes
            tasks={tasks}
            mesRef={mesRef}
            cat={cat}
            dia={date}
            hojeISO={hojeISO}
            agora={agora}
            onMes={setMesRef}
            onDia={onDate}
            onOpen={onOpenTask}
            onChanged={reload}
          />
        )}
      </div>
    </div>
  )
}
