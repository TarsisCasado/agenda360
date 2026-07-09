import { cx } from '../../lib/utils'

// Primitivo de carregamento (shimmer). Usar no lugar de spinners em listas para
// dar percepcao de velocidade nativa.
export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} />
}

// Esqueleto de um card de tarefa (usado nas listas enquanto carrega).
export function TaskCardSkeleton() {
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
    </div>
  )
}

// Lista de skeletons de tarefa.
export function TaskListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Esqueleto de card de estatistica (Hoje / Relatorios).
export function StatSkeleton({ count = 3 }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex flex-col items-center gap-2 p-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-6 w-8" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
