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
import { useIsDesktop } from '../hooks/useMediaQuery'
import { STATUS } from '../lib/constants'
import { cx } from '../lib/utils'
import AcaoCopiloto from '../components/copiloto/AcaoCopiloto'
import { SUPERFICIE } from '../lib/copilotoContexto'

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
  const desktop = useIsDesktop()
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
        'am relative flex min-h-0 flex-col',
        // O quadro se ancora na viewport nos DOIS formatos: no desktop para as
        // quatro colunas terminarem juntas, e no toque porque um pager
        // horizontal dentro de uma pagina que tambem rola na vertical fica
        // ambiguo — e porque a altura da area do quadro precisa ser estavel
        // para trocar de etapa nao dar salto. A Semana continua rolando.
        visao === 'fluxo' && 'h-full',
      )}
    >
      {/* ------------------------------------------------------------------
          UX-T1 — DUAS COMPOSICOES, UM DESTINO.

          No telefone Tarefas passa a falar a mesma lingua do Hoje (UX-M2) e da
          Agenda (UX-M3.1): o plano de fundo com a tonalidade fria, o titulo
          como maior texto da tela e o seletor em lavanda. Era o achado nº 2 da
          auditoria C2.2 — metade dos destinos da barra de baixo falava uma
          lingua e a outra metade falava outra, e trocar de destino parecia
          trocar de aplicativo.

          Acima de `lg` NADA mudou: o cabecalho em linha unica continua sendo o
          que estava no ar, porque la o seletor divide a linha com o titulo e a
          composicao vertical so gastaria altura.
          ------------------------------------------------------------------ */}
      {!desktop && <div className="am-fundo" aria-hidden="true" />}

      {/* TELEFONE — montado SO no telefone, e nao escondido por classe.
          Os dois cabecalhos usam o mesmo `data-testid` no convite do Copiloto;
          com ambos no DOM, um `.first()` pegava o que estava com
          `display:none` e o clique nunca acontecia. Um de cada vez resolve na
          raiz, em vez de depender da ordem do DOM. */}
      {!desktop && (
      <header className="relative mb-3 shrink-0 px-2 short:mb-1.5">
        <p className="text-[15px] leading-snug text-secondary short:hidden">
          {totalAberto > 0 ? `${totalAberto} em aberto` : 'Tudo em dia'}
        </p>
        <h1 className="mt-0.5 text-[30px] font-bold leading-[1.12] tracking-[-0.03em] text-primary short:text-page">
          Tarefas
        </h1>
        {/* O convite do Copiloto deixa de existir so acima de 640px: ele some
            exatamente na largura em que mais ajuda. O recorte em foco viaja
            junto, como no Hoje e na Agenda. */}
        <AcaoCopiloto
          superficie={SUPERFICIE.TAREFAS}
          extra={{ filtro: visao }}
          className="-ml-2 mt-1 short:hidden"
        />
        <div className="am-segmentos mt-3" role="tablist" aria-label="Visão de tarefas">
          {VISOES.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={visao === v.value}
              data-testid={`am-tarefas-${v.value}`}
              onClick={() => trocarVisao(v.value)}
              className={cx('am-segmento', visao === v.value && 'am-segmento-ativo')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>
      )}

      {/* DESKTOP — intocado.
          Em altura curta (iPhone deitado) o cabecalho encolhe em vez de comer
          metade da tela: titulo menor e a contagem sai — ela ja aparece somada
          nas quatro etapas logo abaixo. */}
      {desktop && (
      <header className="mb-3 shrink-0 px-1 short:mb-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-display short:text-page">Tarefas</h1>
            <p className="text-caption mt-0.5 short:hidden">
              {totalAberto > 0 ? `${totalAberto} em aberto` : 'Tudo em dia'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {/* O filtro/recorte atual viaja junto: perguntar "o que devo
                priorizar?" olhando a semana nao e a mesma pergunta que
                olhando o fluxo. */}
            <AcaoCopiloto
              superficie={SUPERFICIE.TAREFAS}
              extra={{ filtro: visao }}
              className="hidden sm:inline-flex"
            />
            <ViewSwitcher value={visao} options={VISOES} onChange={trocarVisao} />
          </div>
        </div>
      </header>
      )}

      {visao === 'semana' ? (
        // CP5.10 — o Kanban perdeu o `max-w-6xl`. Ele era invisivel enquanto a
        // barra lateral custava 224px fixos: sobrava pouco mais que 1152px de
        // qualquer jeito. Com a barra recolhivel, esse limite passaria a ser a
        // unica coisa impedindo as sete colunas de receber o espaco liberado —
        // recolher a barra devolveria vazio nas margens em vez de largura ao
        // conteudo. Uma grade de sete dias e exatamente a superficie que foi
        // desenhada para aproveitar tela.
        <div className="relative w-full">
          <WeekKanban embedded />
        </div>
      ) : error ? (
        <div className="relative"><ErrorState onRetry={reload} /></div>
      ) : loading && tasks.length === 0 ? (
        <div className="relative"><TaskListSkeleton count={5} /></div>
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
