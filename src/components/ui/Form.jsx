import { forwardRef, useId, useLayoutEffect, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// CONTROLES DE FORMULARIO — DS V3.
//
// Existiam tres jeitos de escrever um campo no produto: o `.field` das telas
// novas, o `.input` da V3 e o Tailwind cru das telas antigas (com `bg-white`,
// `border-slate-200` e o select do sistema operacional aparecendo no meio de
// uma tela desenhada). O terceiro e o que faz uma tela parecer de outra
// geracao — e ele que sai daqui.
//
// Tres decisoes que valem para todos:
//
//   1. O CONTROLE E NATIVO. `<input>`, `<textarea>`, `<select>`,
//      `<input type="checkbox">` de verdade. O iPhone abre a roda dele, o
//      teclado navega, o leitor de tela anuncia, o rotulo clica. So a
//      aparencia e nossa;
//   2. UM ROTULO REAL, sempre ligado por id. Placeholder nao e rotulo: ele
//      some no instante em que a pessoa comeca a escrever, exatamente quando
//      ela mais precisa saber o que esta preenchendo;
//   3. UM SO ANEL DE FOCO em todo o produto — `ring-accent/40`. Foco visivel
//      nao e enfeite: e como se atravessa o formulario sem mouse.
// ---------------------------------------------------------------------------

// Rotulo + ajuda + erro. O erro substitui a ajuda (dois textos embaixo do
// campo brigam) e nunca depende so da cor: vem escrito.
export function Field({ label, hint, error, htmlFor, className, children }) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      )}
      {children}
      {(error || hint) && (
        <p className={cx('mt-1.5 text-[12px] leading-snug', error ? 'text-danger' : 'text-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export const TextInput = forwardRef(function TextInput(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const auto = useId()
  const inputId = id || auto
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cx('input', error && 'ring-2 ring-danger/50')}
        {...props}
      />
    </Field>
  )
})

export const TextArea = forwardRef(function TextArea(
  { label, hint, error, className, id, rows = 3, ...props },
  ref,
) {
  const auto = useId()
  const inputId = id || auto
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cx('input resize-none', error && 'ring-2 ring-danger/50')}
        {...props}
      />
    </Field>
  )
})

// A seta e desenhada por nos; a lista continua sendo a do sistema.
export const Select = forwardRef(function Select(
  { label, hint, error, className, id, children, ...props },
  ref,
) {
  const auto = useId()
  const inputId = id || auto
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <div className="relative">
        <select ref={ref} id={inputId} className="select" {...props}>
          {children}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </Field>
  )
})

// A linha inteira e o alvo de toque (>= 44px), nao o quadradinho de 20px.
export function Checkbox({ label, hint, className, id, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="flex min-h-[44px] cursor-pointer select-none items-center gap-3"
      >
        <input id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <span className="check-box" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="text-[15px] leading-snug text-primary">{label}</span>
      </label>
      {hint && <p className="text-caption ml-8">{hint}</p>}
    </div>
  )
}

// Interruptor: para o que liga e desliga AGORA (sem salvar depois). Onde a
// escolha e "qual", e Select ou segmented — nao interruptor.
export function Switch({ label, hint, className, id, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <label
      htmlFor={inputId}
      className={cx('flex min-h-[44px] cursor-pointer select-none items-center gap-3', className)}
    >
      <input id={inputId} type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug text-primary">{label}</span>
        {hint && <span className="text-caption block">{hint}</span>}
      </span>
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// FORMULARIO DENSO (CP5.9) — as pecas do editor de atividade.
//
// As tres decisoes do topo continuam valendo aqui (controle nativo, rotulo
// real, um anel de foco so). O que muda e a MOLDURA: num editor com doze
// propriedades, dar uma caixa cinza a cada uma faz a tela parecer um cadastro.
// Entao o que se ESCREVE perde a caixa, e o que se ESCOLHE vira linha dentro
// de um bloco agrupado.
//
// O rotulo continua existindo e continua ligado por id em todos eles — o que
// muda e onde ele aparece, nao se ele existe.
// ---------------------------------------------------------------------------

// Texto que CRESCE com o conteudo.
//
// Um <input> de uma linha corta o texto que nao cabe: no editor a 390px, um
// titulo comum como "Reuniao de alinhamento da equipe" sumia pela direita sem
// nenhum sinal. E um <textarea> de altura fixa faz o contrario — reserva duas
// linhas de vazio quando ha meia linha escrita, e o vao parece erro de
// diagramacao. Os dois campos livres do editor usam a mesma peca: altura
// medida a cada mudanca, nunca menor que uma linha.
function AutoGrow({ className, value, singleLine, onKeyDown, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      // Titulo e uma linha por natureza: Enter salta para o proximo campo em
      // vez de abrir uma quebra que nenhuma lista sabe mostrar.
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault()
        onKeyDown?.(e)
      }}
      className={cx('input-bare resize-none overflow-hidden', className)}
      {...props}
    />
  )
}

// Titulo da atividade: sem moldura, dominante. `aria-label` porque um rotulo
// visivel seria redundante com o proprio texto grande.
export function TitleInput({ className, ...props }) {
  return <AutoGrow singleLine className={cx('input-title', className)} {...props} />
}

// Texto livre secundario (descricao, observacao): sem moldura, hierarquia
// abaixo do titulo.
export function BareTextArea({ className, ...props }) {
  return (
    <AutoGrow
      className={cx('text-[15px] leading-relaxed text-secondary', className)}
      {...props}
    />
  )
}

// Bloco agrupado — uma superficie para varias propriedades.
export function PropGroup({ className, children }) {
  return <div className={cx('group-box', className)}>{children}</div>
}

// Linha de propriedade com um <select> nativo alinhado a direita.
export function PropSelect({ label, id, className, children, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <div className={cx('prop-row', className)}>
      <label htmlFor={inputId} className="prop-label">{label}</label>
      <div className="relative min-w-0 flex-1">
        <select id={inputId} className="select-inline" {...props}>
          {children}
        </select>
        <ChevronDown
          size={15}
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  )
}

// Linha de propriedade com entrada de texto alinhada a direita.
export function PropInput({ label, id, className, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <div className={cx('prop-row', className)}>
      <label htmlFor={inputId} className="prop-label">{label}</label>
      <input id={inputId} className="input-inline" {...props} />
    </div>
  )
}

// Linha de propriedade com interruptor — para o que LIGA e DESLIGA e revela
// mais linhas abaixo (progressive disclosure sem card aninhado).
export function PropSwitch({ label, id, className, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <label htmlFor={inputId} className={cx('prop-row cursor-pointer select-none', className)}>
      <span className="min-w-0 flex-1 text-[15px] font-medium text-primary">{label}</span>
      <input id={inputId} type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
    </label>
  )
}

// Celula do grupo Data / Inicio / Fim. Rotulo miudo em cima, valor embaixo:
// as tres dividem UMA caixa em vez de flutuarem como campos independentes de
// larguras que nao querem dizer nada.
export function SlotField({ label, id, className, ...props }) {
  const auto = useId()
  const inputId = id || auto
  return (
    <div className={cx('slot-cell', className)}>
      <label htmlFor={inputId} className="slot-label">{label}</label>
      <input id={inputId} className="slot-input" {...props} />
    </div>
  )
}

// Rotulo de secao do editor (QUANDO, PROPRIEDADES).
export function SectionLabel({ className, children }) {
  return <p className={cx('text-section mb-1.5 px-1', className)}>{children}</p>
}

// Nao ha "Segmented" aqui de proposito: a escolha entre poucas opcoes
// visiveis ja tem um dono no produto — components/ui/ViewSwitcher.jsx, a
// especie aprovada no CP5.2 (trilho rebaixado, ativo em superficie elevada).
// Criar um segundo componente com a mesma funcao seria repetir exatamente o
// erro que este checkpoint veio corrigir.
