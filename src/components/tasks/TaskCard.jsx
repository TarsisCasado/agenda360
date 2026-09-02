import { useState, memo } from 'react'
import {
  Clock,
  LinkIcon,
  Bell,
  Trash2,
  Pencil,
  MoreVertical,
  Check,
  X,
  CalendarClock,
  Share2,
  Ban,
  AlertTriangle,
} from 'lucide-react'
import { StatusBadge, PriorityBadge, CategoryBadge } from '../ui/Badges'
import RescheduleModal from './RescheduleModal'
import DelegateModal from './DelegateModal'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { STATUS_ORDER, STATUS_META, STATUS } from '../../lib/constants'
import { isTaskOverdue } from '../../lib/date'
import { cx, sanitizeUrl } from '../../lib/utils'

// Botao de acao rapida (mobile-first, alvo de toque grande)
function QuickAction({ icon: Icon, label, onClick, tone = 'slate' }) {
  const tones = {
    emerald:
      'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40',
    red: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
    amber:
      'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40',
    violet:
      'text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40',
    slate:
      'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
  }
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors',
        tones[tone],
      )}
    >
      <Icon size={17} />
      {label}
    </button>
  )
}

function TaskCard({
  task,
  onEdit,
  onChanged,
  draggable = false,
  compact = false,
  showActions = false,
}) {
  const { categoryById, reload } = useData()
  const { user } = useAuth()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reschedOpen, setReschedOpen] = useState(false)
  const [delegOpen, setDelegOpen] = useState(false)
  useEscapeKey(menuOpen, () => setMenuOpen(false))
  const category = categoryById(task.category_id)
  const overdue = isTaskOverdue(task)

  // reload() (contexto) garante que a UI atualize em qualquer tela; onChanged
  // continua disponivel para reacoes locais adicionais do pai.
  const refresh = () => {
    reload()
    onChanged?.()
  }

  const handleStatus = async (status) => {
    setMenuOpen(false)
    try {
      await taskService.changeStatus(user.id, task, status)
      toast('Status atualizado')
      refresh()
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
      refresh()
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
        overdue && 'ring-1 ring-red-300 dark:ring-red-800/70',
      )}
      style={{ borderLeft: `3px solid ${overdue ? '#ef4444' : category?.color || '#cbd5e1'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onEdit?.(task)}
          className="min-w-0 flex-1 text-left"
          title="Editar"
        >
          <p
            className={cx(
              '[overflow-wrap:anywhere] text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100',
              task.status === STATUS.DONE && 'line-through opacity-60',
            )}
          >
            {task.title}
          </p>
        </button>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Acoes"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit?.(task)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Pencil size={14} /> Editar
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setReschedOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <CalendarClock size={14} /> Reagendar
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setDelegOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Share2 size={14} /> Delegar
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
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
        {overdue && (
          <span className="chip bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle size={11} /> Atrasada
          </span>
        )}
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
        {task.link && sanitizeUrl(task.link) && (
          <a
            href={sanitizeUrl(task.link)}
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

      {/* Barra de acoes rapidas (mobile-first) */}
      {showActions && (
        <div className="mt-2.5 flex items-stretch gap-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
          <QuickAction
            icon={Check}
            label="Feito"
            tone="emerald"
            onClick={() => handleStatus(STATUS.DONE)}
          />
          <QuickAction
            icon={X}
            label="Furei"
            tone="red"
            onClick={() => handleStatus(STATUS.MISSED)}
          />
          <QuickAction
            icon={CalendarClock}
            label="Reagendar"
            tone="amber"
            onClick={() => setReschedOpen(true)}
          />
          <QuickAction
            icon={Share2}
            label="Delegar"
            tone="violet"
            onClick={() => setDelegOpen(true)}
          />
          <QuickAction
            icon={Ban}
            label="N/N"
            tone="slate"
            onClick={() => handleStatus(STATUS.NOT_NEEDED)}
          />
        </div>
      )}

      <RescheduleModal
        open={reschedOpen}
        task={task}
        onClose={() => setReschedOpen(false)}
        onDone={onChanged}
      />
      <DelegateModal
        open={delegOpen}
        task={task}
        onClose={() => setDelegOpen(false)}
        onDone={onChanged}
      />
    </div>
  )
}

export default memo(TaskCard)
