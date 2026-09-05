import { forwardRef, useId } from 'react'
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

// Nao ha "Segmented" aqui de proposito: a escolha entre poucas opcoes
// visiveis ja tem um dono no produto — components/ui/ViewSwitcher.jsx, a
// especie aprovada no CP5.2 (trilho rebaixado, ativo em superficie elevada).
// Criar um segundo componente com a mesma funcao seria repetir exatamente o
// erro que este checkpoint veio corrigir.
