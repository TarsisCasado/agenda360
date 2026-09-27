import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// SECTION — o agrupamento padrao do produto.
//
// Antes, cada tela repetia a mesma string ("surface divide-y hair overflow-
// hidden ring-1 ring-slate-100 dark:ring-slate-800/70") em volta de tudo, o
// que criava caixa dentro de caixa. Aqui o agrupamento e feito por RITMO
// (rotulo discreto + lista com hairlines), nao por moldura.
//
// variant:
//   'open'  (padrao) — a lista vive sobre o canvas. Menos caixas.
//   'panel'          — quando o grupo precisa de fundo proprio (destaque).
// ---------------------------------------------------------------------------
export default function Section({
  label,
  count,
  tone,
  action,
  variant = 'open',
  className,
  children,
}) {
  // Grupo vazio nao ocupa espaco nem deixa rotulo orfao na tela.
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  if (Array.isArray(items) && items.length === 0) return null

  return (
    <section className={className}>
      {(label || action) && (
        <div className="mb-1 flex items-center justify-between gap-3 px-2">
          <h2 className={cx('text-section flex items-center gap-1.5', tone)}>
            {label}
            {count != null && count > 0 && (
              <span className="text-[11px] font-semibold tabular-nums text-faint">{count}</span>
            )}
          </h2>
          {action}
        </div>
      )}
      <div className={variant === 'panel' ? 'list-panel' : 'list'}>{items}</div>
    </section>
  )
}

// Acao textual do cabecalho (discreta, nao botao permanente).
export function SectionAction({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="press text-[13px] font-semibold text-accent-text transition-opacity active:opacity-60"
    >
      {children}
    </button>
  )
}
