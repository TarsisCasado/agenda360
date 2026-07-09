import { cx } from '../../lib/utils'

// Spinner padrao do Design System.
export default function Spinner({ size = 20, className }) {
  return (
    <span
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-brand-200 border-t-brand-600',
        className,
      )}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Carregando"
    />
  )
}
