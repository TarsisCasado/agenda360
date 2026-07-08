import { useState } from 'react'
import { Clock, LinkIcon, Bell, Trash2, Pencil, MoreVertical } from 'lucide-react'
import { StatusBadge, PriorityBadge, CategoryBadge } from '../ui/Badges'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS_ORDER, STATUS_META } from '../../lib/constants'
import { cx } from '../../lib/utils'

export default function TaskCard({
  task,
  onEdit,
  onChanged,
  draggable = false,
  compact = false,
}) {
  const { categoryById } = useData()
  const { user } = useAuth()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const category = categoryById(task.category_id)

  const handleStatus = async (status) => {
    setMenuOpen(false)
    try {
      await taskService.changeStatus(user.id, task, status)
      toast('Status atualizado')
      onChanged?.()
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    }
  }

  const handleDelete = async () => {
    setMenuOpen(false)
    if (!window.confirm(`Excluir "${task.title}"?`)) return
    try {
      await taskService.remove(user.id, task)
      toast('Atividade excluida')
      onChanged?.()
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    }
  }

  const onDragStart = (e) => {
    e.dataTransfer.setData('text/task-id', task.id)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('dragging')
  }
  const onDragEnd = (e) => e.currentTarget.classList.remove('dragging')

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={cx(
        'card group relative p-3 transition-shadow hover:shadow-md',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
      style={{ borderLeft: `3px solid ${category?.color || '#cbd5e1'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onEdit?.(task)}
          className="flex-1 text-left"
          title="Editar"
        >
          <p
            className={cx(
              'text-sm font-semibold text-slate-800 dark:text-slate-100',
              task.status === 'done' && 'line-through opacity-60',
            )}
          >
            {task.title}
          </p>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 group-hover:opacity-100 dark:hover:bg-slate-800"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit?.(task)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Pencil size={14} /> Editar
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                <p className="px-3 py-1 text-[11px] font-semibold uppercase text-slate-400">
                  Mudar status
                </p>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    disabled={s === task.status}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: STATUS_META[s].dot }}
                    />
                    {STATUS_META[s].label}
                  </button>
                ))}
                <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {task.description && !compact && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
          {task.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.start_time && (
          <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Clock size={11} />
            {task.start_time}
            {task.end_time ? `-${task.end_time}` : ''}
          </span>
        )}
        <StatusBadge status={task.status} size="xs" />
        {!compact && category && <CategoryBadge category={category} />}
        {!compact && <PriorityBadge priority={task.priority} />}
        {task.link && (
          <a
            href={task.link}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="chip bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-900/30"
            title={task.link}
          >
            <LinkIcon size={11} /> link
          </a>
        )}
        {task.alert_enabled && (
          <span className="chip bg-amber-50 text-amber-600 dark:bg-amber-900/30">
            <Bell size={11} />
          </span>
        )}
        {task.reschedule_count > 0 && (
          <span
            className="chip bg-amber-50 text-amber-600 dark:bg-amber-900/30"
            title="Vezes reagendada"
          >
            ↻ {task.reschedule_count}
          </span>
        )}
      </div>
    </div>
  )
}
