import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ListTodo, CalendarClock, Sparkles } from 'lucide-react'
import { TAREFA, COMPROMISSO } from '../../lib/activityKind'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// NOVA ATIVIDADE — escolher a porta antes de entrar (CP5.9.1).
//
// Ate aqui "Nova atividade" abria direto a captura conversacional. Isso e certo
// quando a pessoa tem algo solto na cabeca e quer despejar em linguagem natural
// — e foi por isso que o CP5.6 unificou as duas portas. Mas quando ela JA sabe
// que quer um compromisso de terca as 15h, conversar com o Copiloto para chegar
// la e um pedagio: a captura interpreta, propoe, e ela confirma algo que ja
// sabia desde o inicio.
//
// Entao a captura inteligente NAO sai. Ela deixa de ser obrigatoria.
//
// Tres escolhas, nao um modal intermediario: as duas criacoes diretas e a
// captura. No desktop e um popover ancorado no botao; no mobile a mesma lista
// sobe como folha, porque um popover de 200px preso ao topo de uma tela de
// 390px e um menu que nasce fora do alcance do polegar.
// ---------------------------------------------------------------------------

const OPCOES = [
  { chave: 'tarefa', tipo: TAREFA, Icone: ListTodo },
  { chave: 'compromisso', tipo: COMPROMISSO, Icone: CalendarClock },
  {
    chave: 'capturar',
    tipo: {
      rotulo: 'Capturar com o Copiloto',
      descricao: 'Escreva do seu jeito, organizo depois',
    },
    Icone: Sparkles,
  },
]

export default function NovaAtividadeMenu({ open, onClose, onEscolher }) {
  const painelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
    }
    // Foco na primeira opcao: o menu abriu por acao explicita, entao teclado e
    // leitor de tela comecam dentro dele.
    painelRef.current?.querySelector('button')?.focus?.()
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const itens = (
    <div ref={painelRef} className="p-1.5" role="menu" aria-label="O que criar">
      {OPCOES.map(({ chave, tipo, Icone }) => (
        <button
          key={chave}
          type="button"
          role="menuitem"
          onClick={() => { onClose?.(); onEscolher?.(chave) }}
          className="press flex min-h-[52px] w-full items-center gap-3 rounded-row px-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-secondary">
            <Icone size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-primary">{tipo.rotulo}</span>
            <span className="text-caption block">{tipo.descricao}</span>
          </span>
        </button>
      ))}
    </div>
  )

  return createPortal(
    <>
      {/* No mobile isto e uma FOLHA, entao escurece o fundo como todas as
          outras folhas do produto — sem isso a camada nao se le. No desktop e
          um popover ancorado no botao: escurecer a tela inteira para um menu de
          tres itens seria peso demais. Mesmo elemento, dois papeis. */}
      <div
        className="animate-backdrop fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
        onClick={onClose}
        aria-hidden
      />
      {/* Desktop: popover ancorado. Mobile: folha, pelo polegar. */}
      <div
        className={cx(
          'fixed z-[61] animate-sheet floating',
          // Mobile: folha, ao alcance do polegar.
          'inset-x-0 bottom-0 rounded-t-sheet',
          // Desktop: ancorado abaixo do botao, que mora no alto a direita.
          'sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[60px] sm:w-[280px] sm:rounded-sheet',
        )}
      >
        {itens}
        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
      </div>
    </>,
    document.body,
  )
}
