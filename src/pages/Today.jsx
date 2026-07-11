import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sun,
  Clock,
  Flame,
  Repeat,
  Coffee,
  Sparkles,
  Target,
} from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState, ProgressRing } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
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
import {
  greeting,
  daySummary,
  completionStreak,
  weeklyProgress,
  buildInsights,
} from '../lib/insights'

const INSIGHT_ICON = {
  habit: Repeat,
  overdue: AlertTriangle,
  productive: Flame,
  calm: Coffee,
}
const INSIGHT_TONE = {
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300',
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/25 dark:text-brand-300',
}

// Cartao de insight (vivo, discreto). Icone + frase + acao opcional.
function InsightCard({ insight, onAct }) {
  const Icon = INSIGHT_ICON[insight.type] || Sparkles
  return (
    <div className="card animate-in flex items-center gap-3 p-3.5">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', INSIGHT_TONE[insight.tone] || INSIGHT_TONE.brand)}>
        <Icon size={17} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">{insight.title}</p>
      {insight.cta && (
        <button
          onClick={() => onAct(insight.cta)}
          className="press shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {insight.cta.label}
        </button>
      )}
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
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createDefaults, setCreateDefaults] = useState(null)

  const today = toISODate(new Date())
  const now = nowTimeString()

  const overdue = useMemo(
    () => tasks.filter((t) => isTaskOverdue(t)).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [tasks],
  )
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === today).sort(byTime),
    [tasks, today],
  )
  const pendingToday = todayTasks.filter((t) =>
    [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
  )
  const priorities = useMemo(
    () =>
      pendingToday.filter((t) =>
        [PRIORITY.HIGH, PRIORITY.URGENT].includes(t.priority),
      ),
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

  const streak = useMemo(() => completionStreak(tasks, today), [tasks, today])
  const weekly = useMemo(() => weeklyProgress(tasks, today, 10), [tasks, today])
  const insights = useMemo(
    () => buildInsights(tasks, { today }),
    [tasks, today],
  )
  const summary = daySummary({
    pending: pendingToday.length,
    done: doneCount,
    overdue: overdue.length,
    next,
  })

  const handleInsight = (cta) => {
    if (cta.kind === 'navigate') navigate(cta.payload)
    else if (cta.kind === 'create') {
      setCreateDefaults(cta.payload)
      setCreating(true)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Saudacao viva: personalidade + resumo humano do dia */}
      <div className="animate-in">
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <Sun size={18} />
          <span className="text-sm font-semibold">{greeting()},</span>
        </div>
        <h1 className="mt-0.5 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          {firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm capitalize text-slate-500">{formatLong(new Date())}</p>
        <p className="mt-2 text-[15px] font-medium text-slate-600 dark:text-slate-300">{summary}</p>
      </div>

      {/* Resumo do dia: anel de progresso + contadores */}
      <div className="card flex items-center gap-5 p-4">
        <ProgressRing value={progress} size={78}>
          <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {progress}%
          </span>
          <span className="text-[10px] text-slate-400">feito</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
              {todayTasks.length}
            </p>
            <p className="text-[11px] text-slate-400">hoje</p>
          </div>
          <div>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {doneCount}
            </p>
            <p className="text-[11px] text-slate-400">concluidas</p>
          </div>
          <div>
            <p
              className={
                'text-xl font-extrabold ' +
                (overdue.length ? 'text-red-500' : 'text-slate-800 dark:text-slate-100')
              }
            >
              {overdue.length}
            </p>
            <p className="text-[11px] text-slate-400">atrasadas</p>
          </div>
        </div>
      </div>

      {/* Gamificacao discreta: sequencia + meta semanal */}
      {(streak > 0 || weekly.done > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-900/25">
              <Flame size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-none text-slate-800 dark:text-slate-100">
                {streak} {streak === 1 ? 'dia' : 'dias'}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-400">organizado{streak === 1 ? '' : 's'} seguidos</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-900/25">
              <Target size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {weekly.done}<span className="text-slate-400">/{weekly.goal}</span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out"
                  style={{ width: `${weekly.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">meta da semana</p>
            </div>
          </div>
        </div>
      )}

      {/* Insights por regras (discretos, humanos) */}
      {insights.length > 0 && (
        <div className="space-y-2.5">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} onAct={handleInsight} />
          ))}
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <TaskListSkeleton count={4} />
      ) : (
        <>
          {/* Prioridades do dia */}
          {priorities.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-amber-500">
                <Flame size={14} /> Prioridades
              </h2>
              <div className="space-y-2.5">
                {priorities.map((t) => (
                  <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />
                ))}
              </div>
            </section>
          )}

          {/* Proxima atividade */}
          {next && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-400">
                <Clock size={14} /> Proxima
              </h2>
              <button
                onClick={() => setEditing(next)}
                className="interactive card block w-full overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className="h-1"
                  style={{ backgroundColor: categoryById(next.category_id)?.color || '#6366f1' }}
                />
                <div className="p-4">
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {next.title}
                  </p>
                  {next.start_time && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Clock size={14} /> {next.start_time}
                      {next.end_time ? ` - ${next.end_time}` : ''}
                    </p>
                  )}
                  {next.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {next.description}
                    </p>
                  )}
                </div>
              </button>
            </section>
          )}

          {/* Atrasadas */}
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-red-500">
                <AlertTriangle size={14} /> Atrasadas ({overdue.length})
              </h2>
              <div className="space-y-2.5">
                {overdue.map((t) => (
                  <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />
                ))}
              </div>
            </section>
          )}

          {/* Atividades de hoje */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-400">
                <Sun size={14} /> Hoje
              </h2>
              <button
                onClick={() => navigate('/dia')}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
              >
                Por horario <ArrowRight size={14} />
              </button>
            </div>
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nada para hoje"
                description="Um bom momento para adicionar algo importante ou simplesmente descansar."
                action={
                  <button onClick={() => { setCreateDefaults(null); setCreating(true) }} className="btn-primary press">
                    Criar atividade
                  </button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {todayTasks.map((t) => (
                  <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />
                ))}
              </div>
            )}
          </section>
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
