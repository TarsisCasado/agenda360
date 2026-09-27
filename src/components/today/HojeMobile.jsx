import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Sparkles, AlertTriangle, RefreshCw, UserCheck, Plus } from 'lucide-react'
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
// HOJE NO TELEFONE — a home pessoal (UX1.6 / Mobile 2.0).
//
// A composicao do desktop continua EXATAMENTE como estava (ver Today.jsx): ela
// vive acima de `lg` e nao foi tocada. Esta e outra composicao para a mesma
// pergunta, porque 390px nao e "o desktop menor" — e uma tela onde cabe uma
// coisa de cada vez.
//
// -------------------- O QUE SAIU DA PRIMEIRA DOBRA -------------------------
//
// As QUATRO ENTRADAS DE FOCO (os numeros Atrasadas/Hoje/Em andamento/Sem data)
// sairam do telefone. Elas respondem "quanto existe no sistema", que e uma
// pergunta de painel; num iPhone custavam a dobra inteira antes de qualquer
// conteudo, e foi assim que a tela passou a ser lida como versao reduzida do
// desktop. O que elas diziam nao se perdeu: o atraso virou PRECISA DE VOCE
// (com evidencia, nao so contagem), o "hoje" virou a propria linha do dia, e
// "sem data" desceu para o rodape, onde responde sem disputar a abertura.
//
// -------------------- TRES TEMPOS ------------------------------------------
//
//   AGORA            uma coisa. Forte por HIERARQUIA, nao por tamanho de caixa:
//                    nenhuma superficie, nenhuma borda — so a hora grande;
//   HOJE             o dia como agenda pessoal, em linha unica;
//   PRECISA DE VOCE  no maximo duas excecoes; o resto atras de um toque.
//
// Nenhum dos tres e um card. Cards viriam com borda, raio e sombra, e quatro
// deles empilhados sao exatamente o empilhamento que o QA humano descreveu.
// Aqui o agrupamento e feito por RITMO e por rotulo pequeno.
// ---------------------------------------------------------------------------

const ICONE_ATENCAO = {
  atraso: AlertTriangle,
  remarcada: RefreshCw,
  delegada: UserCheck,
}

// Rotulo de secao. Pequeno, calmo, sem contagem ao lado — a contagem ja esta
// no conteudo, e dize-la duas vezes foi o vicio que este checkpoint veio tirar.
function Rotulo({ children, acao, onAcao }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3 px-2">
      <h2 className="text-section">{children}</h2>
      {acao && (
        <button
          onClick={onAcao}
          className="press inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-text"
        >
          {acao}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AGORA. Sem caixa. A hora e o maior elemento da tela e e ela que faz o bloco
// existir; o titulo vem logo abaixo, no peso de um titulo de pagina. Um card
// com fundo e sombra diria a mesma coisa ocupando o dobro da dobra.
// ---------------------------------------------------------------------------
function Agora({ task, now, onOpen }) {
  const prox = proximidade(task.start_time, now)
  const inicio = String(task.start_time).slice(0, 5)
  const fim = task.end_time ? String(task.end_time).slice(0, 5) : null
  const agora = prox?.tom === 'agora'

  return (
    <section data-testid="hoje-agora" className="px-2">
      <Rotulo>{agora ? 'Agora' : 'A seguir'}</Rotulo>
      <button
        onClick={() => onOpen(task)}
        data-testid="hoje-proximo"
        className="press block w-full text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-primary">
            {inicio}
          </span>
          {fim && <span className="text-caption tabular-nums">até {fim}</span>}
          {prox && (
            <span
              className={cx(
                'ml-auto shrink-0 text-[13px] font-semibold',
                agora ? 'text-accent-text' : 'text-secondary',
              )}
            >
              {prox.texto}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-primary">
          {task.title}
        </p>
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// A SUGESTAO. Uma frase, uma pergunta, duas acoes de texto — e nada mais.
//
// "Reservar" NAO grava: leva ao Copiloto com o contexto, onde a proposta e
// confirmada como qualquer outra. Uma home que cria atividade sozinha seria
// escrita sem pedido.
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
    <section data-testid="hoje-sugestao" className="px-2">
      <p className="flex items-start gap-1.5 text-[14px] leading-snug text-secondary">
        <Sparkles size={14} className="mt-[3px] shrink-0 text-accent" />
        <span>
          {sugestao.frase} <span className="text-primary">{sugestao.pergunta}</span>
        </span>
      </p>
      <div className="mt-1.5 flex items-center gap-4 pl-[22px]">
        <button onClick={pedir} className="press text-[13px] font-semibold text-accent-text">
          Reservar
        </button>
        <button onClick={onDispensar} className="press text-[13px] font-medium text-muted">
          Agora não
        </button>
      </div>
    </section>
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
    <div
      data-testid="hoje-linha"
      className="tapavel flex items-center gap-3 px-2 py-2.5"
    >
      <button
        onClick={() => onOpen(task)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cx(
            'w-[42px] shrink-0 text-[13px] font-semibold tabular-nums',
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
            'min-w-0 flex-1 truncate text-[15px]',
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
            className="text-caption shrink-0 tabular-nums"
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

function ItemAtencao({ item, onOpen }) {
  const Icone = ICONE_ATENCAO[item.tipo] || AlertTriangle
  return (
    <button
      onClick={() => onOpen(item.task)}
      data-testid="hoje-atencao-item"
      className="press tapavel flex w-full items-start gap-2.5 px-2 py-2.5 text-left"
    >
      <Icone
        size={15}
        className={cx('mt-[2px] shrink-0', item.tipo === 'atraso' ? 'text-danger' : 'text-muted')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-primary">{item.task.title}</span>
        <span className="text-caption mt-0.5 block">{item.evidencia}</span>
      </span>
      <ChevronRight size={15} className="mt-1 shrink-0 text-faint" />
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

  return (
    <div className="space-y-6" data-testid="hoje-mobile">
      {/* CABECALHO CURTO. Saudacao em corpo de titulo pequeno, data logo
          abaixo: 60px ate o primeiro conteudo util, contra os ~190px que o
          cabecalho grande + as quatro entradas custavam. */}
      <header className="flex items-start justify-between gap-3 px-2">
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold tracking-[-0.015em] text-primary">
            {greetingFor(agora)}, {primeiroNome}
          </h1>
          <p className="text-caption mt-0.5">{formatLong(agora)}</p>
        </div>
      </header>

      {t.proximo && <Agora task={t.proximo} now={agora} onOpen={onOpen} />}

      {sugestao && <Sugestao sugestao={sugestao} onDispensar={() => setSugestaoOculta(true)} />}

      {linhas.length > 0 && (
        <section data-testid="hoje-linha-do-dia">
          {/* "Depois, hoje" quando ha destaque: o que esta em AGORA saiu desta
              lista, entao chama-la de "Hoje" prometeria o dia inteiro e
              entregaria o dia menos uma coisa. */}
          <Rotulo acao="Agenda" onAcao={() => navigate('/dia')}>
            {t.proximo ? 'Depois, hoje' : 'Hoje'}
          </Rotulo>
          <div className="divide-hair divide-y">
            {linhas.map((item) => (
              <Linha key={item.task.id} item={item} onOpen={onOpen} onChanged={onChanged} />
            ))}
          </div>
        </section>
      )}

      {atencao.length > 0 && (
        <section data-testid="hoje-atencao">
          <Rotulo
            acao={resto > 0 ? `Ver mais ${resto}` : null}
            onAcao={() => setVerTudo(true)}
          >
            Precisa de você
          </Rotulo>
          <div className="divide-hair divide-y">
            {visiveis.map((item) => (
              <ItemAtencao key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/* O RODAPE responde "quanto existe" — a pergunta de painel, no lugar
          onde ela nao disputa a abertura da tela. */}
      {t.contagens.sem_data > 0 && (
        <button
          onClick={() => navigate('/tarefas')}
          data-testid="hoje-sem-data"
          className="press flex w-full items-center gap-2 px-2 py-1 text-left"
        >
          <span className="text-[14px] text-secondary">
            {t.contagens.sem_data} {t.contagens.sem_data === 1 ? 'item ainda sem data' : 'itens ainda sem data'}
          </span>
          <ChevronRight size={14} className="text-faint" />
        </button>
      )}

      {t.vazio && (
        <div className="px-2" data-testid="hoje-vazio">
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
  )
}
