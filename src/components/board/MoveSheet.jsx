import { ArrowRight, Pencil } from 'lucide-react'
import Sheet from '../ui/Sheet'
import { FLOW_COLUMNS } from '../../lib/board'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// MOVER PARA (toque) — a acao principal do quadro no iPhone.
//
// No desktop arrastar e o gesto natural; no toque, HTML5 drag-and-drop
// simplesmente NAO funciona no Safari do iOS, e emular arrasto com
// touchmove sobre um pager que tambem responde a arrasto horizontal seria
// disputar o mesmo gesto com o scroll — exatamente o tipo de gesto fragil que
// o briefing mandou nao construir. Entao no toque a via principal e esta, e ela
// precisa ser impecavel, nao um plano B.
//
// CUSTO: DOIS toques. `•••` abre a folha ja com os quatro destinos a mostra;
// o segundo toque move. Nao ha submenu "Mover para →" no meio, porque o titulo
// da folha ja diz isso.
//
// A coluna atual aparece marcada e desabilitada em vez de sumir: some-la
// mudaria a posicao dos outros itens conforme a coluna de origem, e a memoria
// muscular vale mais que a linha economizada.
// ---------------------------------------------------------------------------
export default function MoveSheet({ open, task, columnKey, onClose, onMove, onOpenDetails }) {
  return (
    <Sheet open={open} onClose={onClose} title="Mover para" subtitle={task?.title}>
      <div className="pb-1">
        {FLOW_COLUMNS.map((col) => {
          const atual = col.key === columnKey
          return (
            <button
              key={col.key}
              type="button"
              disabled={atual}
              onClick={() => {
                onClose?.()
                onMove?.(task, col.key)
              }}
              className={cx(
                'flex min-h-[52px] w-full items-center gap-3 rounded-row px-3 text-left transition-colors',
                atual ? 'text-muted' : 'text-primary active:bg-surface-2',
              )}
            >
              <ArrowRight
                size={17}
                className={cx('shrink-0', atual ? 'opacity-0' : 'text-muted')}
                aria-hidden
              />
              <span className="text-[15px] font-medium">{col.label}</span>
              {atual && <span className="text-caption ml-auto">está aqui</span>}
            </button>
          )
        })}

        <div className="my-1 border-t hair" />

        <button
          type="button"
          onClick={() => {
            onClose?.()
            onOpenDetails?.(task)
          }}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-row px-3 text-left text-primary transition-colors active:bg-surface-2"
        >
          <Pencil size={17} className="shrink-0 text-muted" aria-hidden />
          <span className="text-[15px] font-medium">Abrir detalhes</span>
        </button>
      </div>
    </Sheet>
  )
}
