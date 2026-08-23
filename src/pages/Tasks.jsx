import { useMemo, useState } from 'react'
import { Plus, ListTodo, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import RescheduleModal from '../components/tasks/RescheduleModal'
import SwipeRow from '../components/ui/SwipeRow'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { taskService } from '../services/taskService'
import { STATUS } from '../lib/constants'
import { toISODate, isTaskOverdue, byTime } from '../lib/date'

const OPEN = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]

export default function Tasks() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()
  const { tasks, loading, error, reload } = useTasks({}) // todas (inclui sem data)
  const [editing, setEditing] = useState(null)
  const [rescheduling, setRescheduling] = useState(null)
  const [quick, setQuick] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const today = toISODate(new Date())

  const groups = useMemo(() => {
    const open = tasks.filter((t) => OPEN.includes(t.status))
    const overdue = open.filter((t) => isTaskOverdue(t)).sort(byTime)
    const isOverdue = new Set(overdue.map((t) => t.id))
    const todayG = open.filter((t) => !isOverdue.has(t.id) && t.date === today).sort(byTime)
    const upcoming = open.filter((t) => !isOverdue.has(t.id) && t.date && t.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))
    const undated = open.filter((t) => !t.date)
    const done = tasks.filter((t) => t.status === STATUS.DONE).sort((a, b) => (a.date > b.date ? -1 : 1))
    return { overdue, todayG, upcoming, undated, done }
  }, [tasks, today])

  const totalOpen = groups.overdue.length + groups.todayG.length + groups.upcoming.length + groups.undated.length

  const quickAdd = async (e) => {
    e?.preventDefault?.()
    const title = quick.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      await taskService.create(workspaceId, user.id, { title, date: null, status: STATUS.TODO })
      setQuick(''); reload(); reloadData()
    } catch (err) { toast('Erro ao criar tarefa: ' + err.message, 'error') }
    finally { setAdding(false) }
  }

  const complete = async (task) => {
    try {
      await taskService.changeStatus(user.id, task, task.status === STATUS.DONE ? STATUS.TODO : STATUS.DONE)
      reload(); reloadData()
    } catch (err) { toast('Erro ao atualizar: ' + err.message, 'error') }
  }

  const Row = (t, opts = {}) => (
    <SwipeRow key={t.id} onSwipeRight={() => complete(t)} onSwipeLeft={() => setRescheduling(t)}>
      <TaskRow task={t} onOpen={setEditing} onChanged={() => { reload(); reloadData() }} showDate={opts.showDate} />
    </SwipeRow>
  )

  const Group = ({ label, items, tone, showDate }) =>
    items.length === 0 ? null : (
      <section>
        <h2 className={`mb-1.5 flex items-center gap-2 text-section ${tone || ''}`}>
          {label}
          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-400 dark:bg-slate-800">{items.length}</span>
        </h2>
        <div className="surface divide-y hair overflow-hidden ring-1 ring-slate-100 dark:ring-slate-800/70">
          {items.map((t) => Row(t, { showDate }))}
        </div>
      </section>
    )

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-display">Tarefas</h1>
        <p className="text-secondary mt-0.5">{totalOpen > 0 ? `${totalOpen} em aberto` : 'Tudo em dia'}</p>
      </header>

      {/* Captura rápida — 1 campo, sem exigir data */}
      <form onSubmit={quickAdd} className="surface-outline mb-6 flex items-center gap-2 px-3 py-1.5">
        <Plus size={18} className="shrink-0 text-slate-400" />
        <input
          className="flex-1 bg-transparent py-2 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          placeholder="Adicionar tarefa…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
        />
        {quick.trim() && (
          <button type="submit" disabled={adding} className="btn-primary press shrink-0 !px-3 !py-1.5">
            {adding ? <Loader2 size={15} className="animate-spin" /> : 'Add'}
          </button>
        )}
      </form>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading && tasks.length === 0 ? (
        <TaskListSkeleton count={5} />
      ) : totalOpen === 0 && groups.done.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nada pendente." description="Capture algo pelo + ou adicione uma tarefa acima." />
      ) : (
        <div className="space-y-6">
          <Group label="Atrasadas" items={groups.overdue} tone="!text-red-500" showDate />
          <Group label="Hoje" items={groups.todayG} />
          <Group label="Próximas" items={groups.upcoming} showDate />
          <Group label="Sem data" items={groups.undated} />

          {groups.done.length > 0 && (
            <section>
              <button onClick={() => setShowDone((v) => !v)} className="mb-1.5 flex items-center gap-1.5 text-section">
                {showDone ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Concluídas
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-400 dark:bg-slate-800">{groups.done.length}</span>
              </button>
              {showDone && (
                <div className="surface divide-y hair overflow-hidden opacity-70 ring-1 ring-slate-100 dark:ring-slate-800/70">
                  {groups.done.slice(0, 20).map((t) => (
                    <TaskRow key={t.id} task={t} onOpen={setEditing} onChanged={() => { reload(); reloadData() }} showDate />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} onSaved={() => { reload(); reloadData() }} />
      <RescheduleModal open={Boolean(rescheduling)} task={rescheduling} onClose={() => setRescheduling(null)} onDone={() => { setRescheduling(null); reload(); reloadData() }} />
    </div>
  )
}
