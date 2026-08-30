import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react'
import { EmptyState, ErrorState } from '../components/ui/Common'
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

const WEEK_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function MonthCalendar() {
  const [reference, setReference] = useState(new Date())
  const { categoryById } = useData()
  const grid = useMemo(() => getMonthGrid(reference), [reference])
  const range = useMemo(() => monthRange(reference), [reference])
  const { tasks, error, reload } = useTasks(range)

  const [dayModal, setDayModal] = useState({ open: false, iso: null })
  const [taskModal, setTaskModal] = useState({ open: false, task: null, defaults: null })

  const tasksByDay = (iso) => tasks.filter((t) => t.date === iso)

  const go = (delta) => setReference((r) => addMonths(r, delta))

  const selectedTasks = dayModal.iso ? tasksByDay(dayModal.iso) : []

  // A grade e desenhada por SEMANA (6 linhas de 7): e o que permite trocar as
  // bordas de cada celula por um unico hairline entre semanas.
  const weeks = useMemo(() => {
    const rows = []
    for (let i = 0; i < grid.length; i += 7) {
      rows.push(
        grid.slice(i, i + 7).map((day) => {
          const iso = toISODate(day)
          return {
            day,
            iso,
            dayTasks: tasks.filter((t) => t.date === iso),
            inMonth: isSameMonth(day, reference),
            today: isToday(day),
          }
        }),
      )
    }
    return rows
  }, [grid, tasks, reference])

  return (
    <div className="mx-auto max-w-5xl">
      {/* Cabecalho no mesmo padrao de Hoje/Agenda: titulo forte, mes discreto,
          navegacao em icones (a mesma de sempre: anterior · Hoje · proximo). */}
      <header className="mb-5 flex items-end justify-between gap-3 px-2">
        <div className="min-w-0">
          <h1 className="text-display">Calendário</h1>
          <p className="text-caption mt-1">{formatMonthTitle(reference)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => go(-1)} className="icon-btn" aria-label="Mês anterior">
            <ChevronLeft size={19} />
          </button>
          <button
            onClick={() => setReference(new Date())}
            className="press rounded-full px-3 py-1.5 text-[13px] font-semibold text-accent-text"
          >
            Hoje
          </button>
          <button onClick={() => go(1)} className="icon-btn" aria-label="Próximo mês">
            <ChevronRight size={19} />
          </button>
        </div>
      </header>

      {error && <div className="mb-4"><ErrorState onRetry={reload} /></div>}

      {/* GRADE — leve. Sem caixa, sem borda vertical: a leitura vem do
          alinhamento e de um hairline por SEMANA. O dia atual e o unico
          elemento com peso (pilula cheia); dias com atividade se identificam
          pelos pontos das categorias (mobile) ou por faixas suaves (desktop). */}
      <div className="px-1">
        <div className="grid grid-cols-7 pb-1.5">
          {WEEK_HEADERS.map((d) => (
            <div key={d} className="text-caption py-1 text-center font-semibold">
              {d}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div
            key={week[0].iso}
            className={cx('grid grid-cols-7', wi > 0 && 'border-t hair')}
          >
            {week.map(({ day, iso, dayTasks, inMonth, today }) => (
              // DECISAO DE PRODUTO (B5/RC-1B): no FUTURO, este dia tera a acao
              // "Abrir agenda deste dia" navegando para
              // /agenda-do-dia?date=YYYY-MM-DD. Nao implementar agora — hoje o
              // clique apenas abre o modal do dia (comportamento inalterado).
              <button
                key={iso}
                onClick={() => setDayModal({ open: true, iso })}
                aria-label={`${day.getDate()} — ${dayTasks.length} atividade(s)`}
                className="group relative flex min-h-[62px] flex-col items-center gap-1 rounded-row px-0.5 py-1.5 transition-colors active:bg-surface-2 sm:min-h-[96px] sm:items-stretch sm:px-1 sm:hover:bg-surface-2/70"
              >
                <div className="flex w-full items-start justify-center sm:justify-between">
                  <span
                    className={cx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums',
                      today
                        ? 'bg-accent font-bold text-white'
                        : inMonth
                          ? 'font-semibold text-primary'
                          : 'font-medium text-faint',
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
                    className="hidden rounded-control p-0.5 text-muted opacity-0 transition-opacity hover:text-accent-text group-hover:opacity-100 sm:block"
                  >
                    <Plus size={14} />
                  </span>
                </div>

                {/* Mobile: pontos coloridos. Desktop: faixas com titulo. */}
                <div className="flex flex-wrap items-center justify-center gap-1 sm:hidden">
                  {dayTasks.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: categoryById(t.category_id)?.color || '#94a3b8' }}
                    />
                  ))}
                </div>
                <div className="hidden w-full space-y-1 overflow-hidden text-left sm:block">
                  {dayTasks.slice(0, 3).map((t) => {
                    const color = categoryById(t.category_id)?.color || '#94a3b8'
                    return (
                      <div
                        key={t.id}
                        className="relative flex items-center gap-1 truncate rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        <span
                          className="absolute inset-0 rounded-[6px] opacity-[0.16]"
                          style={{ backgroundColor: color }}
                        />
                        <span className="relative truncate">
                          {t.start_time ? String(t.start_time).slice(0, 5) + ' ' : ''}
                          {t.title}
                        </span>
                      </div>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <p className="text-caption px-1">+{dayTasks.length - 3} mais</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}
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
