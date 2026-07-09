import { useEffect } from 'react'

// Fecha um popover/menu ao pressionar Esc. Aditivo: nao remove o clique-fora
// existente, apenas adiciona o atalho de teclado (acessibilidade / feel premium).
export function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
