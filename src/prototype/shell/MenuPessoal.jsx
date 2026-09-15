import { Link } from 'react-router-dom'
import { CircleDashed, PieChart, Settings, Sparkles, ChevronRight } from 'lucide-react'
import { useProto } from '../store/contexto'
import { Folha } from '../parts/base'

// ---------------------------------------------------------------------------
// MENU PESSOAL DO TELEFONE.
//
// Revisao e Relatorios NAO moram dentro de Configuracoes: sao acompanhamento do
// trabalho, nao ajustes do aplicativo. Enfia-los em "Config" e o jeito classico
// de matar duas telas boas.
//
// A barra inferior e dos quatro destinos e do [+]. Tudo o que e capacidade
// secundaria entra por aqui, a um toque do avatar.
// ---------------------------------------------------------------------------
const ITENS = [
  { to: '/prototipo/revisao', label: 'Revisão', detalhe: 'O que merece atenção', icone: CircleDashed },
  { to: '/prototipo/relatorios', label: 'Relatórios', detalhe: 'O que aconteceu', icone: PieChart },
  { to: '/prototipo/copiloto', label: 'Copiloto', detalhe: 'Conversa ampliada', icone: Sparkles },
  { to: '/prototipo/config', label: 'Perfil e configurações', detalhe: 'Tema e preferências', icone: Settings },
]

export default function MenuPessoal({ aberta, aoFechar }) {
  const { estado } = useProto()
  const eu = estado.pessoas?.find((p) => p.eu)
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo={eu?.nome || 'Perfil'} subtitulo="Protótipo · dados fictícios" largura="max-w-[420px]">
      <div className="space-y-1">
        {ITENS.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            onClick={aoFechar}
            className="press flex items-center gap-3 rounded-row border border-hairline px-4 py-3 transition hover:border-accent"
          >
            <i.icone size={17} className="flex-none text-accent-text" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">{i.label}</span>
              <span className="px-motivo mt-0.5 block">{i.detalhe}</span>
            </span>
            <ChevronRight size={16} className="flex-none text-muted" />
          </Link>
        ))}
      </div>
    </Folha>
  )
}
