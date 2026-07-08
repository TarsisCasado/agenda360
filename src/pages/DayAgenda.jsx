import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Inbox } from 'lucide-react'
import { PageHeader } from '../components/ui/Common'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { useTasks } from '../hooks/useTasks'
import {
  toISODate,
  addDays,
  formatLong,
  isToday,
  fromISODate,
} from '../lib/date'
import { DAY_START_HOUR, DAY_END_HOUR } from '../lib/constants'

export default function DayAgenda() {
  const [date, setDate] = useState(toISODate(new Date()))
  const range = useMemo(() => ({ start: date, end: date }), [date])
  const { tasks } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })

  const hours = []
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 1) hours.push(h)

  const timed = tasks.filter((t) => t.start_time)
  const untimed = tasks.filter((t) => !t.start_time)

  const tasksAtHour = (h) =>
    timed.filter((t) => Number(t.start_time.split(':')[0]) === h)

  const go = (delta) => setDate(toISODate(addDays(fromISODate(date), delta)))

  const openNew = (hour) =>
    setModal({
      open: true,
      task: null,
      defaults: {
        date,
        start_time: hour != null ? `${String(hour).padStart(2, '0')}:00` : '',
      },
    })

  return (
    <div>
      <PageHeader
        title="Agenda do dia"
        subtitle={formatLong(date)}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => go(-1)} className="btn-secondary p-2">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setDate(toISODate(new Date()))}
              className="btn-secondary"
            >
              Hoje
            </button>
            <button onClick={() => go(1)} className="btn-secondary p-2">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => openNew(null)} className="btn-primary ml-1">
              <Plus size={16} /> Nova
            </button>
          </div>
        }
      />

      {isToday(fromISODate(date)) && (
        <p className="mb-3 text-xs font-medium text-brand-600">● Hoje</p>
      )}

      {/* Sem horario */}
      {untimed.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Inbox size={16} /> Sem horario definido
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {untimed.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onEdit={(task) => setModal({ open: true, task, defaults: null })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grade horaria */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {hours.map((h) => {
          const items = tasksAtHour(h)
          return (
            <div key={h} className="group flex gap-3 px-3 py-2">
              <button
                onClick={() => openNew(h)}
                className="w-14 shrink-0 pt-1 text-right text-xs font-semibold text-slate-400 hover:text-brand-600"
                title="Criar atividade neste horario"
              >
                {String(h).padStart(2, '0')}:00
              </button>
              <div className="flex-1 space-y-2 border-l border-slate-100 pl-3 dark:border-slate-800">
                {items.length === 0 ? (
                  <button
                    onClick={() => openNew(h)}
                    className="flex h-8 w-full items-center rounded-lg px-2 text-xs text-transparent transition-colors hover:bg-slate-50 group-hover:text-slate-400 dark:hover:bg-slate-800/60"
                  >
                    + adicionar
                  </button>
                ) : (
                  items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onEdit={(task) =>
                        setModal({ open: true, task, defaults: null })
                      }
                    />
                  ))
                )}
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
