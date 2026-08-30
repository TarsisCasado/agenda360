import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { ErrorState, EmptyState } from '../components/ui/Common'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import Section from '../components/ui/Section'
import { useData } from '../context/DataContext'
import { useTasks } from '../hooks/useTasks'
import { toISODate, addDays, formatLong, isToday, fromISODate } from '../lib/date'
import { DAY_START_HOUR, DAY_END_HOUR } from '../lib/constants'
import { partitionDayTasks, resolveDayDate } from '../lib/dayView'
import { blockGeometry } from '../lib/agendaTime'
import { cx } from '../lib/utils'

const HOUR_PX = 60
const GUTTER = 46

// ---------------------------------------------------------------------------
// AGENDA — timeline, nao planilha.
//
// Refinamentos desta fase:
//   - a grade perdeu a linha continua em toda hora: agora a hora e um rotulo
//     leve e a regua e um hairline curto que comeca depois do gutter;
//   - o bloco de evento nao tem sombra — ele se define pela COR da categoria
//     (faixa solida a esquerda + fundo tenue), como num calendario nativo;
//   - blocos curtos (<40min) viram uma linha compacta com hora inline, em vez
//     de uma caixa espremida com texto cortado;
//   - a linha do "agora" carrega a hora atual num pill, e a tela rola sozinha
//     ate ela quando o dia e hoje.
// ---------------------------------------------------------------------------
function EventBlock({ task, top, height, color, onOpen }) {
  const short = height < 40
  const start = String(task.start_time).slice(0, 5)
  const end = task.end_time ? String(task.end_time).slice(0, 5) : null

  return (
    <button
      onClick={() => onOpen(task)}
      style={{ top, height: Math.max(height, 22), left: GUTTER }}
      // bg-surface e a BASE: sem ela, uma categoria de cor clara a 10% some
      // no canvas e o bloco fica invisivel (visto no QA em 390px).
      className="press absolute right-0 z-10 flex overflow-hidden rounded-[10px] bg-surface text-left transition-transform"
    >
      <span className="absolute inset-0 opacity-[0.14]" style={{ backgroundColor: color }} />
      <span className="absolute inset-y-0 left-0 w-[3px] rounded-full" style={{ backgroundColor: color }} />
      <span
        className={cx(
          'relative flex min-w-0 flex-1 gap-1.5 px-2.5',
          short ? 'items-center py-0.5' : 'flex-col justify-center py-1',
        )}
      >
        <span className="truncate text-[13px] font-medium leading-tight text-primary">
          {task.title}
        </span>
        <span className="text-caption shrink-0 tabular-nums">
          {start}
          {end && !short ? `–${end}` : ''}
        </span>
      </span>
    </button>
  )
}

export default function DayAgenda() {
  const [searchParams] = useSearchParams()
  const { categoryById } = useData()
  const [date, setDate] = useState(() =>
    resolveDayDate(searchParams.get('date'), toISODate(new Date())),
  )

  const dateParam = searchParams.get('date')
  useEffect(() => {
    if (dateParam) setDate(dateParam)
  }, [dateParam])

  const range = useMemo(() => ({ start: date, end: date }), [date])
  const { tasks, error, reload } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })

  const taskParam = searchParams.get('task')
  const autoOpenedRef = useRef(null)
  useEffect(() => {
    if (!taskParam || autoOpenedRef.current === taskParam) return
    const found = tasks.find((t) => t.id === taskParam)
    if (found) {
      autoOpenedRef.current = taskParam
      setModal({ open: true, task: found, defaults: null })
    }
  }, [taskParam, tasks])

  const { untimed, timed, outOfGrid } = useMemo(
    () => partitionDayTasks(tasks, { startHour: DAY_START_HOUR, endHour: DAY_END_HOUR }),
    [tasks],
  )

  const hours = []
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 1) hours.push(h)
  const gridStartMin = DAY_START_HOUR * 60
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_PX

  const go = (delta) => setDate(toISODate(addDays(fromISODate(date) || new Date(), delta)))
  const openTask = (task) => setModal({ open: true, task, defaults: null })
  const openNew = (hour) =>
    setModal({
      open: true,
      task: null,
      defaults: { date, start_time: hour != null ? `${String(hour).padStart(2, '0')}:00` : '' },
    })

  const today = isToday(fromISODate(date) || new Date())
  const nowDate = new Date()
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()
  const nowTop = ((nowMin - gridStartMin) / 60) * HOUR_PX
  const nowVisible = today && nowMin >= gridStartMin && nowMin <= (DAY_END_HOUR + 1) * 60
  const nowLabel = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`

  // Leva a vista ate o "agora" quando o dia aberto e hoje.
  const nowRef = useRef(null)
  useEffect(() => {
    if (!nowVisible) return
    const id = setTimeout(
      () => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      120,
    )
    return () => clearTimeout(id)
  }, [nowVisible, date])

  const emptyDay = timed.length === 0 && untimed.length === 0 && outOfGrid.length === 0

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-end justify-between gap-3 px-2">
        <div className="min-w-0">
          <h1 className="text-display">{today ? 'Hoje' : formatLong(date).split(',')[0]}</h1>
          <p className="text-caption mt-1">{formatLong(date)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => go(-1)} className="icon-btn" aria-label="Dia anterior">
            <ChevronLeft size={19} />
          </button>
          {!today && (
            <button
              onClick={() => setDate(toISODate(new Date()))}
              className="press rounded-full px-3 py-1.5 text-[13px] font-semibold text-accent-text"
            >
              Hoje
            </button>
          )}
          <button onClick={() => go(1)} className="icon-btn" aria-label="Próximo dia">
            <ChevronRight size={19} />
          </button>
        </div>
      </header>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {untimed.length > 0 && (
            <Section
              label="Sem horário"
              count={untimed.length}
              className="mb-6"
            >
              {untimed.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={reload} />
              ))}
            </Section>
          )}

          {emptyDay ? (
            <EmptyState
              icon={CalendarDays}
              title="Dia livre"
              description="Nenhum compromisso marcado. Toque em um horário abaixo para criar."
            />
          ) : null}

          {/* TIMELINE proporcional */}
          <div className="relative px-2" style={{ height: gridHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-x-0"
                style={{ top: i * HOUR_PX, height: HOUR_PX }}
              >
                <span
                  className="absolute left-0 top-[-6px] w-9 text-right text-[11px] font-medium tabular-nums text-faint"
                  style={{ width: GUTTER - 10 }}
                >
                  {String(h).padStart(2, '0')}
                </span>
                <div
                  className="absolute right-0 top-0 border-t hair opacity-60"
                  style={{ left: GUTTER }}
                />
                <button
                  onClick={() => openNew(h)}
                  className="absolute right-0 top-0 h-full rounded-[10px] transition-colors hover:bg-surface-2/60"
                  style={{ left: GUTTER }}
                  aria-label={`Criar às ${h}:00`}
                />
              </div>
            ))}

            {/* linha do agora, com a hora */}
            {nowVisible && (
              <div
                ref={nowRef}
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center gap-1.5"
                style={{ top: nowTop }}
              >
                <span
                  className="shrink-0 rounded-full bg-danger px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-white"
                  style={{ width: GUTTER - 6 }}
                >
                  {nowLabel}
                </span>
                <span className="h-px flex-1 bg-danger/60" />
              </div>
            )}

            {timed.map((t) => {
              const { top, height } = blockGeometry(t.start_time, t.end_time, {
                startHour: DAY_START_HOUR,
                hourPx: HOUR_PX,
              })
              return (
                <EventBlock
                  key={t.id}
                  task={t}
                  top={top}
                  height={height}
                  color={categoryById(t.category_id)?.color || '#6366f1'}
                  onOpen={openTask}
                />
              )
            })}
          </div>

          {outOfGrid.length > 0 && (
            <Section label="Fora da grade" count={outOfGrid.length} className="mt-6">
              {outOfGrid.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={openTask} onChanged={reload} />
              ))}
            </Section>
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
