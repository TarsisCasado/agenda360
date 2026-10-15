import { useProto } from '../store/contexto'
import { Folha } from './base'
import { RESPONSABILIDADE, EU } from '../mock/dados'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// AS PECAS DA DELEGACAO.
//
// Duas so, e pequenas de proposito: um rosto e um selo. Delegacao nao precisa
// de uma linguagem visual propria — precisa caber numa linha de tarefa sem
// empurrar o titulo para fora.
//
// O SELO diz o estado da RESPONSABILIDADE (aguardando aceite, aceita,
// devolvida) e nunca o da EXECUCAO (a fazer, em andamento, concluido). Sao
// eixos diferentes: dar um selo de "aceita" a cor de "concluido" faria a tela
// mentir sobre o que ja foi feito.
// ---------------------------------------------------------------------------
export function Pessoa({ id, nome, comNome, className }) {
  const { estado } = useProto()
  const p = (estado.pessoas || []).find((x) => x.id === id)
  if (!p) return null
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className={cx('px-pessoa', p.eu && 'px-pessoa-eu')} title={p.nome} aria-hidden="true">
        {p.iniciais}
      </span>
      {(comNome || nome) && <span className="text-[12px] text-secondary">{p.eu ? 'Você' : p.nome}</span>}
      <span className="sr-only">{p.eu ? 'Você' : p.nome}</span>
    </span>
  )
}

const SELOS = {
  [RESPONSABILIDADE.AGUARDANDO]: { classe: 'px-selo-aguardando', texto: 'aguardando aceite' },
  [RESPONSABILIDADE.DEVOLVIDA]: { classe: 'px-selo-devolvida', texto: 'devolvida' },
  [RESPONSABILIDADE.ACEITA]: { classe: 'px-selo-aceita', texto: 'aceita' },
}

export function SeloResponsabilidade({ t }) {
  if (!t?.responsabilidade) return null
  const selo = SELOS[t.responsabilidade]
  if (!selo) return null
  return <span className={cx('px-selo', selo.classe)}>{selo.texto}</span>
}

// "Delegada por Tarsis para Rubens" — a frase que o briefing pediu, dita por
// inteiro onde há espaço para ela.
export function LinhaDeDelegacao({ t, className }) {
  const { estado } = useProto()
  if (!t?.delegadorId || t.responsavelId === t.delegadorId) return null
  const nome = (id) => {
    const p = (estado.pessoas || []).find((x) => x.id === id)
    if (!p) return 'alguém'
    return p.eu ? 'você' : p.nome
  }
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  return (
    <span className={cx('text-[13px] text-secondary', className)}>
      Delegada por {capitalizar(nome(t.delegadorId))} para {capitalizar(nome(t.responsavelId))}
      {t.criadorId && t.criadorId !== t.delegadorId && ` · criada por ${nome(t.criadorId)}`}
    </span>
  )
}

export function EscolherPessoa({ aberta, aoFechar, t, aoEscolher }) {
  const { estado } = useProto()
  if (!aberta) return null
  return (
    <Folha aberta aoFechar={aoFechar} titulo="Delegar" subtitulo={t.titulo} largura="max-w-[420px]">
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        A tarefa continua sendo esta — muda quem responde por ela. Você continua
        vendo o andamento real, não uma cópia.
      </p>
      <div className="space-y-1.5">
        {(estado.pessoas || []).map((p) => {
          const atual = p.id === t.responsavelId
          return (
            <button
              key={p.id}
              type="button"
              disabled={atual}
              onClick={() => aoEscolher(p.id)}
              className={cx(
                'press flex w-full items-center gap-3 rounded-row border px-4 py-3 text-left text-[14.5px] transition',
                atual ? 'border-hairline bg-surface-2 text-muted' : 'border-hairline hover:border-accent hover:text-accent-text',
              )}
            >
              <Pessoa id={p.id} />
              <span className="flex-1">{p.eu ? 'Você' : p.nome}</span>
              {atual && <span className="px-motivo">responsável atual</span>}
            </button>
          )
        })}
      </div>
    </Folha>
  )
}

export { EU }
