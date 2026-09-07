import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import WeekKanban from './WeekKanban'
import ViewSwitcher from '../components/ui/ViewSwitcher'
import FlowBoard from '../components/board/FlowBoard'
import TaskModal from '../components/tasks/TaskModal'
import { ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useData } from '../context/DataContext'
import { STATUS } from '../lib/constants'
import { cx } from '../lib/utils'

const ABERTAS = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]

// ---------------------------------------------------------------------------
// TAREFAS — o ambiente operacional, em dois recortes: Fluxo · Semana.
//
// CP5.2 tirou "Kanban semanal" do menu: nunca foi outro lugar, e a MESMA base
// recortada por data, enquanto o Fluxo recorta por estagio. Dois eixos, uma
// tela, um seletor.
//
// CP5.3 termina o trabalho: o Fluxo deixou de ser uma lista agrupada em cinco
// secoes e virou o QUADRO de quatro colunas — Sem data | A fazer | Em andamento
// | Concluido. A diferenca nao e cosmetica. A lista respondia "o que tenho",
// uma pergunta de consulta; o quadro responde "em que pe esta cada coisa", que
// e uma pergunta de trabalho — e deixa mover a resposta.
//
// LARGURA. O Fluxo perdeu o `max-w-2xl`. Uma lista de uma coluna nao ganha nada
// com 1200px e por isso ele ficava em ~55% da tela ate aqui; quatro colunas
// ganham tudo. Agora a pagina inteira e o quadro.
//
// ALTURA. A pagina ocupa a altura da viewport e cada coluna rola sozinha. E o
// que permite uma coluna com trinta itens sem empurrar as outras tres para fora
// da tela — a diferenca entre um quadro e quatro listas empilhadas.
//
// CP5.4: no toque o Fluxo deixou de empilhar as quatro colunas e virou um PAGER
// de uma coluna em foco. A altura fixa passa a valer no mobile tambem: e ela
// que impede o salto visual ao passar de uma etapa curta para uma longa.
//
// SEM DATA != SEMANA: uma tarefa sem data vive na coluna "Sem data" do Fluxo e
// NAO e inventada em nenhum dia da Semana. A regra vive em lib/board.js.
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

  const { reload: reloadData } = useData()
  const { tasks, loading, error, reload, setTasks } = useTasks({})
  const [editing, setEditing] = useState(null)

  const totalAberto = useMemo(
    () => tasks.filter((t) => ABERTAS.includes(t.status)).length,
    [tasks],
  )

  const refresh = () => {
    reload()
    reloadData()
  }

  return (
    <div
      className={cx(
        'flex min-h-0 flex-col',
        // O quadro se ancora na viewport nos DOIS formatos: no desktop para as
        // quatro colunas terminarem juntas, e no toque porque um pager
        // horizontal dentro de uma pagina que tambem rola na vertical fica
        // ambiguo — e porque a altura da area do quadro precisa ser estavel
        // para trocar de etapa nao dar salto. A Semana continua rolando.
        visao === 'fluxo' && 'h-full',
      )}
    >
      {/* Em altura curta (iPhone deitado) o cabecalho encolhe em vez de comer
          metade da tela: titulo menor e a contagem sai — ela ja aparece somada
          nas quatro etapas logo abaixo. */}
      <header className="mb-3 shrink-0 px-1 short:mb-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-display short:text-page">Tarefas</h1>
            <p className="text-caption mt-0.5 short:hidden">
              {totalAberto > 0 ? `${totalAberto} em aberto` : 'Tudo em dia'}
            </p>
          </div>
          <ViewSwitcher value={visao} options={VISOES} onChange={trocarVisao} />
        </div>
      </header>

      {visao === 'semana' ? (
        <div className="mx-auto w-full max-w-6xl">
          <WeekKanban embedded />
        </div>
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : loading && tasks.length === 0 ? (
        <TaskListSkeleton count={5} />
      ) : (
        <FlowBoard
          className="flex-1"
          tasks={tasks}
          setTasks={setTasks}
          reload={refresh}
          onOpenTask={setEditing}
        />
      )}

      <TaskModal
        open={Boolean(editing)}
        task={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  )
}
