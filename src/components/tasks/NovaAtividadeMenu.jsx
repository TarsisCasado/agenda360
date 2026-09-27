import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListTodo, CalendarClock, Sparkles, PenLine, ArrowUp } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// UX1.6 — NO TELEFONE, A PORTA COMECA COM UM CAMPO.
//
// Antes o `+` abria tres linhas de escolha, e escolher e mais caro do que
// escrever quando o que se tem e uma frase na cabeca. Agora a folha abre
// CURTA: uma pergunta, um campo, e abaixo quatro atalhos discretos para quem
// ja sabe o formato. Nenhum formulario grande aparece de imediato — ele so
// abre se a pessoa PEDIR criacao estruturada.
//
// O campo nao interpreta nada aqui: ele entrega o texto a captura conversacional
// que ja existe (CaptureSheet), que propoe e espera confirmacao. Nada e gravado
// por escrever.
//
// No desktop a folha continua sendo o popover de sempre, ancorado no botao: o
// campo apareceria a 60px de um campo de busca global, e dois campos lado a
// lado no topo e exatamente a duplicacao que a Topbar ja resolveu.
// ---------------------------------------------------------------------------
const ATALHOS = [
  { chave: 'tarefa', rotulo: 'Tarefa', Icone: ListTodo },
  { chave: 'compromisso', rotulo: 'Compromisso', Icone: CalendarClock },
  { chave: 'nota', rotulo: 'Nota', Icone: PenLine },
  { chave: 'capturar', rotulo: 'Copiloto', Icone: Sparkles },
]

const OPCOES = [
  { chave: 'tarefa', tipo: TAREFA, Icone: ListTodo },
  { chave: 'compromisso', tipo: COMPROMISSO, Icone: CalendarClock },
  {
    chave: 'nota',
    tipo: { rotulo: 'Nota', descricao: 'Só escrever, sem formulário' },
    Icone: PenLine,
  },
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
  const campoRef = useRef(null)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
    }
    // Foco na primeira opcao: o menu abriu por acao explicita, entao teclado e
    // leitor de tela comecam dentro dele. NAO focamos o campo automaticamente:
    // no iPhone isso subiria o teclado por cima da folha antes de a pessoa ter
    // lido o que ela oferece.
    setTexto('')
    painelRef.current?.querySelector('button')?.focus?.()
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const enviar = (e) => {
    e?.preventDefault?.()
    const t = texto.trim()
    if (!t) return
    onClose?.()
    onEscolher?.('capturar', { texto: t })
  }

  // TELEFONE: pergunta + campo + atalhos. Curto por decisao — a folha ocupa o
  // minimo e sobe junto com o polegar.
  const curto = (
    <div ref={painelRef} className="px-4 pb-2 pt-4 sm:hidden" aria-label="O que registrar">
      <p className="text-[15px] font-semibold text-primary">O que você quer registrar?</p>
      <form onSubmit={enviar} className="relative mt-2.5">
        <input
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva do seu jeito…"
          aria-label="O que você quer registrar"
          data-testid="captura-campo"
          className="input !pr-11"
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          aria-label="Continuar"
          data-testid="captura-enviar"
          className="press absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-35"
        >
          <ArrowUp size={16} strokeWidth={2.6} />
        </button>
      </form>

      {/* QUEBRA EM DUAS LINHAS, e nao rolagem horizontal. Em 390px os quatro
          atalhos nao cabem numa fila: o ultimo — Copiloto — ficava cortado na
          borda, atras de uma rolagem que ninguem descobre. Duas linhas custam
          44px e tornam as quatro portas visiveis de uma vez, que e o ponto de
          existirem. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pb-1">
        {ATALHOS.map(({ chave, rotulo, Icone }) => (
          <button
            key={chave}
            type="button"
            data-testid={`captura-atalho-${chave}`}
            onClick={() => { onClose?.(); onEscolher?.(chave) }}
            className="press inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-secondary active:bg-surface-3"
          >
            <Icone size={14} />
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  )

  const itens = (
    <div className="hidden p-1.5 sm:block" role="menu" aria-label="O que criar">
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
        {/* Telefone: folha curta com campo. Desktop: o popover de sempre.
            As classes responsivas vao nos PROPRIOS paineis, sem div extra: um
            invólucro transparente entre o painel flutuante e a lista muda quem
            e o `parentElement` do menu — e e por ele que o contraste do tema
            escuro e medido. */}
        {curto}
        {itens}
        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
      </div>
    </>,
    document.body,
  )
}
