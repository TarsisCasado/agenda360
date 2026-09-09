import { cx } from '../../lib/utils'

// Cabecalho de secao editorial (nao um card): rotulo discreto + acao opcional.
// Usa a escala tipografica V2 (.text-section).
export default function SectionHeader({ label, tone, action, className }) {
  return (
    <div className={cx('mb-2 flex items-center justify-between', className)}>
      <h2 className={cx('text-section', tone)}>{label}</h2>
      {action}
    </div>
  )
}
