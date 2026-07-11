import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react'
import { PageHeader, EmptyState } from '../components/ui/Common'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import Modal from '../components/ui/Modal'
import { useTasks } from '../hooks/useTasks'
import { useData } from '../context/DataContext'
import {
  getMonthGrid,
  monthRange,
  toISODate,
  isToday,
  formatMonthTitle,
  formatLong,
} from '../lib/date'
import { addMonths, isSameMonth } from 'date-fns'
import { cx } from '../lib/utils'

const WEEK_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']

export default function MonthCalendar() {
  const [reference, setReference] = useState(new Date())
  const { categoryById } = useData()
  const grid = useMemo(() => getMonthGrid(reference), [reference])
  const range = useMemo(() => monthRange(reference), [reference])
  const { tasks } = useTasks(range)

  const [dayModal, setDayModal] = useState({ open: false, iso: null })
  const [taskModal, setTaskModal] = useState({ open: false, task: null, defaults: null })

  const tasksByDay = (iso) => tasks.filter((t) => t.date === iso)

  const go = (delta) => setReference((r) => addMonths(r, delta))

  const selectedTasks = dayModal.iso ? tasksByDay(dayModal.iso) : []

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle={<span className="capitalize">{formatMonthTitle(reference)}</span>}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => go(-1)} className="btn-secondary p-2">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setReference(new Date())} className="btn-secondary">
              Hoje
            </button>
            <button onClick={() => go(1)} className="btn-secondary p-2">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
          {WEEK_HEADERS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-bold uppercase text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const iso = toISODate(day)
            const dayTasks = tasksByDay(iso)
            const inMonth = isSameMonth(day, reference)
            const today = isToday(day)
            return (
              <button
                key={iso}
                onClick={() => setDayModal({ open: true, iso })}
                className={cx(
                  'group relative flex min-h-[58px] flex-col gap-1 border-b border-r border-slate-100 p-1 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 sm:min-h-[92px] sm:p-1.5',
                  !inMonth && 'bg-slate-50/50 dark:bg-slate-900/30',
                  today && 'bg-brand-50/40 dark:bg-brand-900/10',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      today
                        ? 'bg-brand-600 text-white'
                        : inMonth
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-300 dark:text-slate-600',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTaskModal({ open: true, task: null, defaults: { date: iso } })
                    }}
                    className="rounded p-0.5 text-slate-300 opacity-0 hover:text-brand-600 group-hover:opacity-100"
                  >
                    <Plus size={14} />
                  </span>
                </div>
                {/* Mobile: pontos coloridos. Desktop: barras com titulo. */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {dayTasks.slice(0, 4).map((t) => {
                    const cat = categoryById(t.category_id)
                    return (
                      <span
                        key={t.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: cat?.color || '#94a3b8' }}
                      />
                    )
                  })}
                </div>
                <div className="hidden space-y-1 overflow-hidden sm:block">
                  {dayTasks.slice(0, 3).map((t) => {
                    const cat = categoryById(t.category_id)
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: (cat?.color || '#94a3b8') + '22',
                          color: cat?.color || '#64748b',
                        }}
                      >
                        <span className="truncate">
                          {t.start_time ? t.start_time + ' ' : ''}
                          {t.title}
                        </span>
                      </div>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <p className="px-1 text-[10px] text-slate-400">
                      +{dayTasks.length - 3} mais
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Modal do dia */}
      <Modal
        open={dayModal.open}
        onClose={() => setDayModal({ open: false, iso: null })}
        title={dayModal.iso ? formatLong(dayModal.iso) : ''}
        footer={
          <button
            className="btn-primary"
            onClick={() => {
              setTaskModal({
                open: true,
                task: null,
                defaults: { date: dayModal.iso },
              })
            }}
          >
            <Plus size={16} /> Nova atividade
          </button>
        }
      >
        {selectedTasks.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="Dia livre"
            description="Nenhuma atividade por aqui. Que tal planejar algo?"
            action={
              <button
                className="btn-primary press"
                onClick={() =>
                  setTaskModal({ open: true, task: null, defaults: { date: dayModal.iso } })
                }
              >
                <Plus size={16} /> Nova atividade
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onEdit={(task) =>
                  setTaskModal({ open: true, task, defaults: null })
                }
              />
            ))}
          </div>
        )}
      </Modal>

      <TaskModal
        open={taskModal.open}
        task={taskModal.task}
        defaults={taskModal.defaults}
        onClose={() => setTaskModal({ open: false, task: null, defaults: null })}
      />
    </div>
  )
}
