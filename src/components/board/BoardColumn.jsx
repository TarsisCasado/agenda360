import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import BoardCard from './BoardCard'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// COLUNA DO QUADRO — bandeja, nao caixa.
//
// A coluna nao tem borda, nao tem sombra e nao tem cabecalho dentro de um
// painel. Ela e uma SUPERFICIE rebaixada em relacao ao canvas (bg-board), e os
// cartoes sobem dela. E so isso que separa uma coluna da outra: cor e espaco.
// Foi o que o video B faz e foi o que a auditoria do CP5 apontou como o vicio
// do produto — caixa dentro de caixa dentro de caixa.
//
// O cabecalho fica FORA da bandeja, sobre o canvas: assim ele pertence a pagina
// e nao rola junto com os cartoes. Rotulo + contagem, nada mais.
//
// A lista de cartoes rola sozinha (`overflow-y-auto`). E o que permite ter uma
// coluna com trinta itens sem empurrar as outras tres para baixo — a diferenca
// entre um quadro e quatro listas empilhadas.
// ---------------------------------------------------------------------------
export default function BoardColumn({
  column,
  tasks,
  today,
  draggingId,
  isDropTarget,
  onOpen,
  onMove,
  onAdd,
  onDragEnterColumn,
  onDropColumn,
  footer,
}) {
  const [composing, setComposing] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const t = titulo.trim()
    if (!t || saving) return
    setSaving(true)
    try {
      const ok = await onAdd?.(t, column.key)
      // Só limpa se o serviço confirmou. Fechar o campo depois de um erro
      // apagaria o que a pessoa escreveu.
      if (ok !== false) {
        setTitulo('')
        setComposing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col"
      aria-label={`${column.label}, ${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`}
    >
      <header className="mb-1.5 flex items-baseline gap-2 px-1.5">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-primary">{column.label}</h2>
        <span className="text-[12px] font-semibold tabular-nums text-faint">{tasks.length}</span>
      </header>

      <div
        data-testid={`board-column-${column.key}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          onDragEnterColumn?.(column.key)
        }}
        onDragLeave={(e) => {
          // Só sai de verdade quando o ponteiro deixa a coluna inteira, não ao
          // cruzar a borda de um cartão de dentro dela.
          if (!e.currentTarget.contains(e.relatedTarget)) onDragEnterColumn?.(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDropColumn?.(e.dataTransfer.getData('text/task-id'), column.key)
        }}
        className={cx(
          'flex min-h-0 flex-1 flex-col rounded-row bg-board transition-shadow',
          isDropTarget && 'ring-2 ring-accent/55',
        )}
      >
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
          {tasks.length === 0 && !composing ? (
            // ZERO STATE: uma frase, sem ilustracao e sem caixa. A ESTRUTURA
            // continua visivel — quatro colunas com quatro alturas iguais —
            // porque um quadro vazio ainda precisa parecer um quadro.
            <p className="px-1.5 py-3 text-[12px] leading-snug text-faint">{column.empty}</p>
          ) : (
            tasks.map((task) => (
              <BoardCard
                key={task.id}
                task={task}
                columnKey={column.key}
                today={today}
                onOpen={onOpen}
                onMove={onMove}
                dragging={draggingId === task.id}
              />
            ))
          )}

          {composing && (
            <form onSubmit={submit} className="rounded-control bg-board-card p-1.5 ring-1 ring-accent/40">
              <textarea
                autoFocus
                rows={2}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) submit(e)
                  if (e.key === 'Escape') {
                    setComposing(false)
                    setTitulo('')
                  }
                }}
                placeholder={column.placeholder}
                className="field resize-none text-[13px] leading-snug"
              />
              <div className="mt-1 flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={!titulo.trim() || saving}
                  className="press rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : 'Adicionar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false)
                    setTitulo('')
                  }}
                  className="rounded-full px-2 py-1 text-[12px] text-muted hover:text-primary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {!composing && onAdd && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex min-h-[36px] items-center gap-1.5 rounded-b-row px-3 text-left text-[12px] font-medium text-muted transition-colors hover:bg-surface-2/60 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Plus size={13} /> Adicionar
          </button>
        )}
        {footer}
      </div>
    </section>
  )
}
