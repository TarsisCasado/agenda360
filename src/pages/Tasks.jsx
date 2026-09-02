import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import WeekKanban from './WeekKanban'
import ViewSwitcher from '../components/ui/ViewSwitcher'
import { Plus, ListTodo, Loader2, ChevronRight } from 'lucide-react'
import TaskRow from '../components/tasks/TaskRow'
import TaskModal from '../components/tasks/TaskModal'
import RescheduleModal from '../components/tasks/RescheduleModal'
import SwipeRow from '../components/ui/SwipeRow'
import Section from '../components/ui/Section'
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
import { cx } from '../lib/utils'

const OPEN = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]

// ---------------------------------------------------------------------------
// TAREFAS — o ambiente operacional, em dois recortes: Fluxo · Semana.
//
// CP5.2: "Kanban semanal" deixou de ser um destino separado. Nunca foi outro
// lugar — e a MESMA base de tarefas recortada por data, enquanto o Fluxo
// recorta por estagio. Dois eixos, uma tela, um seletor. A rota /semana
// continua existindo e redireciona para ca.
//
// SEM DATA != SEMANA: uma tarefa sem data vive na coluna "Sem data" do Fluxo e
// NAO e inventada em nenhum dia da Semana. A regra que decide isso ja esta
// escrita e testada em lib/board.js — o quadro de colunas em si e o CP5.3.
//
// ---------------------------------------------------------------------------
// FLUXO (hoje ainda em lista agrupada) — gestor premium.
//
// O que mudou: as listas deixaram de morar dentro de caixas com anel e passaram
// a viver sobre o canvas, separadas por hairline e por RITMO (rotulo discreto +
// contagem). O campo de captura rapida perdeu a moldura: e uma linha de texto
// que so revela o botao quando ha o que salvar.
// ---------------------------------------------------------------------------
const VISOES = [
  { value: 'fluxo', label: 'Fluxo' },
  { value: 'semana', label: 'Semana' },
]

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const visao = searchParams.get('visao') === 'semana' ? 'semana' : 'fluxo'
  const trocarVisao = (v) => {
    const next = new URLSearchParams(searchParams)
    if (v === 'fluxo') next.delete('visao')
    else next.set('visao', v)
    setSearchParams(next, { replace: true })
  }
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()
  const { tasks, loading, error, reload } = useTasks({})
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
    const upcoming = open
      .filter((t) => !isOverdue.has(t.id) && t.date && t.date > today)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    const undated = open.filter((t) => !t.date)
    const done = tasks.filter((t) => t.status === STATUS.DONE).sort((a, b) => (a.date > b.date ? -1 : 1))
    return { overdue, todayG, upcoming, undated, done }
  }, [tasks, today])

  const totalOpen =
    groups.overdue.length + groups.todayG.length + groups.upcoming.length + groups.undated.length

  const quickAdd = async (e) => {
    e?.preventDefault?.()
    const title = quick.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      await taskService.create(workspaceId, user.id, { title, date: null, status: STATUS.TODO })
      setQuick('')
      reload()
      reloadData()
    } catch (err) {
      toast('Erro ao criar tarefa: ' + err.message, 'error')
    } finally {
      setAdding(false)
    }
  }

  const complete = async (task) => {
    try {
      await taskService.changeStatus(
        user.id,
        task,
        task.status === STATUS.DONE ? STATUS.TODO : STATUS.DONE,
      )
      reload()
      reloadData()
    } catch (err) {
      toast('Erro ao atualizar: ' + err.message, 'error')
    }
  }

  const refresh = () => {
    reload()
    reloadData()
  }

  const Row = (t, opts = {}) => (
    <SwipeRow key={t.id} onSwipeRight={() => complete(t)} onSwipeLeft={() => setRescheduling(t)}>
      <TaskRow task={t} onOpen={setEditing} onChanged={refresh} showDate={opts.showDate} />
    </SwipeRow>
  )

  // A Semana usa a largura toda; o Fluxo em lista ainda nao — e no CP5.3, com
  // as quatro colunas reais, que a largura passa a ser usada de verdade.
  return (
    <div className={cx('mx-auto', visao === 'semana' ? 'max-w-6xl' : 'max-w-2xl')}>
      <header className="mb-4 px-2">
        <h1 className="text-display">Tarefas</h1>
        <p className="text-caption mt-1">
          {totalOpen > 0 ? `${totalOpen} em aberto` : 'Tudo em dia'}
        </p>
      </header>

      <div className="mb-5 px-2">
        <ViewSwitcher value={visao} options={VISOES} onChange={trocarVisao} />
      </div>

      {visao === 'semana' ? (
        <WeekKanban embedded />
      ) : (
        <>

      {/* Captura rapida: uma linha, sem moldura de formulario. */}
      <form
        onSubmit={quickAdd}
        className="mb-6 flex items-center gap-2.5 rounded-row bg-surface px-3 py-1"
      >
        <Plus size={18} className="shrink-0 text-muted" />
        <input
          className="field flex-1 py-2.5 text-[15px]"
          placeholder="Adicionar tarefa…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
        />
        {quick.trim() && (
          <button
            type="submit"
            disabled={adding}
            className="press shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
          </button>
        )}
      </form>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading && tasks.length === 0 ? (
        <TaskListSkeleton count={5} />
      ) : totalOpen === 0 && groups.done.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nada pendente"
          description="Capture algo pelo + ou escreva na linha acima."
        />
      ) : (
        <div className="space-y-7">
          <Section label="Atrasadas" count={groups.overdue.length} tone="!text-danger">
            {groups.overdue.map((t) => Row(t, { showDate: true }))}
          </Section>
          <Section label="Hoje" count={groups.todayG.length}>
            {groups.todayG.map((t) => Row(t))}
          </Section>
          <Section label="Próximas" count={groups.upcoming.length}>
            {groups.upcoming.map((t) => Row(t, { showDate: true }))}
          </Section>
          <Section label="Sem data" count={groups.undated.length}>
            {groups.undated.map((t) => Row(t))}
          </Section>

          {groups.done.length > 0 && (
            <section>
              <button
                onClick={() => setShowDone((v) => !v)}
                className="press flex w-full items-center gap-1.5 px-2 py-1"
              >
                <ChevronRight
                  size={13}
                  className={cx('text-muted transition-transform', showDone && 'rotate-90')}
                />
                <span className="text-section">Concluídas</span>
                <span className="text-[11px] font-semibold text-faint">{groups.done.length}</span>
              </button>
              {showDone && (
                <div className="list mt-1 opacity-70">
                  {groups.done.slice(0, 20).map((t) => (
                    <TaskRow key={t.id} task={t} onOpen={setEditing} onChanged={refresh} showDate compact />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
        </>
      )}

      <TaskModal
        open={Boolean(editing)}
        task={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <RescheduleModal
        open={Boolean(rescheduling)}
        task={rescheduling}
        onClose={() => setRescheduling(null)}
        onDone={() => {
          setRescheduling(null)
          refresh()
        }}
      />
    </div>
  )
}
