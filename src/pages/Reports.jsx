import { useMemo } from 'react'
import {
  ListTodo,
  CheckCircle2,
  XCircle,
  Share2,
  Ban,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { PageHeader, StatCard, EmptyState, ErrorState } from '../components/ui/Common'
import { Skeleton } from '../components/ui/Skeleton'
import { useTasks } from '../hooks/useTasks'
import { useData } from '../context/DataContext'
import { STATUS, WEEK_DAYS } from '../lib/constants'
import { percent } from '../lib/utils'
import { fromISODate } from '../lib/date'

function BarList({ title, items, colorKey, emptyLabel }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="card p-5">
      <h3 className="mb-4 font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                  {i.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: i.color }}
                    />
                  )}
                  {i.label}
                </span>
                <span className="font-semibold text-slate-500">{i.value}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(i.value / max) * 100}%`,
                    backgroundColor: i.color || colorKey,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

  if (error) {
    return (
      <div>
        <PageHeader title="Relatorios" subtitle="Metricas da sua produtividade" />
        <ErrorState onRetry={reload} />
      </div>
    )
  }

  if (loading && tasks.length === 0) {
    return (
      <div>
        <PageHeader title="Relatorios" subtitle="Metricas da sua produtividade" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div>
        <PageHeader title="Relatorios" subtitle="Metricas da sua produtividade" />
        <EmptyState
          icon={TrendingUp}
          title="Sem dados ainda"
          description="Crie e conclua atividades para ver seus relatorios aqui."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Relatorios" subtitle="Metricas da sua produtividade" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total criadas" value={m.total} icon={ListTodo} tone="brand" />
        <StatCard label="Concluidas" value={m.done} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Furadas" value={m.missed} icon={XCircle} tone="red" />
        <StatCard label="Delegadas" value={m.delegated} icon={Share2} tone="violet" />
        <StatCard label="Nao necessarias" value={m.notNeeded} icon={Ban} tone="slate" />
        <StatCard
          label="Taxa de conclusao"
          value={`${m.completion}%`}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Taxa de furo"
          value={`${m.missRate}%`}
          icon={TrendingDown}
          tone="red"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
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
            title="Ranking de atividades mais reagendadas"
            items={m.rescheduled}
            colorKey="#f59e0b"
            emptyLabel="Nenhuma atividade reagendada"
          />
        </div>
      </div>
    </div>
  )
}
