import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { memoriaPorId } from '../store/reducer'
import { TIPO_MEMORIA, rotuloDeData } from '../mock/dados'
import { Secao, Botao, Chip } from '../parts/base'

// ---------------------------------------------------------------------------
// UMA MEMORIA ABERTA.
//
// A regra que esta tela existe para demonstrar: CRIAR UMA ACAO A PARTIR DE UMA
// MEMORIA NAO DESTROI A ORIGEM. A nota nao "vira" tarefa — ela GERA uma, e
// continua inteira no lugar. A tarefa criada aponta de volta, e o caminho de
// volta e navegavel nos dois sentidos.
//
// Um link guardado como referencia nao precisa gerar acao nenhuma. Guardar por
// guardar e um uso legitimo de um segundo cerebro.
// ---------------------------------------------------------------------------
export default function Nota() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()
  const m = memoriaPorId(estado, id)
  const [proposta, setProposta] = useState(null)

  if (!m) {
    return (
      <div className="px-entra">
        <p className="text-secondary">Item não encontrado.</p>
        <Link to="/prototipo/memoria" className="mt-3 inline-block text-accent-text">Voltar</Link>
      </div>
    )
  }

  const derivadas = estado.tarefas.filter((t) => t.origemId === m.id)

  return (
    <div className="px-entra">
      <button onClick={() => navegar(-1)} className="press -ml-1 mb-5 flex items-center gap-1.5 text-[13.5px] text-muted">
        <ArrowLeft size={16} /> Voltar
      </button>

      <p className="px-secao">
        {m.tipo === TIPO_MEMORIA.LINK ? 'Link' : m.tipo === TIPO_MEMORIA.IDEIA ? 'Ideia' : 'Nota'}
        {' · '}{rotuloDeData(m.criadoEm, estado.hoje)}
      </p>
      <h1 className="px-serif px-titulo mt-1.5">{m.titulo}</h1>

      <div className="mt-3 flex flex-wrap gap-2">
        {m.porOrganizar && <Chip>Por organizar</Chip>}
        {m.referencia && <Chip>Referência</Chip>}
      </div>

      {m.url && (
        <p className="mt-4 break-all text-[14px] text-accent-text">{m.url}</p>
      )}

      <div className="px-serif mt-5 whitespace-pre-line text-[16.5px] leading-[1.65] text-secondary">
        {m.texto}
      </div>

      {m.porOrganizar && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={() => acoes.organizarMemoria(m.id)}>
            Guardar como referência
          </Botao>
        </div>
      )}

      {/* Acao derivada — com confirmacao explicita e nome proprio. */}
      <Secao titulo="A partir desta nota">
        {derivadas.length > 0 && (
          <div className="mb-3">
            {derivadas.map((t) => (
              <Link key={t.id} to={`/prototipo/tarefas/${t.id}`} className="px-linha px-toque items-center">
                <span className="flex-1 text-[14.5px]">{t.titulo}</span>
                <span className="px-motivo">tarefa</span>
              </Link>
            ))}
          </div>
        )}

        {!proposta ? (
          <Botao
            variante="secundario"
            onClick={() =>
              setProposta({ titulo: sugerirTitulo(m.titulo) })
            }
          >
            <Sparkles size={15} /> Criar tarefa a partir desta nota
          </Botao>
        ) : (
          <div className="px-proposta px-entra p-4">
            <p className="px-secao">Tarefa</p>
            <input
              value={proposta.titulo}
              onChange={(e) => setProposta({ ...proposta, titulo: e.target.value })}
              className="px-serif mt-1.5 w-full bg-transparent text-[16.5px] font-semibold outline-none"
            />
            <p className="mt-2 text-[12.5px] text-faint">
              A nota continua onde está. A tarefa vai apontar de volta para ela.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
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
    </div>
  )
}

// A nota ja gerou uma acao antes ("Discutir padrão..."), e isso aparece na
// propria tela. A sugestao seguinte precisa ser OUTRA coisa — duas tarefas com
// o mesmo nome tornariam a historia confusa justamente onde ela quer ser clara:
// uma origem pode render varias acoes, e continua inteira depois de todas.
function sugerirTitulo(titulo) {
  if (/prepara/i.test(titulo)) return 'Montar o checklist de preparação com o pós-venda'
  return `Dar andamento: ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}`
}
