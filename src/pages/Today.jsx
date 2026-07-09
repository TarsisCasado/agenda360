import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sun,
  Clock,
  Flame,
} from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState, ProgressRing } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import WelcomeCard from '../components/onboarding/WelcomeCard'
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
import { percent } from '../lib/utils'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
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
  const firstName = user?.full_name?.split(' ')[0] || 'usuario'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Saudacao */}
      <div>
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <Sun size={18} />
          <span className="text-sm font-semibold">{greeting()},</span>
        </div>
        <h1 className="mt-0.5 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          {firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm capitalize text-slate-500">{formatLong(new Date())}</p>
      </div>

      {/* Onboarding (primeiro acesso) */}
      <WelcomeCard onCreateTask={() => setCreating(true)} />

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
                className="interactive card block w-full overflow-hidden text-left hover:shadow-md"
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
                description="Toque no botao + para adicionar sua primeira atividade."
                action={
                  <button onClick={() => setCreating(true)} className="btn-primary press">
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
        defaults={{ date: today }}
        onClose={() => setCreating(false)}
      />
    </div>
  )
}
