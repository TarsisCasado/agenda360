import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// SHEET — folha inferior no mobile, dialogo centrado no desktop.
//
// Detalhes que fazem parecer nativo:
//   - a folha SOBE (animate-sheet) em vez de aparecer;
//   - o backdrop entra em fade separado, mais lento;
//   - alca de arraste visivel no mobile;
//   - altura em dvh e conteudo com scroll proprio: o teclado do iOS empurra
//     sem quebrar o layout;
//   - rodape respeita a safe-area inferior.
// ---------------------------------------------------------------------------
export default function Sheet({ open, onClose, title, subtitle, children, footer, maxWidth = 'max-w-lg' }) {
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
      <div
        className="animate-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'animate-sheet relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sheet bg-surface shadow-float sm:rounded-sheet',
          maxWidth,
        )}
      >
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-surface-3" />
        </div>
        {title && (
          <div className="px-5 pb-1 pt-4">
            <h2 className="text-page">{title}</h2>
            {subtitle && <p className="text-caption mt-0.5">{subtitle}</p>}
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
