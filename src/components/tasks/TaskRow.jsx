import { useState } from 'react'
import { Circle, CheckCircle2, Bell, MoreHorizontal, Pencil, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS, PRIORITY } from '../../lib/constants'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { cx } from '../../lib/utils'

// Linha de tarefa COMPACTA (Design System V2). Substitui o card grande dentro
// do Hoje: circulo para concluir em 1 toque, titulo forte, 1 linha secundaria
// discreta (horario · categoria · lembrete) e um menu "..." para acoes.
// Toque na linha abre o comportamento existente (onOpen -> TaskModal).
export default function TaskRow({ task, onOpen, onChanged, showDate = false }) {
  const { user } = useAuth()
  const { categoryById } = useData()
  const { toast } = useToast()
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  useEscapeKey(menu, () => setMenu(false))

  const done = task.status === STATUS.DONE
  const category = categoryById(task.category_id)
  const highPriority = [PRIORITY.HIGH, PRIORITY.URGENT].includes(task.priority)

  const toggle = async (e) => {
    e?.stopPropagation?.()
    if (busy) return
    setBusy(true)
    try {
      await taskService.changeStatus(user.id, task, done ? STATUS.TODO : STATUS.DONE)
      onChanged?.()
    } catch (err) {
      toast('Erro ao atualizar: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const meta = [
    task.start_time ? task.start_time.slice(0, 5) : null,
    showDate && task.date ? task.date : null,
    category?.name || null,
  ].filter(Boolean)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen?.(task)}
      className="list-row-hover group cursor-pointer select-none"
    >
      {/* Concluir (1 toque) */}
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={done ? 'Reabrir' : 'Concluir'}
        className={cx('press shrink-0 transition-colors', done ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500 dark:text-slate-600')}
      >
        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>

      {/* Titulo + meta */}
      <div className="min-w-0 flex-1">
        <p className={cx('truncate text-[15px] font-semibold', done ? 'text-slate-400 line-through dark:text-slate-600' : 'text-slate-800 dark:text-slate-100')}>
          {highPriority && !done && <span className="mr-1 text-amber-500">•</span>}
          {task.title}
        </p>
        {meta.length > 0 && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            {category && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />}
            <span className="truncate">{meta.join(' · ')}</span>
            {task.alert_enabled && <Bell size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />}
          </div>
        )}
      </div>

      {/* Menu "..." */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Acoes"
          className="press rounded-lg p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800 sm:opacity-100"
        >
          <MoreHorizontal size={18} />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="elevated absolute right-0 z-20 mt-1 w-40 p-1 text-sm">
              <button onClick={() => { setMenu(false); onOpen?.(task) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <Pencil size={15} /> Editar
              </button>
              <button onClick={() => { setMenu(false); toggle() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <Check size={15} /> {done ? 'Reabrir' : 'Concluir'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
