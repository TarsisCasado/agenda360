import { useState } from 'react'
import { Circle, CheckCircle2, Bell, MoreHorizontal, Pencil, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS, PRIORITY } from '../../lib/constants'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// TASK ROW — a unidade dominante do produto.
//
// Regras de ruido (o que MUDOU nesta fase):
//   - a linha secundaria so aparece quando ha informacao real; nada de meta
//     vazia ocupando altura;
//   - prioridade alta e uma BARRA fina na borda esquerda, nao um bullet no
//     meio do titulo;
//   - o "..." aparece no hover (desktop) ou no toque longo — no celular a
//     acao e o swipe, entao o botao nao fica competindo com o titulo;
//   - concluir da feedback imediato (animate-pop) antes da rede responder.
// ---------------------------------------------------------------------------
export default function TaskRow({ task, onOpen, onChanged, showDate = false, compact = false }) {
  const { user } = useAuth()
  const { categoryById } = useData()
  const { toast } = useToast()
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDone, setJustDone] = useState(false)
  useEscapeKey(menu, () => setMenu(false))

  const done = task.status === STATUS.DONE
  const category = categoryById(task.category_id)
  const highPriority = [PRIORITY.HIGH, PRIORITY.URGENT].includes(task.priority)

  const toggle = async (e) => {
    e?.stopPropagation?.()
    if (busy) return
    setBusy(true)
    if (!done) setJustDone(true)
    try {
      await taskService.changeStatus(user.id, task, done ? STATUS.TODO : STATUS.DONE)
      onChanged?.()
    } catch (err) {
      toast('Erro ao atualizar: ' + err.message, 'error')
    } finally {
      setBusy(false)
      setTimeout(() => setJustDone(false), 260)
    }
  }

  const meta = [
    task.start_time ? task.start_time.slice(0, 5) : null,
    showDate && task.date ? task.date.slice(8, 10) + '/' + task.date.slice(5, 7) : null,
    category?.name || null,
  ].filter(Boolean)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen?.(task)}
      className={cx(
        'group relative flex cursor-pointer select-none items-center gap-3 bg-surface px-3 transition-colors active:bg-surface-2',
        compact ? 'py-2' : 'py-2.5',
      )}
    >
      {/* Prioridade: barra fina, sem poluir o titulo */}
      {highPriority && !done && (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-warning" aria-hidden />
      )}

      {/* Concluir em 1 toque */}
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={done ? 'Reabrir' : 'Concluir'}
        className={cx(
          'press -m-2 shrink-0 p-2 transition-colors',
          done ? 'text-positive' : 'text-faint',
          justDone && 'animate-pop',
        )}
      >
        {done ? <CheckCircle2 size={21} /> : <Circle size={21} strokeWidth={1.7} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'truncate text-[15px] leading-snug',
            done ? 'font-normal text-muted line-through' : 'font-medium text-primary',
          )}
        >
          {task.title}
        </p>
        {meta.length > 0 && !done && (
          <div className="mt-0.5 flex items-center gap-1.5">
            {category && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
            )}
            <span className="text-caption truncate tabular-nums">{meta.join(' · ')}</span>
            {task.alert_enabled && <Bell size={11} className="shrink-0 text-faint" />}
          </div>
        )}
      </div>

      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Ações"
          className="press hidden h-8 w-8 items-center justify-center rounded-full text-faint opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 hover:bg-surface-2 hover:text-secondary sm:flex"
        >
          <MoreHorizontal size={17} />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="floating animate-scale-in absolute right-0 z-20 mt-1 w-40 p-1 text-[14px]">
              <button
                onClick={() => {
                  setMenu(false)
                  onOpen?.(task)
                }}
                className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-secondary transition-colors hover:bg-surface-2"
              >
                <Pencil size={15} /> Editar
              </button>
              <button
                onClick={() => {
                  setMenu(false)
                  toggle()
                }}
                className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-secondary transition-colors hover:bg-surface-2"
              >
                <Check size={15} /> {done ? 'Reabrir' : 'Concluir'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
