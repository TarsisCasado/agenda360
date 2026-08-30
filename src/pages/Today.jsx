import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Lightbulb, Sun, Sparkles, Check } from 'lucide-react'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import Section, { SectionAction } from '../components/ui/Section'
import { EmptyState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks, useUndatedTasks } from '../hooks/useTasks'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import {
  toISODate,
  addDays,
  formatLong,
  isTaskOverdue,
  byTime,
  nowTimeString,
} from '../lib/date'
import { STATUS, PRIORITY } from '../lib/constants'
import { percent, cx } from '../lib/utils'
import { pluralize } from '../lib/plural'
import { greetingFor, todayPhrase } from '../lib/todayContext'
import { ideaTitle, sortIdeasByRecent } from '../lib/ideas'

// ---------------------------------------------------------------------------
// HOJE — tela executiva pessoal, nao dashboard.
//
// Mudanca estrutural desta fase: saiu o "pulso do dia" (anel de progresso + 3
// contadores), que era um painel de BI. No lugar:
//   1. saudacao + a frase de contexto (o que esta acontecendo);
//   2. AGORA — a proxima atividade em destaque de verdade (o unico bloco com
//      peso visual da tela);
//   3. PRECISA DE VOCE — atrasadas e prioridades numa lista so, sem repetir
//      grupos;
//   4. o resto do dia, discreto;
//   5. no maximo UMA sugestao contextual, em linha (nunca um card de alerta).
//
// O progresso vira uma barra de 3px no cabecalho: informa sem virar metrica.
// ---------------------------------------------------------------------------
function NextUp({ task, onOpen }) {
  const start = task.start_time?.slice(0, 5)
  const end = task.end_time?.slice(0, 5)
  return (
    <button
      onClick={() => onOpen(task)}
      className="press interactive block w-full rounded-surface bg-surface p-4 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent-text">
          Agora
        </span>
      </div>
      <p className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-primary">
        {task.title}
      </p>
      <p className="text-secondary-sm mt-1 tabular-nums">
        {start}
        {end ? ` – ${end}` : ''}
      </p>
    </button>
  )
}

export default function Today() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const range = useMemo(
    () => ({ start: toISODate(addDays(new Date(), -30)), end: toISODate(new Date()) }),
    [],
  )
  const { tasks, loading } = useTasks(range)
  const { tasks: undated } = useUndatedTasks()
  const { notes } = useInbox()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const today = toISODate(new Date())
  const now = nowTimeString()
  const firstName = user?.full_name?.split(' ')[0] || 'você'
  const nowDate = new Date()

  const overdue = useMemo(
    () => tasks.filter(isTaskOverdue).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [tasks],
  )
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === today).sort(byTime),
    [tasks, today],
  )
  const pendingToday = todayTasks.filter((t) => [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status))

  const next = useMemo(
    () => pendingToday.find((t) => t.start_time && t.start_time.slice(0, 5) >= now) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks, now],
  )

  // "Precisa de voce": atrasadas + prioridades altas, SEM duplicar itens e sem
  // criar dois grupos que dizem quase a mesma coisa.
  const needsAttention = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const t of overdue.slice(0, 4)) {
      seen.add(t.id)
      out.push(t)
    }
    for (const t of pendingToday) {
      if (seen.has(t.id) || t.id === next?.id) continue
      if ([PRIORITY.HIGH, PRIORITY.URGENT].includes(t.priority)) out.push(t)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdue, todayTasks, next])

  // O resto do dia: o que ainda esta ABERTO e nao aparece acima. Concluidas
  // ficam de fora — ja estao representadas na barra de progresso, e uma lista
  // de itens riscados nao e "o que voce ainda tem hoje".
  const restOfDay = useMemo(() => {
    const shown = new Set([...needsAttention.map((t) => t.id), next?.id].filter(Boolean))
    return todayTasks.filter(
      (t) => !shown.has(t.id) && [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
    )
  }, [todayTasks, needsAttention, next])

  const doneCount = todayTasks.filter((t) => t.status === STATUS.DONE).length
  const progress = percent(doneCount, todayTasks.length)
  const recentIdeas = useMemo(() => sortIdeasByRecent(notes).slice(0, 3), [notes])

  const phrase = todayPhrase({
    overdueCount: overdue.length,
    pendingCount: pendingToday.length,
    doneCount,
    totalToday: todayTasks.length,
    nextStartTime: next ? next.start_time.slice(0, 5) : null,
    now: nowDate,
  })

  const suggestion =
    overdue.length > 0
      ? { text: `Reorganizar ${pluralize(overdue.length, 'atrasada', 'atrasadas')}`, to: '/tarefas' }
      : undated.length > 0
        ? { text: `${pluralize(undated.length, 'tarefa', 'tarefas')} sem data para organizar`, to: '/tarefas' }
        : null

  const openTask = (t) => setEditing(t)
  const isClear = todayTasks.length === 0 && overdue.length === 0

  return (
    <div className="mx-auto max-w-2xl">
      <header className="animate-in mb-7 px-2">
        <p className="text-caption">{formatLong(nowDate)}</p>
        <h1 className="text-hero mt-1.5">
          {greetingFor(nowDate)}, {firstName}
        </h1>
        <p className="text-body mt-2">{phrase}</p>

        {/* Progresso do dia: informacao, nao metrica. */}
        {todayTasks.length > 0 && (
          <div className="mt-4 flex items-center gap-2.5">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-caption shrink-0 tabular-nums">
              {doneCount}/{todayTasks.length}
            </span>
          </div>
        )}
      </header>

      {loading && tasks.length === 0 ? (
        <TaskListSkeleton count={4} />
      ) : (
        <div className="space-y-7">
          {next && <NextUp task={next} onOpen={openTask} />}

          <Section label="Precisa de você" count={needsAttention.length} tone="!text-danger">
            {needsAttention.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onOpen={openTask}
                onChanged={() => {}}
                showDate={overdue.some((o) => o.id === t.id)}
              />
            ))}
          </Section>

          <Section
            label={next || needsAttention.length ? 'Também hoje' : 'Hoje'}
            count={restOfDay.length}
            action={
              restOfDay.length > 0 ? (
                <SectionAction onClick={() => navigate('/dia')}>Agenda</SectionAction>
              ) : null
            }
          >
            {restOfDay.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={() => {}} />
            ))}
          </Section>

          {/* Uma sugestao, em linha. Nunca um card de alerta. */}
          {suggestion && (
            <button
              onClick={() => navigate(suggestion.to)}
              className="press flex w-full items-center gap-2.5 px-2 py-1 text-left"
            >
              <Sparkles size={15} className="shrink-0 text-accent" />
              <span className="text-secondary-sm min-w-0 flex-1 truncate">{suggestion.text}</span>
              <ArrowRight size={15} className="shrink-0 text-muted" />
            </button>
          )}

          {/* Fecho do dia: reconhece o que foi feito sem virar painel de metrica. */}
          {!isClear && restOfDay.length === 0 && doneCount > 0 && (
            <p className="text-caption px-2">
              {doneCount === todayTasks.length
                ? 'Tudo o que havia para hoje está concluído.'
                : `${pluralize(doneCount, 'concluída', 'concluídas')} hoje.`}
            </p>
          )}

          {isClear && (
            <EmptyState
              icon={doneCount > 0 ? Check : Sun}
              title={doneCount > 0 ? 'Dia concluído' : 'Dia em branco'}
              description={
                doneCount > 0
                  ? 'Você fechou tudo que tinha para hoje.'
                  : 'Nada puxando sua atenção agora. Capture algo pelo + ou aproveite a folga.'
              }
              action={
                <button onClick={() => setCreating(true)} className="btn-secondary press">
                  Capturar algo
                </button>
              }
            />
          )}

          {recentIdeas.length > 0 && (
            <Section
              label="Ideias recentes"
              action={<SectionAction onClick={() => navigate('/ideias')}>Ver todas</SectionAction>}
            >
              {recentIdeas.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate(`/ideias/${n.id}`, { state: { note: n } })}
                  className={cx(
                    'flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left transition-colors active:bg-surface-2',
                  )}
                >
                  <Lightbulb size={15} className="shrink-0 text-warning" />
                  <span className="truncate text-[15px] text-primary">{ideaTitle(n)}</span>
                </button>
              ))}
            </Section>
          )}
        </div>
      )}

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
      <TaskModal
        open={creating}
        task={null}
        defaults={{ date: today }}
        onClose={() => setCreating(false)}
      />
    </div>
  )
}
