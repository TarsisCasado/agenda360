import { useEffect, useLayoutEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// DETALHE MOVEL — a profundidade da nova linguagem (UX-M1).
//
// No telefone, abrir um objeto nao e "ir para outra pagina do aplicativo": e
// o objeto subindo por cima do lugar onde voce estava. A diferenca nao e
// estetica — ela decide se voltar custa reencontrar o seu lugar ou nao.
//
// Tres decisoes, e o resto e consequencia delas:
//
//   1. SUPERFICIE PROPRIA, por cima de tudo (inclusive da barra inferior, que
//      vive em z-30). A barra some durante o detalhe porque o detalhe nao e um
//      destino: e o mesmo destino, mais fundo. Manter a barra ali convidaria a
//      sair em vez de voltar;
//
//   2. O FUNDO NAO ROLA E NAO PERDE O LUGAR. `overflow:hidden` no documento
//      congela a pagina exatamente onde ela estava — ao contrario de
//      `position:fixed` no body, que zera a rolagem e devolve a pessoa ao topo
//      quando ela fecha. Quem chama guarda e restaura o `scrollY`, porque so
//      quem chama sabe o que "voltar ao mesmo lugar" significa;
//
//   3. VOLTAR, NAO CANCELAR. A seta diz que nada acontece ao sair. "Cancelar"
//      sugeriria que algo seria desfeito, e ler um objeto nao desfaz nada.
//
// Movimento: entra em ~200ms, subindo. `prefers-reduced-motion` anula (a regra
// esta em prototype.css, junto com as outras animacoes do prototipo).
// ---------------------------------------------------------------------------
export default function DetalheMovel({ aberto, aoVoltar, titulo, acima, children, rodape }) {
  // Efeito de LAYOUT, nao passivo: a limpeza (destravar a raiz) corre antes da
  // pintura em que a folha desaparece, entao nao ha um quadro em que o fundo ja
  // esta a mostra e ainda travado. Quem restaura a rolagem, do outro lado,
  // depende dessa ordem — efeitos de layout do pai rodam depois da limpeza dos
  // filhos, e e ali que a pagina ja voltou a ser rolavel.
  useLayoutEffect(() => {
    if (!aberto) return undefined
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    return () => { raiz.style.overflow = antes }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return undefined
    const tecla = (e) => { if (e.key === 'Escape') aoVoltar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, aoVoltar])

  if (!aberto) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      data-testid="m1-detalhe"
      className="px-sobe fixed inset-0 z-[70] flex flex-col bg-canvas"
    >
      {/* O cabecalho do detalhe e uma LINHA: voltar, e o rotulo do que isto e.
          O titulo do objeto nao mora aqui — ele mora no corpo, grande, porque
          e o conteudo. Repeti-lo na barra gastaria a unica linha de topo
          dizendo duas vezes a mesma coisa. */}
      <header className="pt-safe flex flex-none items-center gap-1 px-2 pb-1 pt-3">
        <button
          type="button"
          onClick={aoVoltar}
          data-testid="m1-voltar"
          className="press -ml-1 flex items-center gap-0.5 rounded-[10px] py-2 pl-1 pr-2.5 text-[15px] font-medium text-accent-text"
        >
          <ChevronLeft size={20} />
          Hoje
        </button>
        {acima && <span className="px-motivo ml-auto pr-2">{acima}</span>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{children}</div>

      {rodape && (
        <div className={cx('pb-safe flex-none border-t border-hairline bg-surface px-4 py-3')}>
          {rodape}
        </div>
      )}
    </div>
  )
}
