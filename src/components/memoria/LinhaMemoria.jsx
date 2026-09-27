import { StickyNote, ListChecks, Link2, Lightbulb } from 'lucide-react'
import { cx } from '../../lib/utils'
import { FORMATO, SIGNIFICADO, legendaDoItem, quandoGuardado } from '../../lib/memoria'

// ---------------------------------------------------------------------------
// UMA LINHA DA MEMORIA.
//
// Tres informacoes, nessa ordem de peso: o que e (titulo), do que se trata
// (previa de uma linha) e a legenda curta (quando + UM estado relevante).
//
// O ICONE diz o FORMATO — e por isso a palavra "Nota" nunca aparece escrita ao
// lado dele. O erro que o briefing nomeia ("nao repetir Nota/Link/Ideia em
// tres lugares da mesma linha") e facil de cometer: cada eixo do modelo pede o
// seu chip, e em quatro chips ninguem le nenhum. Aqui o formato e desenho, o
// estado e texto, e o significado so aparece quando nao ha nada mais urgente a
// dizer (ver `legendaDoItem`).
// ---------------------------------------------------------------------------

function iconeDoItem(item) {
  if (item.formato === FORMATO.LINK) return Link2
  if (item.significado === SIGNIFICADO.IDEIA) return Lightbulb
  if (item.formato === FORMATO.CHECKLIST) return ListChecks
  return StickyNote
}

export default function LinhaMemoria({ item, selecionado, onAbrir }) {
  const Icone = iconeDoItem(item)
  const legenda = legendaDoItem(item, { quando: quandoGuardado(item.atualizadoEm) })

  return (
    <button
      type="button"
      data-testid="memoria-item"
      data-item-id={item.id}
      data-selecionado={selecionado ? 'sim' : 'nao'}
      aria-current={selecionado ? 'true' : undefined}
      onClick={() => onAbrir(item)}
      className={cx(
        'flex w-full items-start gap-3 px-3.5 py-3 text-left',
        // O item aberto e marcado por SUPERFICIE, como o destino ativo da
        // barra lateral — nao por borda colorida. Mesma gramatica em todo o
        // produto, entao "selecionado" nao precisa ser aprendido duas vezes.
        selecionado ? 'bg-surface-2' : 'tapavel bg-surface',
      )}
    >
      <Icone
        size={16}
        className={cx('mt-0.5 shrink-0', selecionado ? 'text-accent' : 'text-muted')}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-primary">{item.titulo}</span>
        {item.previa && (
          <span className="mt-0.5 block truncate text-[13px] text-secondary">{item.previa}</span>
        )}
        {legenda && <span className="text-caption mt-1 block truncate">{legenda}</span>}
      </span>
    </button>
  )
}
