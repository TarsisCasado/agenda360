import { cx } from '../../lib/utils'

// Primitivo de carregamento (shimmer). Usar no lugar de spinners em listas para
// dar percepcao de velocidade nativa.
export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} />
}

// Esqueleto de uma LINHA de tarefa — espelha o layout real (circulo + titulo
// + meta), entao a lista nao "pula" quando os dados chegam.
export function TaskCardSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-surface px-3 py-3">
      <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-[13px] w-1/2" />
        <Skeleton className="h-[10px] w-20" />
      </div>
    </div>
  )
}

// Lista de skeletons de tarefa.
export function TaskListSkeleton({ count = 4 }) {
  return (
    <div className="list">
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
