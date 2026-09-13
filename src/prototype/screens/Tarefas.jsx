import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProto, useDesktop, useAcoes } from '../store/contexto'
import { ESTADO, rotuloDeData } from '../mock/dados'
import { Vazio, Chip, Marcar } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// TAREFAS — "o que preciso fazer e em que pe esta?"
//
// O Kanban continua, com os estados que sao mesmo estados:
//   A FAZER · EM ANDAMENTO · CONCLUIDO
//
// "Sem data" SAIU do quadro. Nunca foi um estado de execucao — e uma
// propriedade. Como coluna, ela obrigava a mentir: uma tarefa em andamento e
// sem data nao cabia em lugar nenhum. Agora ela e FILTRO, e a mesma tarefa
// pode ser "em andamento" e "sem data" ao mesmo tempo.
//
// Desktop mostra as tres colunas ao mesmo tempo; o telefone mostra uma coluna
// legivel por vez. E ha sempre a alternativa LISTA, que e como muita gente
// prefere ler.
// ---------------------------------------------------------------------------
const COLUNAS = [
  { estado: ESTADO.A_FAZER, titulo: 'A fazer' },
  { estado: ESTADO.FAZENDO, titulo: 'Em andamento' },
  { estado: ESTADO.FEITO, titulo: 'Concluído' },
]

const FILTROS = [
  { chave: 'todas', label: 'Todas' },
  { chave: 'sem-data', label: 'Sem data' },
  { chave: 'hoje', label: 'Para hoje' },
  { chave: 'alta', label: 'Prioridade alta' },
]

export default function Tarefas() {
  const { estado } = useProto()
  const desktop = useDesktop()
  const [visao, setVisao] = useState('quadro')
  const [filtro, setFiltro] = useState('todas')
  const [coluna, setColuna] = useState(ESTADO.A_FAZER)

  const filtrar = (lista) =>
    lista.filter((t) => {
      if (filtro === 'sem-data') return !t.planejadaPara && !t.prazo
      if (filtro === 'hoje') return t.paraHoje || t.planejadaPara === estado.hoje
      if (filtro === 'alta') return t.prioridade === 'alta'
      return true
    })

  const tarefas = filtrar(estado.tarefas)

  return (
    <div className="px-entra">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="px-secao">Tarefas</p>
          <h1 className="px-serif px-titulo mt-1.5">O que precisa sair</h1>
        </div>
        <div className="flex gap-1 rounded-control border border-hairline p-0.5">
          {['quadro', 'lista'].map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={cx(
                'press rounded-[7px] px-3 py-1.5 text-[13px] capitalize transition',
                visao === v ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {/* "Sem data" vive aqui — como propriedade, nao como coluna. */}
      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <Chip key={f.chave} on={filtro === f.chave} onClick={() => setFiltro(f.chave)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {visao === 'lista' ? (
        <Lista tarefas={tarefas} />
      ) : desktop ? (
        <div className="mt-7 grid grid-cols-3 gap-6">
          {COLUNAS.map((c) => (
            <Coluna key={c.estado} {...c} tarefas={tarefas.filter((t) => t.estado === c.estado)} />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-5 flex gap-1 rounded-control border border-hairline p-0.5">
            {COLUNAS.map((c) => (
              <button
                key={c.estado}
                onClick={() => setColuna(c.estado)}
                className={cx(
                  'press flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] transition',
                  coluna === c.estado ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted',
                )}
              >
                {c.titulo}
                <span className="ml-1 text-[11px] opacity-70">
                  {tarefas.filter((t) => t.estado === c.estado).length}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5">
            <Coluna
              {...COLUNAS.find((c) => c.estado === coluna)}
              semTitulo
              tarefas={tarefas.filter((t) => t.estado === coluna)}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Coluna({ titulo, estado: col, tarefas, semTitulo }) {
  return (
    <section>
      {!semTitulo && (
        <header className="mb-2 flex items-baseline gap-2">
          <h2 className="px-secao">{titulo}</h2>
          <span className="text-[11px] text-faint">{tarefas.length}</span>
        </header>
      )}
      {tarefas.length === 0 && <Vazio>Vazio.</Vazio>}
      <div className={cx(col === ESTADO.FEITO && 'opacity-60')}>
        {tarefas.map((t) => (
          <LinhaTarefa key={t.id} t={t} />
        ))}
      </div>
    </section>
  )
}

function Lista({ tarefas }) {
  const abertas = tarefas.filter((t) => t.estado !== ESTADO.FEITO)
  const feitas = tarefas.filter((t) => t.estado === ESTADO.FEITO)
  return (
    <div className="mt-6">
      {abertas.map((t) => <LinhaTarefa key={t.id} t={t} mostrarEstado />)}
      {feitas.length > 0 && (
        <>
          <h2 className="px-secao mt-8">Concluído</h2>
          <div className="opacity-60">
            {feitas.map((t) => <LinhaTarefa key={t.id} t={t} />)}
          </div>
        </>
      )}
    </div>
  )
}

export function LinhaTarefa({ t, mostrarEstado }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const feito = t.estado === ESTADO.FEITO
  const atrasada = t.prazo && t.prazo < estado.hoje && !feito

  return (
    <div className="px-linha px-toque items-start">
      <Marcar
        feito={feito}
        label={`Concluir ${t.titulo}`}
        onClick={() => acoes.mudarEstado(t.id, feito ? ESTADO.A_FAZER : ESTADO.FEITO)}
      />
      <div className="min-w-0 flex-1">
        <Link
          to={`/prototipo/tarefas/${t.id}`}
          className={cx('block text-[15px] leading-snug hover:underline', feito && 'line-through')}
        >
          {t.titulo}
        </Link>
        <p className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
          {mostrarEstado && t.estado === ESTADO.FAZENDO && (
            <span className="font-medium text-accent-text">em andamento</span>
          )}
          {t.reserva ? (
            <span>{rotuloDeData(t.reserva.data, estado.hoje)} · {t.reserva.inicio}–{t.reserva.fim}</span>
          ) : t.planejadaPara ? (
            <span>fazer {rotuloDeData(t.planejadaPara, estado.hoje)}</span>
          ) : (
            <span className="text-faint">sem data</span>
          )}
          {atrasada && <span className="text-warning">prazo {rotuloDeData(t.prazo, estado.hoje)}</span>}
          {t.contexto && <span>{t.contexto}</span>}
          {t.origemId && <span className="text-accent-text">tem origem</span>}
          {t.subtarefas.length > 0 && (
            <span>{t.subtarefas.filter((s) => s.feito).length}/{t.subtarefas.length} passos</span>
          )}
        </p>
      </div>
    </div>
  )
}
