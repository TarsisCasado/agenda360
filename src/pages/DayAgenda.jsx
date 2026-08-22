import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Inbox, MoonStar } from 'lucide-react'
import { PageHeader, ErrorState } from '../components/ui/Common'
import TaskCard from '../components/tasks/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import { useTasks } from '../hooks/useTasks'
import {
  toISODate,
  addDays,
  formatLong,
  isToday,
  fromISODate,
} from '../lib/date'
import { DAY_START_HOUR, DAY_END_HOUR } from '../lib/constants'
import { partitionDayTasks, timeToHour, resolveDayDate } from '../lib/dayView'

// ---------------------------------------------------------------------------
// DECISAO DE PRODUTO (navegacao) — B5/RC-1B. NAO implementar agora; apenas
// documentado para evitar regressoes:
//  - Agenda do Dia aberta pelo MENU LATERAL (NavLink "/dia", sem query) deve
//    SEMPRE abrir em Hoje. Isso ja acontece: sem ?date, o dia inicial e hoje.
//  - No Calendario havera, no FUTURO, uma acao "Abrir agenda deste dia" que
//    navegara para: /agenda-do-dia?date=YYYY-MM-DD
//    (rota atual e "/dia?date=..."; o alias "/agenda-do-dia" e uma evolucao
//     planejada). Nao criar essa acao nesta sprint.
// ---------------------------------------------------------------------------
export default function DayAgenda() {
  const [searchParams] = useSearchParams()
  // Permite abrir um dia especifico (ex.: vindo da Command Palette: /dia?date=...)
  const [date, setDate] = useState(() =>
    resolveDayDate(searchParams.get('date'), toISODate(new Date())),
  )

  // Mantem o dia exibido em sincronia com o parametro ?date (ex.: navegar para
  // /dia?date=... ja estando na tela, vindo da Command Palette).
  const dateParam = searchParams.get('date')
  useEffect(() => {
    if (dateParam) setDate(dateParam)
  }, [dateParam])

  const range = useMemo(() => ({ start: date, end: date }), [date])
  const { tasks, error, reload } = useTasks(range)
  const [modal, setModal] = useState({ open: false, task: null, defaults: null })

  // Deep link vindo do clique numa notificacao push (?task=<id>): abre a
  // atividade correspondente automaticamente. `autoOpenedRef` evita reabrir
  // o modal sozinho depois que o usuario ja fechou (tasks recarrega apos
  // qualquer edicao, o que rodaria este efeito de novo sem essa guarda).
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

  const hours = []
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 1) hours.push(h)

  // Particiona garantindo que tarefas fora da grade (ex.: antes das 06:00) nao
  // fiquem invisiveis.
  const { untimed, timed, outOfGrid } = useMemo(
    () => partitionDayTasks(tasks, { startHour: DAY_START_HOUR, endHour: DAY_END_HOUR }),
    [tasks],
  )

  const tasksAtHour = (h) => timed.filter((t) => timeToHour(t.start_time) === h)

  const go = (delta) => setDate(toISODate(addDays(fromISODate(date), delta)))

  const openNew = (hour) =>
    setModal({
      open: true,
      task: null,
      defaults: {
        date,
        start_time: hour != null ? `${String(hour).padStart(2, '0')}:00` : '',
      },
    })

  return (
    <div>
      <PageHeader
        title="Agenda do dia"
        subtitle={formatLong(date)}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => go(-1)} className="btn-secondary p-2" aria-label="Dia anterior">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setDate(toISODate(new Date()))}
              className="btn-secondary"
            >
              Hoje
            </button>
            <button onClick={() => go(1)} className="btn-secondary p-2" aria-label="Proximo dia">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => openNew(null)} className="btn-primary ml-1 hidden sm:inline-flex">
              <Plus size={16} /> Nova
            </button>
          </div>
        }
      />

      {isToday(fromISODate(date)) && (
        <p className="mb-3 text-xs font-medium text-brand-600">● Hoje</p>
      )}

      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
      {/* Sem horario */}
      {untimed.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Inbox size={16} /> Sem horario definido
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {untimed.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onEdit={(task) => setModal({ open: true, task, defaults: null })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fora da grade (ex.: antes das 06:00 ou apos as 23:00): garante que
          nenhuma tarefa com horario fique invisivel. */}
      {outOfGrid.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <MoonStar size={16} /> Fora da grade (antes das{' '}
            {String(DAY_START_HOUR).padStart(2, '0')}:00 ou apos as{' '}
            {String(DAY_END_HOUR).padStart(2, '0')}:00)
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {outOfGrid.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onEdit={(task) => setModal({ open: true, task, defaults: null })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grade horaria */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {hours.map((h) => {
          const items = tasksAtHour(h)
          const isNow =
            isToday(fromISODate(date)) && new Date().getHours() === h
          return (
            <div key={h} className="group flex gap-2 px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
              <button
                onClick={() => openNew(h)}
                className={
                  'w-11 shrink-0 pt-1 text-right text-xs font-bold sm:w-14 ' +
                  (isNow ? 'text-brand-600' : 'text-slate-400 hover:text-brand-600')
                }
                title="Criar atividade neste horario"
              >
                {String(h).padStart(2, '0')}:00
              </button>
              <div
                className={
                  'min-w-0 flex-1 space-y-2 border-l pl-2 sm:pl-3 ' +
                  (isNow
                    ? 'border-brand-300 dark:border-brand-700'
                    : 'border-slate-100 dark:border-slate-800')
                }
              >
                {items.length === 0 ? (
                  <button
                    onClick={() => openNew(h)}
                    className="flex h-7 w-full items-center gap-1 rounded-lg px-2 text-xs text-slate-300 transition-colors hover:bg-slate-50 hover:text-brand-500 dark:text-slate-600 dark:hover:bg-slate-800/60"
                  >
                    <Plus size={13} />
                  </button>
                ) : (
                  items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onEdit={(task) =>
                        setModal({ open: true, task, defaults: null })
                      }
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
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
