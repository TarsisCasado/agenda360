import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState } from '../components/ui/Common'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { taskService } from '../services/taskService'
import { getWeekDays, toISODate, addDays, isToday, formatShort, isTaskOverdue } from '../lib/date'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cx, capitalizeFirst } from '../lib/utils'

export default function WeekKanban({ embedded = false }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [reference, setReference] = useState(new Date())
  const days = useMemo(() => getWeekDays(reference), [reference])
  const range = useMemo(() => ({ start: toISODate(days[0]), end: toISODate(days[6]) }), [days])
  const { tasks, reload } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })
  const [dragOver, setDragOver] = useState(null)
  const [selected, setSelected] = useState(() => toISODate(new Date()))

  const tasksByDay = (iso) => tasks.filter((t) => t.date === iso)
  const openTask = (task) => setModal({ open: true, task, defaults: null })

  const handleDrop = async (e, iso) => {
    e.preventDefault(); setDragOver(null)
    const taskId = e.dataTransfer.getData('text/task-id')
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.date === iso) return
    try { await taskService.moveToDate(user.id, task, iso); toast(`Movida para ${formatShort(iso)}`); reload() }
    catch (err) { toast('Erro ao mover: ' + err.message, 'error') }
  }

  const go = (weeks) => setReference((r) => addDays(r, weeks * 7))
  const weekLabel = `${format(days[0], "d 'de' MMM", { locale: ptBR })} – ${format(days[6], "d 'de' MMM", { locale: ptBR })}`
  const selectedTasks = tasksByDay(selected)
  // garante que o dia selecionado pertença à semana visível
  const selInWeek = days.some((d) => toISODate(d) === selected)
  const activeIso = selInWeek ? selected : toISODate(days[0])

  return (
    // Embutido em Tarefas (visao Semana) quem titula a tela e Tarefas; aqui
    // sobra a navegacao de semana, que continua sendo deste componente.
    <div className={embedded ? '' : 'mx-auto max-w-6xl'}>
      <header className="mb-4 flex items-center justify-between">
        <div>
          {!embedded && <h1 className="text-display !text-[22px]">Semana</h1>}
          <p className={embedded ? 'text-page' : 'text-secondary-sm'}>{weekLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} className="btn-secondary press !px-2.5"><ChevronLeft size={16} /></button>
          <button onClick={() => setReference(new Date())} className="btn-secondary press text-sm">Hoje</button>
          <button onClick={() => go(1)} className="btn-secondary press !px-2.5"><ChevronRight size={16} /></button>
        </div>
      </header>

      {/* ---------- MOBILE/TABLET: seletor de dia + lista ---------- */}
      <div className="xl:hidden">
        <div className="mb-4 grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const iso = toISODate(day)
            const count = tasksByDay(iso).length
            const hasOverdue = tasksByDay(iso).some(isTaskOverdue)
            const active = iso === activeIso
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={cx(
                  'press flex flex-col items-center rounded-xl py-2 transition-colors',
                  active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                <span className="text-[10px] font-semibold uppercase">{format(day, 'EEEEEE', { locale: ptBR })}</span>
                <span className={cx('mt-0.5 text-base font-extrabold', isToday(day) && !active && 'text-brand-600 dark:text-brand-400')}>
                  {format(day, 'd')}
                </span>
                <span className={cx('mt-0.5 flex h-3 items-center gap-0.5', active ? 'text-white/80' : 'text-slate-400')}>
                  {count > 0 && <span className="text-[10px] font-bold">{count}</span>}
                  {hasOverdue && <span className="h-1 w-1 rounded-full bg-red-500" />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-section">{capitalizeFirst(format(new Date(activeIso + 'T12:00'), "EEEE, d 'de' MMM", { locale: ptBR }))}</h2>
          <button onClick={() => setModal({ open: true, task: null, defaults: { date: activeIso } })} className="press flex items-center gap-1 text-sm font-semibold text-brand-600">
            <Plus size={15} /> Nova
          </button>
        </div>
        {selectedTasks.length === 0 ? (
          <EmptyState icon={Plus} title="Dia livre" description="Nada agendado. Toque em Nova para adicionar." />
        ) : (
          <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
            {selectedTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={reload} />)}
          </div>
        )}
      </div>

      {/* ---------- DESKTOP (xl): 7 colunas com drag & drop ---------- */}
      <div className="hidden xl:block">
        <p className="mb-3 text-xs text-slate-400">Arraste os cards entre os dias para reagendar.</p>
        <div className="grid grid-cols-7 gap-3">
          {days.map((day) => {
            const iso = toISODate(day)
            const dayTasks = tasksByDay(iso)
            const todayCol = isToday(day)
            return (
              <div
                key={iso}
                onDragOver={(e) => { e.preventDefault(); setDragOver(iso) }}
                onDragLeave={() => setDragOver((d) => (d === iso ? null : d))}
                onDrop={(e) => handleDrop(e, iso)}
                className={cx(
                  'flex min-h-[240px] flex-col rounded-2xl p-2 transition-colors',
                  todayCol ? 'bg-brand-50/60 ring-1 ring-brand-200 dark:bg-brand-900/15 dark:ring-brand-900' : 'bg-slate-50 dark:bg-slate-900/40',
                  dragOver === iso && 'drag-over',
                )}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <div>
                    <p className={cx('text-sm font-bold', todayCol ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200')}>
                      {capitalizeFirst(format(day, 'EEEE', { locale: ptBR }))}
                    </p>
                    <p className="text-[11px] text-slate-400">{format(day, 'dd/MM')}{dayTasks.length > 0 && ` · ${dayTasks.length}`}</p>
                  </div>
                  <button onClick={() => setModal({ open: true, task: null, defaults: { date: iso } })} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-brand-600 dark:hover:bg-slate-800">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex-1 space-y-2">
                  {dayTasks.map((t) => (
                    <TaskCard key={t.id} task={t} draggable compact onEdit={openTask} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <TaskModal open={modal.open} task={modal.task} defaults={modal.defaults} onClose={() => setModal({ open: false, task: null, defaults: null })} />
    </div>
  )
}
