import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/utils'

// Bottom sheet no mobile (sobe de baixo, alça, safe-area) e diálogo centralizado
// no desktop. Substitui os grandes modais. Fecha por backdrop/Esc. O conteúdo
// controla seu próprio scroll; teclado do iOS não quebra (a folha cresce com
// dvh e o conteúdo rola).
export default function Sheet({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white animate-in dark:bg-slate-900 sm:rounded-3xl',
          maxWidth,
        )}
      >
        {/* Alça (mobile) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        {title && (
          <div className="px-5 pb-1 pt-3">
            <h2 className="text-page">{title}</h2>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && (
          <div
            className="flex gap-2 border-t hair px-5 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
