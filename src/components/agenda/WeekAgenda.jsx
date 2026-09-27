import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import TaskRow from '../tasks/TaskRow'
import { useTasks } from '../../hooks/useTasks'
import { getWeekDays, toISODate, fromISODate, isToday, byTime } from '../../lib/date'
import { partitionDayTasks } from '../../lib/dayView'
import { DAY_START_HOUR, DAY_END_HOUR } from '../../lib/constants'
import { cx, capitalizeFirst } from '../../lib/utils'

// ---------------------------------------------------------------------------
// AGENDA DA SEMANA — sete dias em coluna unica, nao uma grade de horarios.
//
// Uma grade semanal com 7 colunas × 14 horas e legivel num monitor e ilegivel
// num iPhone, e a Agenda e mobile-first. Aqui a semana e uma LISTA de dias:
// cada dia e uma secao com o que tem, na ordem em que acontece. Le-se de cima
// para baixo, com o polegar, e cabe em qualquer largura.
//
// A distincao do dominio aparece na propria ordem:
//   COMPROMISSO (tem horario) vem primeiro, com a hora a mostra;
//   TAREFA do dia (sem horario) vem depois, sem hora inventada.
//
// Dias vazios NAO somem: um dia livre e informacao — e o que deixa a semana
// legivel de relance. Tocar no cabecalho de um dia abre aquele dia.
// ---------------------------------------------------------------------------
export default function WeekAgenda({ date, onOpenTask, onPickDay }) {
  const dias = useMemo(() => getWeekDays(fromISODate(date) || new Date()), [date])
  const range = useMemo(
    () => ({ start: toISODate(dias[0]), end: toISODate(dias[6]) }),
    [dias],
  )
  const { tasks } = useTasks(range)

  const semana = useMemo(
    () =>
      dias.map((day) => {
        const iso = toISODate(day)
        const doDia = tasks.filter((t) => t.date === iso)
        const { untimed, timed, outOfGrid } = partitionDayTasks(doDia, {
          startHour: DAY_START_HOUR,
          endHour: DAY_END_HOUR,
        })
        return {
          iso,
          day,
          compromissos: [...timed, ...outOfGrid].sort(byTime),
          tarefas: untimed,
          hoje: isToday(day),
        }
      }),
    [dias, tasks],
  )

  return (
    <div className="px-1">
      {semana.map(({ iso, day, compromissos, tarefas, hoje }) => (
        <section
          key={iso}
          data-testid={`semana-dia-${iso}`}
          className={cx('border-t hair first:border-t-0', hoje && 'bg-accent-soft/40 rounded-row')}
        >
          <button
            onClick={() => onPickDay?.(iso)}
            className="press flex w-full items-baseline gap-2 px-2 py-3 text-left"
          >
            <span
              className={cx(
                'text-[15px] tracking-[-0.01em]',
                hoje ? 'font-bold text-accent-text' : 'font-semibold text-primary',
              )}
            >
              {capitalizeFirst(format(day, 'EEEE', { locale: ptBR }))}
            </span>
            <span className="text-caption tabular-nums">{format(day, 'dd/MM')}</span>
            {compromissos.length + tarefas.length > 0 && (
              <span className="text-caption ml-auto tabular-nums">
                {compromissos.length + tarefas.length}
              </span>
            )}
          </button>

          {compromissos.length === 0 && tarefas.length === 0 ? (
            <p className="text-caption px-2 pb-3">Dia livre</p>
          ) : (
            <div className="pb-2">
              {/* Dentro do dia a ordem e a mesma da Agenda inteira: primeiro o
                  que ACONTECE numa hora, depois o que PRECISA SER FEITO. Ate o
                  CP5.2 a ordem ja era esta, mas so a ordem — dois itens
                  seguidos pareciam a mesma coisa. Agora um rotulo minusculo
                  separa os dois grupos quando os dois existem; com so um deles
                  o rotulo seria ruido e nao aparece. */}
              {compromissos.length > 0 && tarefas.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint px-2 pb-0.5">
                  Compromissos
                </p>
              )}
              {compromissos.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpenTask} onChanged={() => {}} />
              ))}
              {compromissos.length > 0 && tarefas.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint px-2 pb-0.5 pt-2">
                  Tarefas
                </p>
              )}
              {tarefas.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpenTask} onChanged={() => {}} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
