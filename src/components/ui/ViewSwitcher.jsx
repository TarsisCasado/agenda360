import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// SELETOR DE VISÃO — o mesmo objeto em outro recorte.
//
// Existe porque o CP5.2 parou de tratar "recorte" como DESTINO. Antes, ver o
// mês era ir para outra tela ("Calendário") e ver a semana era ir para outra
// ainda ("Kanban semanal"). Sao a mesma base de dados vista de outro angulo —
// e trocar de angulo tem de custar um toque, nao uma viagem pelo menu.
//
// Visual: sem moldura, sem pilulas coloridas. O ativo e marcado por SUPERFICIE
// e peso do texto, como o item ativo da barra lateral — a mesma gramatica.
// ---------------------------------------------------------------------------
export default function ViewSwitcher({ value, options, onChange, className }) {
  return (
    <div
      role="tablist"
      aria-label="Visão"
      className={cx('inline-flex items-center gap-0.5 rounded-row bg-surface-2 p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              'press min-h-[34px] rounded-[11px] px-3 text-[13px] transition-colors',
              active ? 'bg-surface font-semibold text-primary shadow-raised' : 'font-medium text-muted',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
