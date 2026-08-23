import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Inbox, MoonStar } from 'lucide-react'
import { ErrorState } from '../components/ui/Common'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import { useData } from '../context/DataContext'
import { useTasks } from '../hooks/useTasks'
import { toISODate, addDays, formatLong, isToday, fromISODate } from '../lib/date'
import { DAY_START_HOUR, DAY_END_HOUR } from '../lib/constants'
import { partitionDayTasks, resolveDayDate } from '../lib/dayView'
import { blockGeometry } from '../lib/agendaTime'

const HOUR_PX = 56

// Bloco de compromisso posicionado/proporcional na timeline.
function EventBlock({ task, top, height, color, onOpen }) {
  return (
    <button
      onClick={() => onOpen(task)}
      style={{ top, height }}
      className="absolute left-14 right-1 z-10 flex flex-col overflow-hidden rounded-xl bg-white px-2.5 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900"
    >
      <span className="absolute inset-0 -z-10 opacity-[0.14]" style={{ backgroundColor: color }} />
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} />
      <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{task.title}</span>
      {height > 34 && (
        <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
          {String(task.start_time).slice(0, 5)}{task.end_time ? `–${String(task.end_time).slice(0, 5)}` : ''}
        </span>
      )}
    </button>
  )
}

export default function DayAgenda() {
  const [searchParams] = useSearchParams()
  const { categoryById } = useData()
  const [date, setDate] = useState(() => resolveDayDate(searchParams.get('date'), toISODate(new Date())))

  const dateParam = searchParams.get('date')
  useEffect(() => { if (dateParam) setDate(dateParam) }, [dateParam])

  const range = useMemo(() => ({ start: date, end: date }), [date])
  const { tasks, error, reload } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })

  const taskParam = searchParams.get('task')
  const autoOpenedRef = useRef(null)
  useEffect(() => {
    if (!taskParam || autoOpenedRef.current === taskParam) return
    const found = tasks.find((t) => t.id === taskParam)
    if (found) { autoOpenedRef.current = taskParam; setModal({ open: true, task: found, defaults: null }) }
  }, [taskParam, tasks])

  const { untimed, timed, outOfGrid } = useMemo(
    () => partitionDayTasks(tasks, { startHour: DAY_START_HOUR, endHour: DAY_END_HOUR }),
    [tasks],
  )

  const hours = []
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 1) hours.push(h)
  const gridStartMin = DAY_START_HOUR * 60
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_PX

  const go = (delta) => setDate(toISODate(addDays(fromISODate(date), delta)))
  const openTask = (task) => setModal({ open: true, task, defaults: null })
  const openNew = (hour) =>
    setModal({ open: true, task: null, defaults: { date, start_time: hour != null ? `${String(hour).padStart(2, '0')}:00` : '' } })

  const today = isToday(fromISODate(date))
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nowTop = ((nowMin - gridStartMin) / 60) * HOUR_PX
  const nowVisible = today && nowMin >= gridStartMin && nowMin <= (DAY_END_HOUR + 1) * 60

  return (
    <div className="mx-auto max-w-2xl">
      {/* Cabeçalho de navegação por dia */}
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-display !text-[22px] capitalize">{today ? 'Hoje' : formatLong(date)}</h1>
          {today ? <p className="text-secondary capitalize">{formatLong(date)}</p> : <p className="text-secondary">Agenda do dia</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} className="btn-secondary press !px-2.5" aria-label="Dia anterior"><ChevronLeft size={16} /></button>
          <button onClick={() => setDate(toISODate(new Date()))} className="btn-secondary press text-sm">Hoje</button>
          <button onClick={() => go(1)} className="btn-secondary press !px-2.5" aria-label="Próximo dia"><ChevronRight size={16} /></button>
        </div>
      </header>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {untimed.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-1.5 flex items-center gap-1.5 text-section"><Inbox size={13} /> Sem horário</h2>
              <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
                {untimed.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={reload} />)}
              </div>
            </section>
          )}

          {/* TIMELINE proporcional */}
          <div className="relative" style={{ height: gridHeight }}>
            {/* linhas de hora + gutter + slots clicáveis (vazio -> criar) */}
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0" style={{ top: i * HOUR_PX, height: HOUR_PX }}>
                <span className="absolute left-0 top-[-7px] w-12 text-right text-[11px] font-semibold text-slate-300 dark:text-slate-600">
                  {String(h).padStart(2, '0')}:00
                </span>
                <div className="absolute left-14 right-0 top-0 border-t hair" />
                <button
                  onClick={() => openNew(h)}
                  className="group absolute left-14 right-0 top-0 flex h-full w-auto items-start justify-end px-2 pt-1"
                  aria-label={`Criar às ${h}:00`}
                >
                  <Plus size={13} className="text-transparent transition-colors group-hover:text-brand-400" />
                </button>
              </div>
            ))}

            {/* linha do agora */}
            {nowVisible && (
              <div className="pointer-events-none absolute left-12 right-0 z-20" style={{ top: nowTop }}>
                <div className="flex items-center">
                  <span className="h-2.5 w-2.5 -ml-1.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-950" />
                  <span className="h-px flex-1 bg-red-500/70" />
                </div>
              </div>
            )}

            {/* blocos de compromisso */}
            {timed.map((t) => {
              const { top, height } = blockGeometry(t.start_time, t.end_time, { startHour: DAY_START_HOUR, hourPx: HOUR_PX })
              return <EventBlock key={t.id} task={t} top={top} height={height} color={categoryById(t.category_id)?.color || '#6366f1'} onOpen={openTask} />
            })}
          </div>

          {outOfGrid.length > 0 && (
            <section className="mt-4">
              <h2 className="mb-1.5 flex items-center gap-1.5 text-section"><MoonStar size={13} /> Fora da grade</h2>
              <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
                {outOfGrid.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={reload} />)}
              </div>
            </section>
          )}
        </>
      )}

      <TaskModal
        open={modal.open}
        task={modal.task}
        defaults={modal.defaults}
        onClose={() => setModal({ open: false, task: null, defaults: null })}
      />
    </div>
  )
}
