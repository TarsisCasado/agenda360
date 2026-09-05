import { AlertTriangle, RotateCcw } from 'lucide-react'

// Anel de progresso circular (SVG). Usado no resumo do dia da tela "Hoje".
export function ProgressRing({ value = 0, size = 72, stroke = 7, children }) {
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// PageHeader e StatCard viviam aqui, escritos em `slate-*`/`brand-*` de antes
// do DS V3. Sairam no CP5.7: o cabecalho de pagina agora e unico
// (components/layout/Page.jsx) e o numero de relatorio virou a mesma peca das
// entradas de foco da tela Hoje. Nenhuma tela os usava fora daquelas tres.

// Estado de ERRO padronizado (falha ao carregar): mensagem amigavel + retry.
// Mantem o layout intacto e nunca "some" silenciosamente.
export function ErrorState({
  title = 'Nao foi possivel carregar',
  description = 'Algo deu errado ao buscar os dados. Verifique sua conexao e tente novamente.',
  onRetry,
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-danger">
        <AlertTriangle size={20} />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-primary">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-[19rem] text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary press">
          <RotateCcw size={16} /> Tentar novamente
        </button>
      )}
    </div>
  )
}

// Estado vazio: SEM caixa. Ar + um icone discreto + uma frase util.
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    // py menor de proposito: um vazio nao merece meia tela de altura. Ele diz
    // o que precisa dizer e devolve o espaco.
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {Icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Icon size={20} strokeWidth={1.8} />
        </div>
      )}
      <div>
        <p className="text-[15px] font-semibold text-primary">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-[19rem] text-[13px] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
