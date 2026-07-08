import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sun,
  Clock,
  ListTodo,
} from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState } from '../components/ui/Common'
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
import { STATUS } from '../lib/constants'
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
  const { tasks } = useTasks(range)
  const [editing, setEditing] = useState(null)

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

  const next = useMemo(() => {
    const pending = todayTasks.filter((t) =>
      [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
    )
    return (
      pending.find((t) => !t.start_time || t.start_time >= now) || pending[0] || null
    )
  }, [todayTasks, now])

  const doneCount = todayTasks.filter((t) => t.status === STATUS.DONE).length

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Saudacao */}
      <div>
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <Sun size={18} />
          <span className="text-sm font-semibold">{greeting()},</span>
        </div>
        <h1 className="mt-0.5 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          {user?.full_name?.split(' ')[0] || 'usuario'} 👋
        </h1>
        <p className="mt-0.5 text-sm capitalize text-slate-500">{formatLong(new Date())}</p>
      </div>

      {/* Resumo do dia */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card flex flex-col items-center justify-center p-3 text-center">
          <ListTodo size={18} className="text-brand-500" />
          <p className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {todayTasks.length}
          </p>
          <p className="text-[11px] text-slate-400">hoje</p>
        </div>
        <div className="card flex flex-col items-center justify-center p-3 text-center">
          <CheckCircle2 size={18} className="text-emerald-500" />
          <p className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {doneCount}
          </p>
          <p className="text-[11px] text-slate-400">
            {percent(doneCount, todayTasks.length)}% feito
          </p>
        </div>
        <div className="card flex flex-col items-center justify-center p-3 text-center">
          <AlertTriangle size={18} className="text-red-500" />
          <p className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {overdue.length}
          </p>
          <p className="text-[11px] text-slate-400">atrasadas</p>
        </div>
      </div>

      {/* Proxima atividade */}
      {next && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-400">
            <Clock size={14} /> Proxima
          </h2>
          <div className="card overflow-hidden">
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
          </div>
        </div>
      )}

      {/* Atrasadas */}
      {overdue.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-red-500">
            <AlertTriangle size={14} /> Atrasadas ({overdue.length})
          </h2>
          <div className="space-y-2.5">
            {overdue.map((t) => (
              <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />
            ))}
          </div>
        </div>
      )}

      {/* Atividades de hoje */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-400">
            <Sun size={14} /> Hoje
          </h2>
          <button
            onClick={() => navigate('/dia')}
            className="flex items-center gap-1 text-sm font-medium text-brand-600"
          >
            Por horario <ArrowRight size={14} />
          </button>
        </div>
        {todayTasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nada para hoje"
            description="Toque no botao + para adicionar sua primeira atividade."
          />
        ) : (
          <div className="space-y-2.5">
            {todayTasks.map((t) => (
              <TaskCard key={t.id} task={t} showActions onEdit={setEditing} />
            ))}
          </div>
        )}
      </div>

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
