import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sun,
  Clock,
  Flame,
  Sparkles,
  Lightbulb,
  ListTodo,
} from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks, useUndatedTasks } from '../hooks/useTasks'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
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
import { greeting, daySummary, buildInsights } from '../lib/insights'
import { ideaTitle, sortIdeasByRecent } from '../lib/ideas'

// Cabecalho de secao consistente (hierarquia forte, pouco ruido).
function SectionHead({ icon: Icon, label, tone = 'text-slate-400', action }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className={cx('flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider', tone)}>
        <Icon size={14} /> {label}
      </h2>
      {action}
    </div>
  )
}

export default function Today() {
  const { user } = useAuth()
  const { categoryById } = useData()
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
  const [createDefaults, setCreateDefaults] = useState(null)

  const today = toISODate(new Date())
  const now = nowTimeString()

  const overdue = useMemo(
    () => tasks.filter((t) => isTaskOverdue(t)).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [tasks],
  )
  const todayTasks = useMemo(() => tasks.filter((t) => t.date === today).sort(byTime), [tasks, today])
  const pendingToday = todayTasks.filter((t) => [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status))
  const priorities = useMemo(
    () => pendingToday.filter((t) => [PRIORITY.HIGH, PRIORITY.URGENT].includes(t.priority)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks],
  )
  const next = useMemo(
    () => pendingToday.find((t) => !t.start_time || t.start_time >= now) || pendingToday[0] || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayTasks, now],
  )

  const doneCount = todayTasks.filter((t) => t.status === STATUS.DONE).length
  const progress = percent(doneCount, todayTasks.length)
  const firstName = user?.full_name?.split(' ')[0] || 'você'

  const insights = useMemo(() => buildInsights(tasks, { today }), [tasks, today])
  const topInsight = insights[0] || null
  const recentIdeas = useMemo(() => sortIdeasByRecent(notes).slice(0, 3), [notes])

  const summary = daySummary({ pending: pendingToday.length, done: doneCount, overdue: overdue.length, next })

  const handleInsight = (cta) => {
    if (cta.kind === 'navigate') navigate(cta.payload)
    else if (cta.kind === 'create') { setCreateDefaults(cta.payload); setCreating(true) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Saudacao grande e limpa — hierarquia tipografica forte */}
      <header className="animate-in">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{greeting()},</p>
        <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          {firstName} 👋
        </h1>
        <p className="mt-1 text-sm capitalize text-slate-400">{formatLong(new Date())}</p>
        <p className="mt-3 text-[17px] font-medium leading-snug text-slate-700 dark:text-slate-200">{summary}</p>
      </header>

      {/* Pulso do dia: uma unica faixa limpa (progresso + numeros), sem varios cards */}
      <div className="flex items-center gap-4 rounded-2xl bg-slate-900 px-5 py-4 text-white dark:bg-slate-800">
        <div className="flex-1">
          <p className="text-3xl font-extrabold leading-none">{progress}%</p>
          <p className="mt-1 text-xs text-white/60">do dia concluído</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex gap-5 text-center">
          <div>
            <p className="text-xl font-extrabold">{todayTasks.length}</p>
            <p className="text-[10px] text-white/50">hoje</p>
          </div>
          <div>
            <p className={cx('text-xl font-extrabold', overdue.length ? 'text-red-400' : 'text-white')}>{overdue.length}</p>
            <p className="text-[10px] text-white/50">atrasadas</p>
          </div>
        </div>
      </div>

      {/* Um insight no maximo — evita excesso de cards */}
      {topInsight && (
        <button
          onClick={() => topInsight.cta && handleInsight(topInsight.cta)}
          className="interactive flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-3.5 text-left dark:bg-brand-900/20"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-brand-600 dark:bg-slate-900/40 dark:text-brand-300">
            <Sparkles size={17} />
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{topInsight.title}</p>
          {topInsight.cta && <ArrowRight size={16} className="shrink-0 text-brand-500" />}
        </button>
      )}

      {loading && tasks.length === 0 ? (
        <TaskListSkeleton count={4} />
      ) : (
        <>
          {priorities.length > 0 && (
            <section>
              <SectionHead icon={Flame} label="Prioridades" tone="text-amber-500" />
              <div className="space-y-2.5">
                {priorities.map((t) => <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />)}
              </div>
            </section>
          )}

          {next && (
            <section>
              <SectionHead icon={Clock} label="Próxima" />
              <button
                onClick={() => setEditing(next)}
                className="interactive card block w-full overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="h-1" style={{ backgroundColor: categoryById(next.category_id)?.color || '#6366f1' }} />
                <div className="p-4">
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{next.title}</p>
                  {next.start_time && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Clock size={14} /> {next.start_time}{next.end_time ? ` - ${next.end_time}` : ''}
                    </p>
                  )}
                  {next.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{next.description}</p>}
                </div>
              </button>
            </section>
          )}

          {overdue.length > 0 && (
            <section>
              <SectionHead icon={AlertTriangle} label={`Atrasadas (${overdue.length})`} tone="text-red-500" />
              <div className="space-y-2.5">
                {overdue.map((t) => <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />)}
              </div>
            </section>
          )}

          <section>
            <SectionHead
              icon={Sun}
              label="Hoje"
              action={
                <button onClick={() => navigate('/dia')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                  Por horário <ArrowRight size={14} />
                </button>
              }
            />
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nada agendado para hoje"
                description="Um bom momento para adiantar algo importante ou simplesmente descansar."
                action={
                  <button onClick={() => { setCreateDefaults(null); setCreating(true) }} className="btn-primary press">
                    Criar atividade
                  </button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {todayTasks.map((t) => <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />)}
              </div>
            )}
          </section>

          {/* Aguardando acao: tarefas sem data vivem em Tarefas */}
          {undated.length > 0 && (
            <section>
              <SectionHead
                icon={ListTodo}
                label={`Aguardando ação (${undated.length})`}
                action={
                  <button onClick={() => navigate('/tarefas')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                    Ver Tarefas <ArrowRight size={14} />
                  </button>
                }
              />
              <div className="space-y-2.5">
                {undated.slice(0, 3).map((t) => <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />)}
              </div>
            </section>
          )}

          {/* Ideias recentes */}
          {recentIdeas.length > 0 && (
            <section>
              <SectionHead
                icon={Lightbulb}
                label="Ideias recentes"
                tone="text-amber-500"
                action={
                  <button onClick={() => navigate('/ideias')} className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                    Ver Ideias <ArrowRight size={14} />
                  </button>
                }
              />
              <div className="space-y-2">
                {recentIdeas.map((n) => {
                  const title = ideaTitle(n)
                  return (
                    <button
                      key={n.id}
                      onClick={() => navigate(`/ideias/${n.id}`, { state: { note: n } })}
                      className="interactive card flex w-full items-center gap-3 px-4 py-3 text-left hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Lightbulb size={16} className="shrink-0 text-amber-400" />
                      <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
      <TaskModal
        open={creating}
        task={null}
        defaults={createDefaults || { date: today }}
        onClose={() => { setCreating(false); setCreateDefaults(null) }}
      />
    </div>
  )
}
