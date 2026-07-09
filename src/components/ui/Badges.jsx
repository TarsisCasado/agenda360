import { memo } from 'react'
import { STATUS_META, PRIORITY_META } from '../../lib/constants'
import { cx } from '../../lib/utils'

// Componentes puros (so dependem das props) -> memoizados para evitar
// re-render desnecessario quando aparecem em listas longas de tarefas.
export const StatusBadge = memo(function StatusBadge({ status, size = 'sm' }) {
  const meta = STATUS_META[status] || { label: status, dot: '#94a3b8' }
  return (
    <span
      className={cx(
        'chip border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        size === 'xs' && 'px-2 py-0 text-[11px]',
      )}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      {meta.label}
    </span>
  )
})

export const PriorityBadge = memo(function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.medium
  return (
    <span
      className="chip"
      style={{
        backgroundColor: meta.color + '22',
        color: meta.color,
      }}
    >
      {meta.label}
    </span>
  )
})

export const CategoryBadge = memo(function CategoryBadge({ category }) {
  if (!category) return null
  return (
    <span
      className="chip"
      style={{ backgroundColor: category.color + '22', color: category.color }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </span>
  )
})
