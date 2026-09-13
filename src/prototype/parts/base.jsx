import { cx } from '../../lib/utils'

// Pecas pequenas e repetidas do prototipo. Deliberadamente poucas: o produto
// se sustenta em LINHAS e HIERARQUIA, nao em variedade de componentes.

export function Secao({ titulo, acao, children, className }) {
  return (
    <section className={cx('mt-8 first:mt-0', className)}>
      {(titulo || acao) && (
        <header className="mb-2 flex items-baseline justify-between gap-3">
          {titulo && <h2 className="px-secao">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  )
}

export function Vazio({ children }) {
  return <p className="py-6 text-[13.5px] text-muted">{children}</p>
}

export function Chip({ on, children, className, ...props }) {
  const Tag = props.onClick ? 'button' : 'span'
  return (
    <Tag className={cx('px-chip', on && 'px-chip-on', props.onClick && 'press', className)} {...props}>
      {children}
    </Tag>
  )
}

export function Botao({ variante = 'secundario', className, ...props }) {
  const estilos = {
    primario: 'bg-accent text-white hover:opacity-90',
    secundario: 'border border-hairline text-primary hover:bg-surface-2',
    fantasma: 'text-secondary hover:bg-surface-2',
  }
  return (
    <button
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13.5px] font-semibold transition',
        estilos[variante],
        className,
      )}
      {...props}
    />
  )
}

// Caixa de marcar propria: a nativa nao acompanha a identidade e e pequena
// demais para o polegar.
export function Marcar({ feito, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={feito}
      className={cx(
        'press mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border transition',
        feito ? 'border-accent bg-accent text-white' : 'border-hairline hover:border-accent',
      )}
    >
      {feito && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path d="M2.5 6.2 4.7 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
