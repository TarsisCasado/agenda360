import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { Page, PageHeader } from '../components/layout/Page'
import { Skeleton } from '../components/ui/Skeleton'
import { cx } from '../lib/utils'
import { useTasks } from '../hooks/useTasks'
import { useData } from '../context/DataContext'
import { STATUS, WEEK_DAYS } from '../lib/constants'
import { percent } from '../lib/utils'
import { fromISODate } from '../lib/date'

// ---------------------------------------------------------------------------
// CP5.7 — POLISH, sem KPI novo e sem grafico decorativo.
//
// O que muda e o PESO. Os numeros vinham em cartoes com icone dentro de um
// quadrado colorido: a gramatica de painel corporativo, que o produto nao e.
// Aqui um numero e um numero grande com o nome embaixo — a mesma peca das
// quatro entradas de foco da tela Hoje. Duas telas diferentes falando a mesma
// lingua e exatamente o que faltava.
// ---------------------------------------------------------------------------
function Numero({ rotulo, valor, tom = 'neutro' }) {
  return (
    <div className="surface px-3 py-2.5">
      <p
        className={cx(
          'text-[22px] font-bold leading-none tabular-nums',
          tom === 'danger' ? 'text-danger' : tom === 'positive' ? 'text-positive' : 'text-primary',
        )}
      >
        {valor}
      </p>
      <p className="text-caption mt-1">{rotulo}</p>
    </div>
  )
}

function BarList({ title, items, colorKey, emptyLabel }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <section className="surface p-4">
      <h3 className="text-title mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-caption">{emptyLabel}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((i) => (
            <div key={i.label}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-primary">
                  {i.color && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                  )}
                  <span className="truncate">{i.label}</span>
                </span>
                <span className="text-caption shrink-0 tabular-nums">{i.value}</span>
              </div>
              {/* A barra e leitura, nao enfeite: trilho rebaixado, sem sombra. */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(i.value / max) * 100}%`, backgroundColor: i.color || colorKey }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Reports() {
  const { tasks, loading, error, reload } = useTasks({}) // todas as atividades
  const { categories, categoryById } = useData()

  const m = useMemo(() => {
    const total = tasks.length
    const by = (s) => tasks.filter((t) => t.status === s).length
    const done = by(STATUS.DONE)
    const missed = by(STATUS.MISSED)
    const delegated = by(STATUS.DELEGATED)
    const notNeeded = by(STATUS.NOT_NEEDED)

    // Por categoria
    const catCount = {}
    const catMiss = {}
    for (const t of tasks) {
      const name = categoryById(t.category_id)?.name || 'Sem categoria'
      catCount[name] = (catCount[name] || 0) + 1
      if (t.status === STATUS.MISSED) catMiss[name] = (catMiss[name] || 0) + 1
    }

    // Por dia da semana (atividades sem data nao tem dia — ficam de fora daqui,
    // mas continuam contando nos totais/categorias acima).
    const dayCount = {}
    const dayMiss = {}
    for (const t of tasks) {
      const day = fromISODate(t.date)
      if (!day) continue
      const dow = day.getDay()
      dayCount[dow] = (dayCount[dow] || 0) + 1
      if (t.status === STATUS.MISSED) dayMiss[dow] = (dayMiss[dow] || 0) + 1
    }

    const colorFor = (name) =>
      categories.find((c) => c.name === name)?.color || '#94a3b8'

    const toCatItems = (obj) =>
      Object.entries(obj)
        .map(([label, value]) => ({ label, value, color: colorFor(label) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)

    const toDayItems = (obj) =>
      WEEK_DAYS.map((d) => ({
        label: d.label,
        value: obj[d.key] || 0,
      }))
        .filter((i) => i.value > 0)
        .sort((a, b) => b.value - a.value)

    const rescheduled = tasks
      .filter((t) => (t.reschedule_count || 0) > 0)
      .map((t) => ({ label: t.title, value: t.reschedule_count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    return {
      total,
      done,
      missed,
      delegated,
      notNeeded,
      completion: percent(done, total),
      missRate: percent(missed, total),
      catCount: toCatItems(catCount),
      catMiss: toCatItems(catMiss),
      dayCount: toDayItems(dayCount),
      dayMiss: toDayItems(dayMiss),
      rescheduled,
    }
  }, [tasks, categories, categoryById])

  const cabecalho = <PageHeader title="Relatórios" subtitle="O que os seus dados dizem" />

  if (error) {
    return (
      <Page width="form">
        {cabecalho}
        <ErrorState onRetry={reload} />
      </Page>
    )
  }

  if (loading && tasks.length === 0) {
    return (
      <Page width="form">
        {cabecalho}
        {/* O esqueleto tem a forma do que vem: quatro numeros pequenos e duas
            listas. Um bloco cinza gigante prometeria outra coisa. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface px-3 py-2.5">
              <Skeleton className="h-5 w-10" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="surface p-4">
              <Skeleton className="h-4 w-40" />
              <div className="mt-3 space-y-2.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Page>
    )
  }

  if (tasks.length === 0) {
    return (
      <Page width="form">
        {cabecalho}
        <EmptyState
          icon={TrendingUp}
          title="Ainda não há o que medir"
          description="Conforme você cria e conclui atividades, o padrão aparece aqui."
        />
      </Page>
    )
  }

  return (
    <Page width="form">
      {cabecalho}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero rotulo="Criadas" valor={m.total} />
        <Numero rotulo="Concluídas" valor={m.done} tom="positive" />
        <Numero rotulo="Furadas" valor={m.missed} tom={m.missed > 0 ? 'danger' : 'neutro'} />
        <Numero rotulo="Delegadas" valor={m.delegated} />
        <Numero rotulo="Não necessárias" valor={m.notNeeded} />
        <Numero rotulo="Conclusão" valor={`${m.completion}%`} tom="positive" />
        <Numero rotulo="Furo" valor={`${m.missRate}%`} tom={m.missRate > 0 ? 'danger' : 'neutro'} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList
          title="Categorias com mais tarefas"
          items={m.catCount}
          emptyLabel="Sem dados"
        />
        <BarList
          title="Categorias com mais furos"
          items={m.catMiss}
          emptyLabel="Nenhum furo por categoria 🎉"
        />
        <BarList
          title="Dias da semana com mais tarefas"
          items={m.dayCount}
          colorKey="#6366f1"
          emptyLabel="Sem dados"
        />
        <BarList
          title="Dias da semana com mais furos"
          items={m.dayMiss}
          colorKey="#ef4444"
          emptyLabel="Nenhum furo 🎉"
        />
        <div className="lg:col-span-2">
          <BarList
            title="Atividades mais reagendadas"
            items={m.rescheduled}
            colorKey="#f59e0b"
            emptyLabel="Nenhuma atividade reagendada"
          />
        </div>
      </div>
    </Page>
  )
}
