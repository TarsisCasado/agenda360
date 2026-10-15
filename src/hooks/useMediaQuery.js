import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// useMediaQuery — quando o CSS nao basta.
//
// A regra do produto continua sendo resolver responsividade em CSS: classe com
// prefixo `lg:`, sem JS no meio. Isto existe para o caso em que a diferenca
// nao e de ESTILO e sim de COMPONENTE — no CP5.4, o menu "Mover para" e um
// popover ancorado no cartao no desktop e uma folha inferior no toque. Sao
// duas arvores diferentes (a folha vai por portal para o body), entao nao da
// para trocar so a classe.
//
// SSR / ambiente sem matchMedia: devolve `false` e nunca quebra.
// ---------------------------------------------------------------------------
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const sync = () => setMatches(mql.matches)
    sync()
    // addEventListener nao existe em Safari < 14: mantem o fallback.
    if (mql.addEventListener) mql.addEventListener('change', sync)
    else mql.addListener(sync)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', sync)
      else mql.removeListener(sync)
    }
  }, [query])

  return matches
}

// O mesmo breakpoint do Tailwind `lg`, que e onde o quadro deixa de ser pager
// de uma coluna e passa a ser a grade de quatro.
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')
