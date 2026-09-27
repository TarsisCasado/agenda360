import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { cx } from '../../lib/utils'
import { CONVITE, contextoDaSuperficie } from '../../lib/copilotoContexto'

// ---------------------------------------------------------------------------
// A FAISCA — a entrada contextual do Copiloto nas quatro superficies (C3).
//
// Um botao de texto com uma faisca. Nao e um painel de IA, nao e um card, nao
// e uma caixa de sugestao permanente ocupando o topo de quatro telas. A
// diferenca importa: uma caixa grande promete que a IA esta fazendo algo o
// tempo todo; uma linha discreta diz que ela esta disponivel quando chamada —
// que e a verdade.
//
// Ao clicar, navega para `/assistente` levando o contexto por state de rota.
// NAO envia turno, NAO grava, NAO propoe. A tela abre sabendo de onde veio.
// ---------------------------------------------------------------------------
export default function AcaoCopiloto({ superficie, extra, rotulo, className }) {
  const navigate = useNavigate()
  const contexto = contextoDaSuperficie(superficie, extra || {})
  const texto = rotulo || CONVITE[superficie] || 'Pedir ajuda ao Copiloto'

  return (
    <button
      type="button"
      data-testid={`copiloto-contextual-${superficie}`}
      data-superficie={superficie}
      onClick={() => navigate('/assistente', { state: { copiloto: contexto } })}
      className={cx(
        'press inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5',
        'text-[13px] font-semibold text-accent transition-colors active:bg-surface-2',
        'hover:bg-surface-2',
        className,
      )}
    >
      <Sparkles size={14} className="shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  )
}
