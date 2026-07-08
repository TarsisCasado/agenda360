import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  ListTodo,
  XCircle,
  TrendingUp,
  CalendarClock,
  ArrowRight,
} from 'lucide-react'
import { PageHeader, StatCard, EmptyState } from '../components/ui/Common'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { monthRange, toISODate, formatLong } from '../lib/date'
import { STATUS } from '../lib/constants'
import { percent } from '../lib/utils'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const range = useMemo(() => monthRange(new Date()), [])
  const { tasks } = useTasks(range)
  const [editing, setEditing] = useState(null)

  const today = toISODate(new Date())
  const todayTasks = tasks.filter((t) => t.date === today)
  const upcoming = tasks
    .filter((t) => t.date > today && ![STATUS.DONE, STATUS.CANCELLED].includes(t.status))
    .slice(0, 5)

  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === STATUS.DONE).length
    const missed = tasks.filter((t) => t.status === STATUS.MISSED).length
    const pending = tasks.filter((t) =>
      [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
    ).length
    return {
      total,
      done,
      missed,
      pending,
      completion: percent(done, total),
    }
  }, [tasks])

  return (
    <div>
      <PageHeader
        title={`Ola, ${user?.full_name?.split(' ')[0] || 'usuario'} 👋`}
        subtitle={formatLong(new Date())}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Atividades no mes" value={stats.total} icon={ListTodo} tone="brand" />
        <StatCard
          label="Concluidas"
          value={stats.done}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${stats.completion}% de conclusao`}
        />
        <StatCard label="Pendentes" value={stats.pending} icon={CalendarClock} tone="amber" />
        <StatCard label="Furadas" value={stats.missed} icon={XCircle} tone="red" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Hoje */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Atividades de hoje
            </h2>
            <button
              onClick={() => navigate('/dia')}
              className="btn-ghost text-sm text-brand-600"
            >
              Ver agenda <ArrowRight size={14} />
            </button>
          </div>
          {todayTasks.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nada para hoje"
              description="Aproveite o dia livre ou crie uma nova atividade."
            />
          ) : (
            <div className="space-y-2.5">
              {todayTasks.map((t) => (
                <TaskCard key={t.id} task={t} onEdit={setEditing} />
              ))}
            </div>
          )}
        </div>

        {/* Proximas */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-brand-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Proximas
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sem atividades futuras" />
          ) : (
            <div className="space-y-2.5">
              {upcoming.map((t) => (
                <TaskCard key={t.id} task={t} onEdit={setEditing} compact />
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
