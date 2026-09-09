import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { toISODate, formatLong } from '../lib/date'
import {
  buildToday,
  proximidade,
  HOJE_BALDES,
  AMOSTRA_ATRASADAS,
  AMOSTRA_SEM_DATA,
} from '../lib/today'
import { greetingFor } from '../lib/todayContext'
import { pluralize } from '../lib/plural'
import { cx } from '../lib/utils'

// ---------------------------------------------------------------------------
// HOJE — foco e execucao. NAO e um painel.
//
// A pergunta e "o que merece minha atencao AGORA?", nunca "quantas coisas
// existem no sistema?". Toda a estrutura abaixo sai dessa frase.
//
// O QUE MUDOU E POR QUE
//   O cabecalho antigo gastava a primeira tela inteira antes de mostrar
//   qualquer tarefa: data + saudacao gigante + frase de contexto + barra de
//   progresso. Bonito e caro — a informacao util comecava abaixo da dobra num
//   iPhone. Agora a saudacao ocupa duas linhas e as ENTRADAS DE FOCO vem em
//   seguida.
//
//   Sairam da superficie (o codigo e a persistencia continuam intactos, entao
//   o rollback e trocar este arquivo):
//     - a barra de progresso do dia. Media de conclusao e metrica, e metrica
//       responde "quanto rendi", nao "o que preciso fazer";
//     - "Ideias recentes". Ideia nao pede atencao hoje; pede quando se quer
//       pensar. O lugar dela e Ideias, que e um destino primario desde o CP5.2;
//     - a frase de contexto e a sugestao em linha, absorvidas: as quatro
//       entradas ja dizem o mesmo com numero em vez de prosa.
//
// AS QUATRO ENTRADAS DE FOCO nao sao quatro dashboards: sao quatro NUMEROS
// clicaveis que respondem, de relance, onde ha atencao necessaria. Cada uma
// leva ao lugar onde aquilo se resolve. Quando todas sao zero elas encolhem
// para uma linha so de texto, em vez de virarem quatro caixas vazias.
//
// DEDUPLICACAO: um item aparece UMA vez na tela. A regra inteira, com a ordem
// de prioridade e o porque de cada empate, esta em lib/today.js.
// ---------------------------------------------------------------------------

const TOM_ENTRADA = {
  danger: 'text-danger',
  accent: 'text-accent-text',
  neutro: 'text-primary',
}

const DESTINO = {
  atrasada: '/tarefas',
  hoje: '/dia',
  em_andamento: '/tarefas',
  sem_data: '/tarefas',
}

// ENTRADA DE FOCO — contagem em cima, rotulo embaixo. Compacta de proposito:
// e um marcador, nao um cartao de conteudo.
function Entrada({ balde, count, onClick }) {
  const vazia = count === 0
  return (
    <button
      onClick={onClick}
      disabled={vazia}
      data-testid={`hoje-entrada-${balde.key}`}
      className={cx(
        'press flex min-h-[62px] flex-col justify-center rounded-row px-3 py-2 text-left transition-colors',
        vazia ? 'bg-surface-2/50' : 'bg-surface hover:bg-surface-2',
      )}
    >
      <span
        className={cx(
          'text-[22px] font-bold leading-none tabular-nums',
          vazia ? 'text-faint' : TOM_ENTRADA[balde.tone],
        )}
      >
        {count}
      </span>
      <span className={cx('mt-1 text-[12px] font-medium', vazia ? 'text-faint' : 'text-secondary')}>
        {balde.label}
      </span>
    </button>
  )
}

// AGORA / PROXIMO — o unico bloco com peso visual da tela. So existe quando ha
// um COMPROMISSO (tem hora). Tarefa sem hora nunca vira "agora": inventar
// urgencia e o oposto do que esta tela faz.
function Proximo({ task, now, onOpen }) {
  const prox = proximidade(task.start_time, now)
  const inicio = String(task.start_time).slice(0, 5)
  const fim = task.end_time ? String(task.end_time).slice(0, 5) : null
  return (
    <button
      onClick={() => onOpen(task)}
      data-testid="hoje-proximo"
      className="press interactive block w-full rounded-surface bg-surface p-4 text-left"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums text-primary">
          {inicio}
        </span>
        {fim && <span className="text-caption tabular-nums">até {fim}</span>}
        {prox && (
          <span
            className={cx(
              'ml-auto shrink-0 text-[12px] font-semibold',
              prox.tom === 'agora' ? 'text-accent-text' : 'text-secondary',
            )}
          >
            {prox.texto}
          </span>
        )}
      </div>
      <p className="mt-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-primary">
        {task.title}
      </p>
    </button>
  )
}

// Rotulo de secao + acao textual. Sem moldura: o agrupamento e por ritmo.
// O rotulo NAO repete a contagem: quem conta e a entrada de foco la em cima.
// "3 Atrasadas" no marcador e "ATRASADAS 3" quarenta pixels abaixo e a mesma
// informacao dita duas vezes, que foi o vicio que este checkpoint veio tirar.
function Bloco({ label, acao, onAcao, children }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3 px-2">
        <h2 className="text-section">{label}</h2>
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
      <div className="list">{children}</div>
    </section>
  )
}

export default function Today() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // SEM RANGE. O Hoje antigo carregava só os últimos 30 dias, então uma
  // atrasada de 40 dias e QUALQUER tarefa em andamento sem data simplesmente
  // não existiam nesta tela. Hoje precisa do universo aberto para responder o
  // que promete; quem recorta é `buildToday`.
  const { tasks, loading } = useTasks({})
  const [editing, setEditing] = useState(null)
  const [criando, setCriando] = useState(false)
  const [verTodasAtrasadas, setVerTodasAtrasadas] = useState(false)

  const agora = useMemo(() => new Date(), [])
  const hojeISO = toISODate(agora)
  const primeiroNome = user?.full_name?.split(' ')[0] || 'você'

  const t = useMemo(
    () => buildToday(tasks, { today: hojeISO, now: agora }),
    [tasks, hojeISO, agora],
  )

  const abrir = (task) => setEditing(task)
  const atrasadas = verTodasAtrasadas
    ? t.baldes.atrasada
    : t.baldes.atrasada.slice(0, AMOSTRA_ATRASADAS)
  const restoAtrasadas = t.baldes.atrasada.length - atrasadas.length
  const semData = t.baldes.sem_data.slice(0, AMOSTRA_SEM_DATA)
  const restoSemData = t.baldes.sem_data.length - semData.length

  return (
    <div className="mx-auto w-full max-w-2xl xl:max-w-5xl">
      <header className="mb-4 px-2">
        <h1 className="text-display">
          {greetingFor(agora)}, {primeiroNome}
        </h1>
        <p className="text-caption mt-0.5">{formatLong(agora)}</p>
      </header>

      {loading && tasks.length === 0 ? (
        <TaskListSkeleton count={4} />
      ) : (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
        <div className="space-y-6">
          {/* ENTRADAS DE FOCO. Com tudo em zero elas somem e viram uma linha:
              a estrutura continua elegante em vez de virar quatro caixas
              vazias pedindo desculpa. */}
          {t.vazio ? (
            <p className="text-body px-2" data-testid="hoje-tudo-limpo">
              Nada puxando sua atenção agora.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="hoje-entradas">
              {HOJE_BALDES.map((b) => (
                <Entrada
                  key={b.key}
                  balde={b}
                  count={t.contagens[b.key]}
                  onClick={() => navigate(DESTINO[b.key])}
                />
              ))}
            </div>
          )}

          {/* No celular o proximo compromisso vem no fluxo, logo abaixo das
              entradas. Em telas grandes ele migra para a coluna da direita,
              junto com o resto do dia — ver o `<aside>` no fim do arquivo. */}
          {t.proximo && (
            <div className="xl:hidden">
              <Proximo task={t.proximo} now={agora} onOpen={abrir} />
            </div>
          )}

          {atrasadas.length > 0 && (
            <Bloco
              label="Atrasadas"
              acao={restoAtrasadas > 0 && !verTodasAtrasadas ? `Ver as outras ${restoAtrasadas}` : null}
              onAcao={() => setVerTodasAtrasadas(true)}
            >
              {atrasadas.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={abrir} onChanged={() => {}} showDate />
              ))}
            </Bloco>
          )}

          {t.baldes.em_andamento.length > 0 && (
            <Bloco label="Em andamento">
              {t.baldes.em_andamento.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={abrir} onChanged={() => {}} showDate />
              ))}
            </Bloco>
          )}

          {t.hojeSemProximo.length > 0 && (
            <Bloco
              label={t.proximo ? 'Depois, hoje' : 'Hoje'}
              acao="Agenda"
              onAcao={() => navigate('/dia')}
            >
              {t.hojeSemProximo.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={abrir} onChanged={() => {}} />
              ))}
            </Bloco>
          )}

          {semData.length > 0 && (
            <Bloco
              label="Sem data"
              acao={restoSemData > 0 ? `Ver as ${t.contagens.sem_data}` : 'Organizar'}
              onAcao={() => navigate('/tarefas')}
            >
              {semData.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={abrir} onChanged={() => {}} />
              ))}
            </Bloco>
          )}

          {/* DIA LIVRE. Nao e erro do sistema, e uma boa noticia — entao nao
              leva icone de alerta nem caixa de estado vazio. Leva uma frase e
              uma porta. */}
          {t.vazio && (
            <div className="px-2" data-testid="hoje-vazio">
              <p className="text-[17px] font-semibold text-primary">Seu dia está livre.</p>
              <p className="text-body mt-1">
                Sem nada atrasado, agendado para hoje ou esperando organização.
              </p>
              <button onClick={() => setCriando(true)} className="btn-secondary press mt-4">
                <Plus size={16} /> Capturar algo
              </button>
            </div>
          )}
        </div>

        {/* SEGUNDA ZONA (>=1280px) — "como esta o meu dia".
            A coluna da esquerda responde O QUE PRECISA DE MIM; esta responde
            COMO O DIA ESTA ARMADO. Sao perguntas diferentes, e num monitor ha
            largura para as duas ao mesmo tempo — que era exatamente o espaco
            que sobrava vazio antes. So aparece quando ha compromisso: sem
            horario nenhum, uma coluna lateral vazia seria pior que nao ter
            coluna. */}
        {t.compromissos.length > 0 && (
          <aside className="mt-6 hidden xl:mt-0 xl:block" data-testid="hoje-coluna-dia">
            <h2 className="text-section mb-1.5 px-2">Seu dia</h2>
            <div className="space-y-2">
              {t.compromissos.map((c) =>
                c.id === t.proximo?.id ? (
                  <Proximo key={c.id} task={c} now={agora} onOpen={abrir} />
                ) : (
                  <button
                    key={c.id}
                    onClick={() => abrir(c)}
                    className="press flex w-full items-baseline gap-3 rounded-row bg-surface px-3 py-2.5 text-left"
                  >
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-secondary">
                      {String(c.start_time).slice(0, 5)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-primary">
                      {c.title}
                    </span>
                  </button>
                ),
              )}
            </div>
          </aside>
        )}
        </div>
      )}

      {/* Fecho discreto: reconhece o que foi feito sem virar painel. */}
      {!loading && !t.vazio && t.total > 0 && (
        <p className="text-caption mt-6 px-2">
          {pluralize(t.total, 'item', 'itens')} pedindo atenção.
        </p>
      )}

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
      <TaskModal
        open={criando}
        task={null}
        defaults={{ date: hojeISO }}
        onClose={() => setCriando(false)}
      />
    </div>
  )
}
