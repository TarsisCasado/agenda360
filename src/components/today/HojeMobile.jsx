import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, Sparkles, AlertTriangle, RefreshCw, UserCheck, Plus,
  CalendarCheck2, CalendarPlus,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS } from '../../lib/constants'
import { formatLong } from '../../lib/date'
import { greetingFor } from '../../lib/todayContext'
import { proximidade } from '../../lib/today'
import { linhaDoDia, precisaDeVoce, sugestaoDoMomento, AMOSTRA_ATENCAO } from '../../lib/hojeMobile'
import { SUPERFICIE, contextoDaSuperficie } from '../../lib/copilotoContexto'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// HOJE NO TELEFONE — a home pessoal.
//
// A composicao do desktop continua EXATAMENTE como estava (ver Today.jsx): ela
// vive acima de `lg` e nao foi tocada. Esta e outra composicao para a mesma
// pergunta, porque 390px nao e "o desktop menor" — e uma tela onde cabe uma
// coisa de cada vez.
//
// -------------------- O QUE O C2 MUDOU AQUI --------------------------------
//
// A DERIVACAO nao mudou: `linhaDoDia`, `precisaDeVoce` e `sugestaoDoMomento`
// continuam sendo a fonte, com os mesmos baldes de `buildToday` e a mesma
// deduplicacao. Nenhum campo novo, nenhuma escrita nova.
//
// O que mudou e a SUPERFICIE: a tela passa a falar a linguagem aprovada em
// UX-M2 — o plano de fundo com a tonalidade fria, a saudacao como maior texto
// da tela, e o conteudo em TRES superficies de funcoes diferentes:
//
//   1. PROXIMO COMPROMISSO  lavanda. O horario e o objeto; o marcador vertical
//      liga a hora ao que vai acontecer;
//   2. PRECISA DE VOCE      branca. O que esta parado esperando por mim:
//      circulo para resolver, linha para abrir. A ultima linha nao e tarefa —
//      e o convite a organizar o que nunca ganhou data;
//   3. SUGESTAO CONTEXTUAL  lavanda, e a unica que pode ser dispensada. Ela
//      ocupa o FIM da composicao de proposito: e a ultima coisa que se le.
//
// -------------------- O QUE FOI MANTIDO CONTRA A REFERENCIA ----------------
//
// A referencia UX-M2 nao tem a LINHA DO DIA — ela mostra tres superficies e
// manda o dia inteiro para a Agenda. Aqui ela fica, numa superficie branca
// entre as decisoes e a sugestao, por uma razao que nao e estetica: tirar o
// dia de Hoje seria remover conteudo que o produto ja entrega, e a aprovacao
// foi da DIRECAO VISUAL, nao de uma reducao de escopo. O que a referencia
// pede e que a sugestao venha por ultimo — e ela vem.
//
// As QUATRO ENTRADAS DE FOCO (os numeros Atrasadas/Hoje/Em andamento/Sem data)
// continuam fora do telefone, como desde o UX1.6: elas respondem "quanto
// existe no sistema", que e pergunta de painel, e custavam a dobra inteira.
// ---------------------------------------------------------------------------

const ICONE_ATENCAO = {
  atraso: AlertTriangle,
  remarcada: RefreshCw,
  delegada: UserCheck,
}

// Titulo de uma superficie branca. Peso de titulo, tamanho de secao — e o que
// separa "Precisa de voce" de uma lista com borda.
function TituloSuperficie({ children, acao, onAcao, testid }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
      <h2 className="text-[19px] font-bold leading-none tracking-[-0.02em]">{children}</h2>
      {acao && (
        <button
          onClick={onAcao}
          data-testid={testid}
          className="press -mr-1 flex items-center gap-0.5 pl-2 text-[14px] font-semibold text-accent-text"
        >
          {acao}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1 · AGORA / A SEGUIR. So existe quando ha um COMPROMISSO (tem hora). Tarefa
// sem hora nunca vira "agora": inventar urgencia e o oposto do que esta tela
// faz.
// ---------------------------------------------------------------------------
function Agora({ task, now, onOpen }) {
  const prox = proximidade(task.start_time, now)
  const inicio = String(task.start_time).slice(0, 5)
  const fim = task.end_time ? String(task.end_time).slice(0, 5) : null
  const agora = prox?.tom === 'agora'

  // A SUPERFICIE e a secao; o BLOCO TOCAVEL e o botao dentro dela. Nao e
  // detalhe de marcacao: o rotulo ("PROXIMO COMPROMISSO") diz o que aquilo e e
  // nao e parte do objeto — tocar no rotulo nao deveria abrir a reuniao. E e
  // tambem o que mantem a hierarquia medivel: o primeiro elemento do bloco e a
  // HORA, que e o maior texto da superficie.
  return (
    <section className="am-superficie am-lavanda" data-testid="hoje-agora">
      <div className="flex items-center gap-2">
        <span className="am-selo"><CalendarCheck2 size={13} /></span>
        <span className="am-rotulo">{agora ? 'Acontecendo agora' : 'Próximo compromisso'}</span>
      </div>
      <button
        onClick={() => onOpen(task)}
        data-testid="hoje-proximo"
        className="press mt-3 flex w-full items-center gap-2 text-left"
      >
        <span className="am-hora am-num flex-none font-semibold leading-none tracking-[-0.03em]">
          {inicio}
        </span>
        <span className="am-marcador" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {/* `balance` para a quebra ser decidida, nao sobrada: em 430 o titulo
              cabe em uma linha; abaixo disso ele se reparte em duas metades
              parecidas em vez de deixar uma palavra orfa. Encolher a fonte ate
              caber custaria legibilidade — e a prioridade e ler. */}
          <span className="am-titulo block text-balance font-semibold leading-snug tracking-[-0.01em]">
            {task.title}
          </span>
          <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
            {fim && <span className="am-num">até {fim} · </span>}
            {prox && <span className="font-medium text-accent-text">{prox.texto}</span>}
          </span>
        </span>
        <ChevronRight size={16} className="flex-none text-faint" />
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3 · A SUGESTAO. Uma frase, uma pergunta, duas acoes — e nada mais.
//
// "Reservar" NAO grava: leva ao Copiloto com o contexto, onde a proposta e
// confirmada como qualquer outra. Uma home que cria atividade sozinha seria
// escrita sem pedido, que e a unica coisa que este produto nunca faz.
//
// DIFERENCA EM RELACAO A REFERENCIA: no prototipo este botao abria uma folha
// de candidatos e "Reservar" marcava o horario na hora. Aqui ele continua
// levando a conversa, porque o contrato PERGUNTAR -> PROPOSTA -> CONFIRMAR e
// do produto e nao foi aberto neste checkpoint.
// ---------------------------------------------------------------------------
function Sugestao({ sugestao, onDispensar }) {
  const navigate = useNavigate()
  const pedir = () =>
    navigate('/assistente', {
      state: {
        copiloto: contextoDaSuperficie(SUPERFICIE.HOJE),
        rascunho: `Reservar ${sugestao.minutos} minutos agora para "${sugestao.task.title}"`,
      },
    })

  return (
    <section className="am-superficie am-lavanda relative overflow-hidden" data-testid="hoje-sugestao">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="flex-none text-accent" />
        <span className="am-rotulo">Tempo livre antes do compromisso</span>
      </div>
      <p className="relative mt-2 max-w-[78%] text-[15px] leading-snug text-primary">
        {sugestao.frase} <span className="text-secondary">{sugestao.pergunta}</span>
      </p>
      <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
        <button
          onClick={pedir}
          className="press rounded-control bg-accent px-4 py-2.5 text-[14px] font-semibold text-white"
        >
          Reservar
        </button>
        <button
          onClick={onDispensar}
          className="press rounded-control bg-accent-soft px-4 py-2.5 text-[14px] font-medium text-accent-text ring-1 ring-inset ring-accent/15"
        >
          Agora não
        </button>
      </div>
      <GlifoJanela />
    </section>
  )
}

// O GLIFO. Um desenho pequeno, do mesmo violeta, meio transparente e atras do
// texto: da corpo a superficie sem virar banner. Se ele competir com a frase,
// ele esta errado — por isso nao tem cor propria nem sombra, e o texto tem
// largura maxima para nunca passar por cima dele.
function GlifoJanela() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="pointer-events-none absolute right-2 top-[46%] h-[68px] w-[68px] text-accent opacity-[0.15]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="12" width="42" height="40" rx="8" />
      <path d="M6 24h42M18 6v10M36 6v10" />
      <path d="M17 36h12" />
      <circle cx="47" cy="45" r="13" fill="currentColor" stroke="none" opacity="0.5" />
      <path d="M47 39v6l4 3" stroke="currentColor" opacity="0.9" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// UMA LINHA DO DIA. Hora dominante a esquerda; sem hora, um traco no lugar —
// que mantem o alinhamento da coluna sem fingir um horario.
//
// O circulo de concluir fica: ele ja e o controle mais leve do produto (nao e
// um botao escrito "Concluir") e tira-lo obrigaria a abrir o detalhe so para
// marcar algo como feito, na tela que mais recebe esse gesto.
// ---------------------------------------------------------------------------
function Linha({ item, onOpen, onChanged }) {
  const { task, hora, sinal } = item
  const { user } = useAuth()
  const { categoryById } = useData()
  const { toast } = useToast()
  const [ocupado, setOcupado] = useState(false)
  const feito = task.status === STATUS.DONE
  const cor = categoryById(task.category_id)?.color

  const alternar = async (e) => {
    e.stopPropagation()
    if (ocupado) return
    setOcupado(true)
    try {
      await taskService.changeStatus(user.id, task, feito ? STATUS.TODO : STATUS.DONE)
      onChanged?.()
    } catch (err) {
      toast('Erro ao atualizar: ' + err.message, 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div data-testid="hoje-linha" className="flex items-center gap-3 py-2.5">
      <button
        onClick={() => onOpen(task)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cx(
            'am-num w-[42px] shrink-0 text-[13px] font-semibold',
            hora ? 'text-primary' : 'text-faint',
          )}
        >
          {hora || '—'}
        </span>
        {cor && (
          <span className="h-[18px] w-[3px] shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        )}
        <span
          className={cx(
            'am-linha min-w-0 flex-1 truncate',
            feito ? 'text-muted line-through' : 'text-primary',
          )}
        >
          {task.title}
        </span>
        {/* O sinal de remarcacao mora AQUI, na propria linha, e nao como um
            segundo item em "Precisa de voce": um item, um lugar. */}
        {sinal && (
          <span
            title={`Mudou de dia ${sinal.replace('×', '')} vezes`}
            className="am-num text-caption shrink-0"
          >
            {sinal}
          </span>
        )}
      </button>
      <button
        onClick={alternar}
        disabled={ocupado}
        aria-label={feito ? 'Reabrir' : 'Concluir'}
        className={cx(
          'press grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
          feito ? 'border-positive bg-positive text-white' : 'border-hairline text-transparent',
        )}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2 · UMA LINHA DE "PRECISA DE VOCE".
//
// A cor do alerta e vermelho CONTIDO e fica so na evidencia — pintar a linha
// inteira transformaria "precisa de voce" em "voce esta falhando".
// ---------------------------------------------------------------------------
function ItemAtencao({ item, onOpen }) {
  const Icone = ICONE_ATENCAO[item.tipo] || AlertTriangle
  return (
    <button
      onClick={() => onOpen(item.task)}
      data-testid="hoje-atencao-item"
      className="press flex w-full items-start gap-3 py-3 text-left"
    >
      <Icone
        size={16}
        className={cx('mt-[3px] flex-none', item.tipo === 'atraso' ? 'text-danger' : 'text-muted')}
      />
      <span className="min-w-0 flex-1">
        <span className="am-linha block text-balance font-medium leading-snug text-primary">
          {item.task.title}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
          <span className={item.tipo === 'atraso' ? 'text-danger' : undefined}>{item.evidencia}</span>
        </span>
      </span>
      <ChevronRight size={18} className="mt-1 flex-none text-faint" />
    </button>
  )
}

export default function HojeMobile({ t, agora, onOpen, onChanged, onCriar }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [verTudo, setVerTudo] = useState(false)
  const [sugestaoOculta, setSugestaoOculta] = useState(false)

  const linhas = linhaDoDia(t)
  const atencao = precisaDeVoce(t, { today: undefined })
  const visiveis = verTudo ? atencao : atencao.slice(0, AMOSTRA_ATENCAO)
  const resto = atencao.length - visiveis.length
  const sugestao = sugestaoOculta ? null : sugestaoDoMomento(t, agora)
  const primeiroNome = user?.full_name?.split(' ')[0] || 'você'
  const semData = t.contagens.sem_data

  return (
    <div className="am relative" data-testid="hoje-mobile">
      {/* A ATMOSFERA. Um plano fixo atras de tudo: o fundo claro com a
          tonalidade fria e uma variacao muito discreta embaixo, para o rodape
          nao parecer recortado. Nao e ilustracao — se voce reparar nela, ela
          esta forte demais. */}
      <div className="am-fundo" aria-hidden="true" />

      <div className="relative space-y-4">
        {/* O TOPO — data pequena, saudacao grande. A saudacao e o maior texto
            da tela e o unico elemento editorial. Nenhuma barra de marca acima:
            a home nao precisa dizer em que aplicativo voce esta. */}
        <header className="px-2">
          <p className="text-[15px] leading-snug text-secondary">{formatLong(agora)}</p>
          <h1 className="mt-1 text-[30px] font-bold leading-[1.12] tracking-[-0.03em] text-primary">
            {greetingFor(agora)}, {primeiroNome}
          </h1>
        </header>

        {t.proximo && <Agora task={t.proximo} now={agora} onOpen={onOpen} />}

        {(visiveis.length > 0 || semData > 0) && (
          <section className="am-superficie am-branca px-0 py-0" data-testid="hoje-atencao">
            <TituloSuperficie
              acao={resto > 0 ? `Ver mais ${resto}` : null}
              onAcao={() => setVerTudo(true)}
              testid="hoje-ver-mais"
            >
              Precisa de você
            </TituloSuperficie>

            <div className="mt-1 px-4 pb-1">
              {visiveis.map((item, i) => (
                <div key={item.id}>
                  {i > 0 && <div className="am-divisor" />}
                  <ItemAtencao item={item} onOpen={onOpen} />
                </div>
              ))}

              {/* A ULTIMA LINHA NAO E TAREFA. Ela nao tem circulo de concluir
                  porque o que falta nela e uma DATA, nao um empurrao — e a
                  forma diz a diferenca antes de o texto explicar. */}
              {semData > 0 && (
                <>
                  {visiveis.length > 0 && <div className="am-divisor" />}
                  <button
                    onClick={() => navigate('/tarefas')}
                    data-testid="hoje-sem-data"
                    className="press flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="am-icone-linha"><CalendarPlus size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="am-linha block font-medium leading-snug text-primary">
                        {semData} {semData === 1 ? 'tarefa sem data' : 'tarefas sem data'}
                      </span>
                      <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                        Escolher data para organizar
                      </span>
                    </span>
                    <ChevronRight size={18} className="flex-none text-faint" />
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {linhas.length > 0 && (
          <section className="am-superficie am-branca px-0 py-0" data-testid="hoje-linha-do-dia">
            {/* "Depois, hoje" quando ha destaque: o que esta em AGORA saiu
                desta lista, entao chama-la de "Hoje" prometeria o dia inteiro e
                entregaria o dia menos uma coisa. */}
            <TituloSuperficie acao="Agenda" onAcao={() => navigate('/dia')}>
              {t.proximo ? 'Depois, hoje' : 'Hoje'}
            </TituloSuperficie>
            <div className="mt-1 px-4 pb-2">
              {linhas.map((item, i) => (
                <div key={item.task.id}>
                  {i > 0 && <div className="am-divisor" />}
                  <Linha item={item} onOpen={onOpen} onChanged={onChanged} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* A sugestao fecha a composicao: e a ultima coisa que se le, nunca a
            primeira. */}
        {sugestao && <Sugestao sugestao={sugestao} onDispensar={() => setSugestaoOculta(true)} />}

        {/* DIA LIVRE. Nao e erro do sistema, e uma boa noticia — entao nao leva
            icone de alerta nem caixa de estado vazio. Leva uma frase e uma
            porta. */}
        {t.vazio && (
          <div className="px-2 pt-2" data-testid="hoje-vazio">
            <p className="text-[17px] font-semibold text-primary">Seu dia está livre.</p>
            <p className="text-body mt-1">
              Sem nada atrasado, agendado para hoje ou esperando organização.
            </p>
            <button onClick={onCriar} className="btn-secondary press mt-4">
              <Plus size={16} /> Capturar algo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
