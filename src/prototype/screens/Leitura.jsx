import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ExternalLink } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { memoriaPorId } from '../store/reducer'
import { TIPO_MEMORIA, rotuloDeData } from '../mock/dados'
import { Secao, Botao, Chip } from '../parts/base'
import { dominio } from '../parts/url'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// LER UMA MEMÓRIA — a mesma peça no painel lateral do desktop e na tela do
// telefone. O que muda é onde ela aparece, não o que ela faz.
//
// A regra que esta tela existe para demonstrar continua: CRIAR UMA AÇÃO A
// PARTIR DE UMA MEMÓRIA NÃO DESTRÓI A ORIGEM. A nota não "vira" tarefa — ela
// gera uma, e continua inteira. E guardar por guardar é uso legítimo: um link
// de referência não precisa gerar ação nenhuma.
// ---------------------------------------------------------------------------
export default function Leitura({ id, embutida }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const m = memoriaPorId(estado, id)
  const [proposta, setProposta] = useState(null)

  if (!m) return <p className="text-secondary">Item não encontrado.</p>

  const derivadas = estado.tarefas.filter((t) => t.origemId === m.id)

  return (
    <article className={embutida ? '' : 'px-entra'}>
      <p className="px-secao">
        {m.tipo === TIPO_MEMORIA.LINK ? 'Link' : m.tipo === TIPO_MEMORIA.IDEIA ? 'Ideia' : 'Nota'}
        {' · '}{rotuloDeData(m.criadoEm, estado.hoje)}
      </p>
      <h1 className="mt-1 text-[19px] font-semibold leading-snug">{m.titulo}</h1>

      {(m.porOrganizar || m.referencia) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {m.porOrganizar && <Chip>Por organizar</Chip>}
          {m.referencia && <Chip>Referência</Chip>}
        </div>
      )}

      {m.url && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] text-accent-text">
          <ExternalLink size={14} /> {dominio(m.url)}
        </p>
      )}

      <div className="mt-3.5 max-w-[68ch] whitespace-pre-line text-[14.5px] leading-[1.6] text-secondary">
        {m.texto}
      </div>

      {m.porOrganizar && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={() => acoes.organizarMemoria(m.id)}>
            Guardar como referência
          </Botao>
        </div>
      )}

      <Secao titulo={derivadas.length ? 'Relacionado' : 'A partir desta nota'}>
        {derivadas.length > 0 && (
          <div className="mb-2.5">
            {derivadas.map((t) => (
              <Link key={t.id} to={`/prototipo/tarefas/${t.id}`} className="px-linha px-toque items-center gap-2.5">
                <span className={cx('px-especie h-5 self-center', t.reserva ? 'px-reserva' : 'px-planejada')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{t.titulo}</span>
                  <span className="px-motivo mt-0.5 flex flex-wrap gap-x-2">
                    <span>{t.estado === 'fazendo' ? 'em andamento' : t.estado === 'feito' ? 'concluída' : 'a fazer'}</span>
                    {t.reserva ? (
                      <span className="text-accent-text">{rotuloDeData(t.reserva.data, estado.hoje)} {t.reserva.inicio}–{t.reserva.fim}</span>
                    ) : t.planejadaPara ? (
                      <span>{rotuloDeData(t.planejadaPara, estado.hoje)}</span>
                    ) : null}
                    {t.contexto && <span>{t.contexto}</span>}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {!proposta ? (
          <Botao variante="secundario" onClick={() => setProposta({ titulo: sugerirTitulo(m.titulo) })}>
            <Sparkles size={15} /> Criar tarefa a partir desta nota
          </Botao>
        ) : (
          <div className="px-proposta px-entra p-4">
            <p className="px-secao">Tarefa</p>
            <input
              value={proposta.titulo}
              onChange={(e) => setProposta({ ...proposta, titulo: e.target.value })}
              className="px-campo mt-1.5 font-medium"
            />
            <p className="mt-2 text-[12px] text-faint">
              A nota continua onde está. A tarefa vai apontar de volta para ela.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Botao
                variante="primario"
                onClick={() => {
                  acoes.criarTarefa({ titulo: proposta.titulo, origemId: m.id, contexto: 'Operação' })
                  setProposta(null)
                }}
              >
                Criar tarefa
              </Botao>
              <Botao variante="fantasma" onClick={() => setProposta(null)}>Agora não</Botao>
            </div>
          </div>
        )}
      </Secao>
    </article>
  )
}

// A nota já gerou uma ação antes, e isso aparece logo acima. A sugestão
// seguinte precisa ser OUTRA coisa: duas tarefas com o mesmo nome tornariam
// confusa justamente a ideia que se quer demonstrar — uma origem rende várias
// ações e continua inteira depois de todas.
function sugerirTitulo(titulo) {
  if (/prepara/i.test(titulo)) return 'Montar o checklist de preparação com o pós-venda'
  return `Dar andamento: ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}`
}
