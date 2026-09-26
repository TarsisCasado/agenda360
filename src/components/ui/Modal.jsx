import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../../lib/utils'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    // Guarda o elemento focado antes de abrir, para restaurar ao fechar.
    previouslyFocused.current = document.activeElement
    const panel = panelRef.current

    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll(FOCUSABLE)) : []

    // Foco inicial: preferimos o primeiro campo do formulario (mantem a UX de
    // "titulo em foco" ao abrir); senao, o primeiro focavel; senao o painel.
    const firstField = panel?.querySelector(
      'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])',
    )
    ;(firstField || focusables()[0] || panel)?.focus?.()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: mantem o Tab dentro do modal.
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        panel?.focus?.()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey && (activeEl === firstEl || activeEl === panel)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
      // Retorna o foco ao elemento anterior (acessibilidade).
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          // dvh (nao vh): no iOS PWA a barra dinamica/area segura encurtam a
          // viewport; com vh o rodape/ultimo campo ficavam atras do "home
          // indicator". dvh + safe-area no rodape mantem tudo alcancavel.
          'animate-sheet relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface shadow-float focus:outline-none sm:rounded-sheet',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-center justify-between border-b hair px-5 py-4">
          <h3 id={titleId} className="text-title">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="icon-btn h-9 w-9"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t hair px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
