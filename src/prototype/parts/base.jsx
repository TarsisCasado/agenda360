import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/utils'

// Pecas pequenas e repetidas. Poucas de proposito — o produto se sustenta em
// objetos, linhas e hierarquia, nao em variedade de componentes.

export function Secao({ titulo, acao, children, className }) {
  return (
    <section className={cx('mt-7 first:mt-0', className)}>
      {(titulo || acao) && (
        <header className="mb-2 flex items-center justify-between gap-3">
          {titulo && <h2 className="px-secao">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  )
}

export function Vazio({ children }) {
  return <p className="py-5 text-[13.5px] text-muted">{children}</p>
}

export function Chip({ on, children, className, ...props }) {
  const Tag = props.onClick ? 'button' : 'span'
  return (
    <Tag
      type={props.onClick ? 'button' : undefined}
      aria-pressed={props.onClick ? Boolean(on) : undefined}
      className={cx('px-chip', on && 'px-chip-on', props.onClick && 'press', className)}
      {...props}
    >
      {children}
    </Tag>
  )
}

// Botao: o primario precisa PARECER primario. Foco visivel sempre — o teclado
// e uma via de primeira classe no desktop.
export function Botao({ variante = 'secundario', className, ...props }) {
  const estilos = {
    primario: 'bg-accent text-white shadow-raised hover:brightness-110',
    secundario: 'border border-hairline bg-surface text-primary hover:border-accent hover:text-accent-text',
    fantasma: 'text-secondary hover:bg-surface-2',
    perigo: 'border border-danger/40 text-danger hover:bg-danger/10',
  }
  return (
    <button
      type="button"
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13.5px] font-semibold transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-45',
        estilos[variante],
        className,
      )}
      {...props}
    />
  )
}

export function Marcar({ feito, onClick, label, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={feito}
      className={cx(
        'press grid h-[19px] w-[19px] flex-none place-items-center rounded-[6px] border transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        feito ? 'border-accent bg-accent text-white' : 'border-hairline hover:border-accent',
        className,
      )}
    >
      {feito && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path d="M2.5 6.2 4.7 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// FOLHA — a mesma peca nas duas larguras, com comportamento diferente:
// no telefone sobe de baixo (o polegar chega); no desktop e um painel central.
// ---------------------------------------------------------------------------
export function Folha({ aberta, aoFechar, titulo, subtitulo, children, rodape, largura = 'max-w-[560px]' }) {
  useEffect(() => {
    if (!aberta) return undefined
    const tecla = (e) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberta, aoFechar])

  if (!aberta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-start lg:pt-[8vh]">
      <button aria-label="Fechar" onClick={aoFechar} className="animate-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cx(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet border border-hairline bg-surface shadow-float lg:rounded-sheet',
          largura,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-snug">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 truncate text-[12.5px] text-muted">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="press -m-1 p-1 text-muted hover:text-primary">
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && (
          <footer className="pb-safe flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3.5">
            {rodape}
          </footer>
        )}
      </div>
    </div>
  )
}

// --- campos de formulario ---------------------------------------------------
export function Campo({ rotulo, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="px-rotulo">{rotulo}</span>
      {children}
    </label>
  )
}

export function Texto({ className, ...props }) {
  return <input type="text" className={cx('px-campo', className)} {...props} />
}

export function Area({ className, ...props }) {
  return <textarea className={cx('px-campo resize-none', className)} rows={3} {...props} />
}

export function Escolha({ opcoes, valor, aoEscolher, permitirVazio }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <Chip
          key={o.valor ?? 'vazio'}
          on={valor === o.valor}
          onClick={() => aoEscolher(permitirVazio && valor === o.valor ? null : o.valor)}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}
