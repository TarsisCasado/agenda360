import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '../components/ui/Common'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { taskService } from '../services/taskService'
import {
  getWeekDays,
  toISODate,
  addDays,
  isToday,
  formatShort,
} from '../lib/date'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cx } from '../lib/utils'

export default function WeekKanban() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [reference, setReference] = useState(new Date())
  const days = useMemo(() => getWeekDays(reference), [reference])
  const range = useMemo(
    () => ({ start: toISODate(days[0]), end: toISODate(days[6]) }),
    [days],
  )
  const { tasks, reload } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })
  const [dragOver, setDragOver] = useState(null)

  const tasksByDay = (iso) => tasks.filter((t) => t.date === iso)

  const handleDrop = async (e, iso) => {
    e.preventDefault()
    setDragOver(null)
    const taskId = e.dataTransfer.getData('text/task-id')
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.date === iso) return
    try {
      await taskService.moveToDate(user.id, task, iso)
      toast(`Movida para ${formatShort(iso)}`)
      reload()
    } catch (err) {
      toast('Erro ao mover: ' + err.message, 'error')
    }
  }

  const go = (weeks) => setReference((r) => addDays(r, weeks * 7))

  const weekLabel = `${format(days[0], "d 'de' MMM", { locale: ptBR })} - ${format(
    days[6],
    "d 'de' MMM",
    { locale: ptBR },
  )}`

  return (
    <div>
      <PageHeader
        title="Kanban semanal"
        subtitle={weekLabel}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => go(-1)} className="btn-secondary p-2">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setReference(new Date())} className="btn-secondary">
              Esta semana
            </button>
            <button onClick={() => go(1)} className="btn-secondary p-2">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      <p className="mb-3 text-xs text-slate-400">
        Arraste os cards entre os dias para reagendar automaticamente.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => {
          const iso = toISODate(day)
          const dayTasks = tasksByDay(iso)
          const todayCol = isToday(day)
          return (
            <div
              key={iso}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(iso)
              }}
              onDragLeave={() => setDragOver((d) => (d === iso ? null : d))}
              onDrop={(e) => handleDrop(e, iso)}
              className={cx(
                'flex min-h-[220px] flex-col rounded-xl border bg-slate-50 p-2 transition-colors dark:bg-slate-900/50',
                todayCol
                  ? 'border-brand-300 dark:border-brand-700'
                  : 'border-slate-200 dark:border-slate-800',
                dragOver === iso && 'drag-over',
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p
                    className={cx(
                      'text-sm font-bold capitalize',
                      todayCol
                        ? 'text-brand-600 dark:text-brand-400'
                        : 'text-slate-700 dark:text-slate-200',
                    )}
                  >
                    {format(day, 'EEEE', { locale: ptBR })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {format(day, 'dd/MM', { locale: ptBR })}
                    {dayTasks.length > 0 && ` · ${dayTasks.length}`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setModal({ open: true, task: null, defaults: { date: iso } })
                  }
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex-1 space-y-2">
                {dayTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    draggable
                    compact
                    onEdit={(task) =>
                      setModal({ open: true, task, defaults: null })
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <TaskModal
        open={modal.open}
        task={modal.task}
        defaults={modal.defaults}
        onClose={() => setModal({ open: false, task: null, defaults: null })}
      />
    </div>
  )
}
