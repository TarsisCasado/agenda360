import { useMemo, useState } from 'react'
import { Plus, ListTodo, Loader2, CheckCircle2, Circle } from 'lucide-react'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { taskService } from '../services/taskService'
import { STATUS } from '../lib/constants'
import { groupTasksByStatus } from '../lib/taskGroups'
import { cx } from '../lib/utils'

// ---------------------------------------------------------------------------
// TAREFAS — organizador de tarefas independente do calendario.
//
// Conceito: TAREFA != EVENTO. Uma tarefa pode existir SEM data (vive so aqui);
// se ganhar data, tambem aparece em Hoje/Agenda. Reutiliza a entidade `tasks`
// (date ja e nullable desde a migration 0007) e o reminderService existente —
// sem tabela nova.
//
// Fase 1: colunas por status (A fazer / Em andamento / Concluido), criacao
// rapida sem exigir data, edicao pelo TaskModal, concluir em 1 toque. Board com
// drag-and-drop fica documentado como proximo passo.
// ---------------------------------------------------------------------------

// Colunas usam SOMENTE status ja existentes no enum (sem migration). "Aguardando"
// entra numa proxima etapa (exige ADD VALUE aditivo no enum task_status).
const COLUMNS = [
  { key: STATUS.TODO, label: 'A fazer', accent: 'text-slate-500', dot: 'bg-slate-400' },
  { key: STATUS.IN_PROGRESS, label: 'Em andamento', accent: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  { key: STATUS.DONE, label: 'Concluido', accent: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
]

export default function Tasks() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()
  // Sem intervalo => TODAS as tarefas do workspace (inclui as sem data).
  const { tasks, loading, error, reload } = useTasks({})
  const [editing, setEditing] = useState(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('all') // all | todo | in_progress | done

  const byStatus = useMemo(
    () => groupTasksByStatus(tasks, [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.DONE]),
    [tasks],
  )

  const quickAdd = async (e) => {
    e?.preventDefault?.()
    const title = quickTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      // Criacao rapida REAL: sem data, sem horario, status "a fazer".
      await taskService.create(workspaceId, user.id, { title, date: null, status: STATUS.TODO })
      setQuickTitle('')
      reload()
      reloadData()
    } catch (err) {
      toast('Erro ao criar tarefa: ' + err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const complete = async (task) => {
    const done = task.status === STATUS.DONE
    try {
      await taskService.changeStatus(user.id, task, done ? STATUS.TODO : STATUS.DONE)
      reload()
      reloadData()
    } catch (err) {
      toast('Erro ao atualizar: ' + err.message, 'error')
    }
  }

  const visibleColumns = filter === 'all' ? COLUMNS : COLUMNS.filter((c) => c.key === filter)
  const total = tasks.length

  return (
    <div className="mx-auto max-w-5xl">
      {/* Cabecalho forte + criacao rapida sempre a mao */}
      <header className="mb-5">
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <ListTodo size={18} />
          <span className="text-sm font-semibold">Organizador</span>
        </div>
        <h1 className="mt-0.5 text-2xl font-extrabold text-slate-800 dark:text-slate-100">Tarefas</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          O que precisa ser feito — com ou sem data. {total > 0 && `${total} no total.`}
        </p>
      </header>

      <form onSubmit={quickAdd} className="mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Plus size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Adicionar tarefa e pressionar Enter..."
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            aria-label="Nova tarefa"
          />
        </div>
        <button type="submit" className="btn-primary press shrink-0" disabled={!quickTitle.trim() || adding}>
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span className="hidden sm:inline">Adicionar</span>
        </button>
      </form>

      {/* Filtro por status (chips) — mobile-first */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[{ key: 'all', label: 'Todas' }, ...COLUMNS].map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cx(
              'press shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === c.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading && tasks.length === 0 ? (
        <TaskListSkeleton count={4} />
      ) : total === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nenhuma tarefa ainda"
          description="Crie tarefas rapidas mesmo sem data. Elas ficam aqui ate voce agenda-las ou concluir."
        />
      ) : (
        <div className={cx('gap-5', filter === 'all' ? 'grid grid-cols-1 lg:grid-cols-3' : 'block')}>
          {visibleColumns.map((col) => {
            const items = byStatus[col.key]
            return (
              <section key={col.key}>
                <h2 className={cx('mb-2.5 flex items-center gap-2 text-sm font-bold uppercase tracking-wide', col.accent)}>
                  <span className={cx('h-2 w-2 rounded-full', col.dot)} />
                  {col.label}
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">
                    {items.length}
                  </span>
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
                    Vazio
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {items.map((t) => (
                      <div key={t.id} className="flex items-start gap-2">
                        <button
                          onClick={() => complete(t)}
                          className="press mt-3 shrink-0 text-slate-300 transition-colors hover:text-emerald-500"
                          aria-label={t.status === STATUS.DONE ? 'Reabrir' : 'Concluir'}
                        >
                          {t.status === STATUS.DONE ? (
                            <CheckCircle2 size={20} className="text-emerald-500" />
                          ) : (
                            <Circle size={20} />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <TaskCard task={t} showActions onEdit={setEditing} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} onSaved={() => { reload(); reloadData() }} />
    </div>
  )
}
