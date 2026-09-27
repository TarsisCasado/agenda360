import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// SHEET — folha inferior no mobile, dialogo centrado no desktop.
//
// Detalhes que fazem parecer nativo:
//   - a folha SOBE (animate-sheet) em vez de aparecer;
//   - o backdrop entra em fade separado, mais lento;
//   - alca de arraste visivel no mobile;
//   - ALTURA PELO CONTEUDO: nada de altura fixa. Duas mensagens = folha
//     pequena; a conversa cresce e a folha cresce junto, ate um teto seguro —
//     dai em diante o scroll e interno;
//   - TECLADO DO iOS: no Safari o teclado NAO encurta o layout viewport, so o
//     visual viewport. Uma folha `position: fixed` ancorada em baixo fica,
//     portanto, ATRAS do teclado: o Safari empurra a pagina para revelar o
//     campo e a folha aparenta ocupar a tela inteira, com o rodape fora de
//     alcance. Por isso lemos window.visualViewport e ancoramos a folha logo
//     ACIMA do teclado, limitando a altura ao espaco realmente visivel;
//   - rodape respeita a safe-area inferior.
// ---------------------------------------------------------------------------

// Espaco ocupado pelo teclado (0 quando fechado) e altura util visivel.
function readViewport() {
  if (typeof window === 'undefined') return { keyboard: 0, available: null }
  const vv = window.visualViewport
  if (!vv) return { keyboard: 0, available: null }
  const keyboard = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)))
  return { keyboard, available: Math.round(vv.height) }
}

function useViewportInsets(active) {
  const [insets, setInsets] = useState({ keyboard: 0, available: null })

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const sync = () => setInsets(readViewport())
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      setInsets({ keyboard: 0, available: null })
    }
  }, [active])

  return insets
}

export default function Sheet({ open, onClose, title, subtitle, children, footer, maxWidth = 'max-w-lg' }) {
  const { keyboard, available } = useViewportInsets(open)

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

  // Teto de altura: 88% do que esta REALMENTE visivel (ja descontado o
  // teclado). Sem visualViewport, cai no 88dvh do CSS.
  const maxHeight = available ? `${Math.round(available * 0.88)}px` : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      // A folha encosta no topo do teclado, nunca atras dele.
      style={keyboard ? { bottom: keyboard } : undefined}
    >
      <div
        className="animate-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={maxHeight ? { maxHeight } : undefined}
        className={cx(
          // min-h protege so o caso degenerado (folha vazia); a altura normal
          // vem do conteudo.
          'animate-sheet relative z-10 flex max-h-[88dvh] min-h-[9rem] w-full flex-col rounded-t-sheet bg-surface shadow-float sm:rounded-sheet',
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
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3"
          // Sem rodape, e o conteudo que encosta na borda inferior: a
          // safe-area passa a ser responsabilidade dele.
          style={
            footer
              ? undefined
              : { paddingBottom: keyboard ? '0.75rem' : 'max(0.75rem, env(safe-area-inset-bottom))' }
          }
        >
          {children}
        </div>
        {footer && (
          <div
            className="flex gap-2 border-t hair px-5 py-3"
            // Com o teclado aberto a safe-area ja nao se aplica (o home
            // indicator esta coberto): o padding extra viraria buraco.
            style={{ paddingBottom: keyboard ? '0.75rem' : 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
