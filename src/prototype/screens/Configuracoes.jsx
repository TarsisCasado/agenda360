import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useProto, useAcoes, useTema } from '../store/contexto'
import { Secao, Chip } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// CONFIGURACOES — no protótipo, só o que precisa ser JULGADO.
//
// Tema é o item que muda a percepção da interface inteira, então ele funciona
// de verdade aqui. As preferências de notificação aparecem para mostrar a
// distinção que importa (histórico sempre; interrupção conforme preferência),
// mas nada disso persiste depois do reload — e não precisa.
// ---------------------------------------------------------------------------
const TEMAS = [
  { valor: 'claro', label: 'Claro', icone: Sun },
  { valor: 'escuro', label: 'Escuro', icone: Moon },
  { valor: 'sistema', label: 'Sistema', icone: Monitor },
]

export default function Configuracoes() {
  const { estado } = useProto()
  const acoes = useAcoes()
  const { escolhido, escuro } = useTema()
  const eu = estado.pessoas?.find((p) => p.eu)
  const acompanhadas = estado.tarefas.filter((t) => t.acompanhando).length

  return (
    <div className="px-entra">
      <header className="flex items-center gap-3">
        <span className="px-pessoa px-pessoa-eu h-11 w-11 text-[14px]">{eu?.iniciais}</span>
        <div>
          <h1 className="px-titulo-tela">{eu?.nome}</h1>
          <p className="mt-0.5 text-[13px] text-muted">Protótipo · dados fictícios</p>
        </div>
      </header>

      <Secao titulo="Tema">
        <div className="flex flex-wrap gap-2">
          {TEMAS.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => acoes.definirTema(t.valor)}
              aria-pressed={escolhido === t.valor}
              className={cx(
                'press flex min-w-[112px] flex-1 flex-col items-start gap-2 rounded-row border px-3.5 py-3 text-left transition',
                escolhido === t.valor
                  ? 'border-accent bg-accent-soft text-accent-text'
                  : 'border-hairline text-secondary hover:border-accent',
              )}
            >
              <t.icone size={18} />
              <span className="flex items-center gap-1.5 text-[14px] font-medium">
                {t.label}
                {escolhido === t.valor && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          {escolhido === 'sistema'
            ? `Seguindo o aparelho — agora em ${escuro ? 'escuro' : 'claro'}.`
            : `Fixo em ${escolhido}.`}
          {' '}No protótipo o tema vale para a sessão; recarregar volta ao padrão.
        </p>
      </Secao>

      <Secao titulo="Notificações">
        <p className="text-[13.5px] leading-relaxed text-secondary">
          Todo evento relevante entra no histórico da tarefa, em{' '}
          <strong className="font-semibold">Atividade</strong>. Só alguns interrompem:
          aceite, devolução, bloqueio, alteração de prazo, menção e nova atribuição.
          Mudança rotineira de estado fica no histórico.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip on>Acompanhando · {acompanhadas}</Chip>
          <span className="px-motivo">
            Cada tarefa pode ser silenciada no próprio detalhe, sem sair do histórico.
          </span>
        </div>
      </Secao>

      <Secao titulo="Neste protótipo não existe">
        <ul className="space-y-1 text-[13.5px] leading-relaxed text-muted">
          {[
            'Conta real, login ou permissões',
            'Banco de dados, sincronização ou tempo real',
            'Push de verdade — as notificações são simuladas',
            'Vários responsáveis ou cadeia de delegação',
            'Múltiplos alertas na mesma atividade',
          ].map((x) => (
            <li key={x} className="flex gap-2">
              <span className="text-faint">·</span> {x}
            </li>
          ))}
        </ul>
      </Secao>
    </div>
  )
}
