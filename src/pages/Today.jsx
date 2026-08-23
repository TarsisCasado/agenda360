import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Lightbulb, Sun, CalendarDays, Sparkles } from 'lucide-react'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import SectionHeader from '../components/ui/SectionHeader'
import { EmptyState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks, useUndatedTasks } from '../hooks/useTasks'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { toISODate, addDays, formatLong, isTaskOverdue, byTime, nowTimeString } from '../lib/date'
import { STATUS, PRIORITY } from '../lib/constants'
import { percent, cx } from '../lib/utils'
import { greetingFor, todayPhrase } from '../lib/todayContext'
import { ideaTitle, sortIdeasByRecent } from '../lib/ideas'

// Pulso do dia — faixa editorial (nao um painel BI): progresso + numeros-chave.
function DayPulse({ progress, total, done, overdue }) {
  return (
    <div className="surface flex items-center gap-5 px-5 py-4 ring-1 ring-slate-100 dark:ring-slate-800/70">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-slate-100 dark:stroke-slate-800" />
          <circle
            cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round"
            className="stroke-brand-500 transition-[stroke-dashoffset] duration-700"
            strokeDasharray={`${(2 * Math.PI * 15.5)}`}
            strokeDashoffset={`${(2 * Math.PI * 15.5) * (1 - progress / 100)}`}
          />
        </svg>
        <span className="absolute text-sm font-extrabold text-slate-800 dark:text-slate-100">{progress}%</span>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{total}</p>
          <p className="text-caption">hoje</p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{done}</p>
          <p className="text-caption">feitas</p>
        </div>
        <div>
          <p className={cx('text-xl font-extrabold', overdue ? 'text-red-500' : 'text-slate-800 dark:text-slate-100')}>{overdue}</p>
          <p className="text-caption">atrasadas</p>
        </div>
      </div>
    </div>
  )
}

export default function Today() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const range = useMemo(() => ({ start: toISODate(addDays(new Date(), -30)), end: toISODate(new Date()) }), [])
  const { tasks, loading } = useTasks(range)
  const { tasks: undated } = useUndatedTasks()
  const { notes } = useInbox()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const today = toISODate(new Date())
  const now = nowTimeString()
  const firstName = user?.full_name?.split(' ')[0] || 'você'
  const nowDate = new Date()

  const overdue = useMemo(() => tasks.filter(isTaskOverdue).sort((a, b) => (a.date < b.date ? -1 : 1)), [tasks])
  const todayTasks = useMemo(() => tasks.filter((t) => t.date === today).sort(byTime), [tasks, today])
  const pendingToday = todayTasks.filter((t) => [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status))
  const priorities = useMemo(
    () => pendingToday.filter((t) => [PRIORITY.HIGH, PRIORITY.URGENT].includes(t.priority)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks],
  )
  const next = useMemo(
    () => pendingToday.find((t) => t.start_time && t.start_time.slice(0, 5) >= now) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks, now],
  )

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

  // UMA sugestao contextual (regras locais, sem IA).
  const suggestion =
    overdue.length > 0
      ? { text: `Reorganizar ${overdue.length} atrasada${overdue.length > 1 ? 's' : ''}?`, to: '/tarefas' }
      : undated.length > 0
        ? { text: `Você tem ${undated.length} tarefa${undated.length > 1 ? 's' : ''} sem data para organizar.`, to: '/tarefas' }
        : null

  const openTask = (t) => setEditing(t)

  // Agenda de hoje (compacta) — no desktop vira rail lateral; no mobile, secao.
  const agendaToday = (
    <section>
      <SectionHeader
        label="Agenda de hoje"
        action={
          <button onClick={() => navigate('/dia')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
            Abrir <ArrowRight size={14} />
          </button>
        }
      />
      {todayTasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed hair px-4 py-8 text-center text-sm text-slate-400">
          Nada agendado para hoje.
        </p>
      ) : (
        <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
          {todayTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={() => {}} />)}
        </div>
      )}
    </section>
  )

  return (
    <div className="mx-auto max-w-5xl">
      {/* Saudacao / contexto do momento */}
      <header className="animate-in mb-6">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{greetingFor(nowDate)},</p>
        <h1 className="text-display mt-0.5">{firstName}</h1>
        <p className="mt-1 text-sm capitalize text-slate-400">{formatLong(nowDate)}</p>
        <p className="mt-3 text-body font-medium text-slate-700 dark:text-slate-200">{phrase}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        {/* Coluna principal */}
        <div className="space-y-6">
          <DayPulse progress={progress} total={todayTasks.length} done={doneCount} overdue={overdue.length} />

          {suggestion && (
            <button
              onClick={() => navigate(suggestion.to)}
              className="interactive flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-3.5 text-left dark:bg-brand-900/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-brand-600 dark:bg-slate-900/40 dark:text-brand-300">
                <Sparkles size={17} />
              </span>
              <p className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{suggestion.text}</p>
              <ArrowRight size={16} className="shrink-0 text-brand-500" />
            </button>
          )}

          {loading && tasks.length === 0 ? (
            <TaskListSkeleton count={4} />
          ) : (
            <>
              {priorities.length > 0 && (
                <section>
                  <SectionHeader label="Prioridades" tone="text-amber-500" />
                  <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
                    {priorities.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={() => {}} />)}
                  </div>
                </section>
              )}

              {next && (
                <section>
                  <SectionHeader label="Próximo" />
                  <button onClick={() => openTask(next)} className="interactive surface flex w-full items-center gap-4 p-4 text-left ring-1 ring-slate-100 dark:ring-slate-800/70">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                      <Clock size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-slate-800 dark:text-slate-100">{next.title}</p>
                      <p className="mt-0.5 text-secondary">{next.start_time.slice(0, 5)}{next.end_time ? ` – ${next.end_time.slice(0, 5)}` : ''}</p>
                    </div>
                  </button>
                </section>
              )}

              {overdue.length > 0 && (
                <section>
                  <SectionHeader
                    label={`Atrasadas · ${overdue.length}`}
                    tone="text-red-500"
                    action={overdue.length > 3 ? (
                      <button onClick={() => navigate('/tarefas')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                        Ver todas <ArrowRight size={14} />
                      </button>
                    ) : null}
                  />
                  <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
                    {overdue.slice(0, 3).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showDate onChanged={() => {}} />)}
                  </div>
                </section>
              )}

              {/* Agenda de hoje: no mobile aparece aqui; no desktop, no rail. */}
              <div className="lg:hidden">{agendaToday}</div>

              {todayTasks.length === 0 && overdue.length === 0 && priorities.length === 0 && (
                <EmptyState
                  icon={Sun}
                  title="Dia em branco"
                  description="Nada puxando sua atenção agora. Capture algo pelo + ou aproveite a folga."
                  action={<button onClick={() => setCreating(true)} className="btn-primary press">Capturar</button>}
                />
              )}

              {recentIdeas.length > 0 && (
                <section>
                  <SectionHeader
                    label="Ideias recentes"
                    tone="text-amber-500"
                    action={
                      <button onClick={() => navigate('/ideias')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                        Ver Ideias <ArrowRight size={14} />
                      </button>
                    }
                  />
                  <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
                    {recentIdeas.map((n) => (
                      <button key={n.id} onClick={() => navigate(`/ideias/${n.id}`, { state: { note: n } })} className="list-row-hover w-full text-left">
                        <Lightbulb size={16} className="shrink-0 text-amber-400" />
                        <span className="truncate text-[15px] font-semibold text-slate-700 dark:text-slate-200">{ideaTitle(n)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Rail lateral (desktop) — base para o futuro painel de detalhe */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-6">
            {agendaToday}
            <button onClick={() => navigate('/dia')} className="interactive surface flex w-full items-center gap-3 p-4 text-left ring-1 ring-slate-100 dark:ring-slate-800/70">
              <CalendarDays size={18} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Ver semana e calendário</span>
              <ArrowRight size={15} className="ml-auto text-slate-300" />
            </button>
          </div>
        </aside>
      </div>

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
      <TaskModal open={creating} task={null} defaults={{ date: today }} onClose={() => setCreating(false)} />
    </div>
  )
}
