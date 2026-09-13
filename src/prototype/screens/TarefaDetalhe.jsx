import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, CornerUpLeft } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { tarefaPorId, memoriaPorId } from '../store/reducer'
import { ESTADO, rotuloDeData, somarDias, iso, nomeDoDia, diaCurto, numeroDoDia, inicioDaSemana } from '../mock/dados'
import { sugerirPassos, espera } from '../mock/ia'
import { Secao, Botao, Chip, Marcar } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// DETALHE DA TAREFA — onde moram as duas decisoes que o produto nao pode
// confundir:
//
//   FAZER EM TAL DIA   escolho o dia. Nao reserva hora nenhuma.
//   RESERVAR HORARIO   escolho um intervalo e o protejo na agenda.
//
// Sao coisas diferentes na cabeca de quem usa, entao sao controles diferentes
// na tela. Retirar o horario reservado nao conclui, nao exclui e nao tira o
// dia: para tirar o dia existe outro botao, dito com todas as letras.
//
// E, quando a tarefa nasceu de uma nota, a ORIGEM fica visivel e navegavel —
// e a nota continua la, inteira.
// ---------------------------------------------------------------------------
export default function TarefaDetalhe() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()
  const t = tarefaPorId(estado, id)
  const [sugestoes, setSugestoes] = useState(null)
  const [selecionadas, setSelecionadas] = useState([])
  const [pensando, setPensando] = useState(false)
  const [escolhendoHora, setEscolhendoHora] = useState(false)

  if (!t) {
    return (
      <div className="px-entra">
        <p className="text-secondary">Tarefa não encontrada.</p>
        <Link to="/prototipo/tarefas" className="mt-3 inline-block text-accent-text">Voltar</Link>
      </div>
    )
  }

  const origem = t.origemId ? memoriaPorId(estado, t.origemId) : null
  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))

  const pedirPassos = async () => {
    setPensando(true)
    await espera(650)
    const s = sugerirPassos(t.titulo)
    setSugestoes(s)
    setSelecionadas(s)   // vem tudo marcado, mas nada e aplicado sem confirmar
    setPensando(false)
  }

  const alternar = (p) =>
    setSelecionadas((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))

  return (
    <div className="px-entra">
      <button onClick={() => navegar(-1)} className="press -ml-1 mb-5 flex items-center gap-1.5 text-[13.5px] text-muted">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="flex items-start gap-3">
        <Marcar
          feito={t.estado === ESTADO.FEITO}
          label="Concluir"
          onClick={() => acoes.mudarEstado(t.id, t.estado === ESTADO.FEITO ? ESTADO.A_FAZER : ESTADO.FEITO)}
        />
        <h1 className={cx('px-serif px-titulo', t.estado === ESTADO.FEITO && 'line-through opacity-60')}>
          {t.titulo}
        </h1>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip on={t.estado === ESTADO.FAZENDO}
          onClick={() => acoes.mudarEstado(t.id, t.estado === ESTADO.FAZENDO ? ESTADO.A_FAZER : ESTADO.FAZENDO)}>
          {t.estado === ESTADO.FAZENDO ? 'Em andamento' : 'A fazer'}
        </Chip>
        {t.contexto && <Chip>{t.contexto}</Chip>}
        {t.prioridade === 'alta' && <Chip>Prioridade alta</Chip>}
        {!t.planejadaPara && !t.prazo && <Chip>Sem data</Chip>}
      </div>

      {/* ORIGEM — a nota que gerou esta tarefa continua existindo. */}
      {origem && (
        <Link
          to={`/prototipo/memoria/${origem.id}`}
          className="press mt-5 flex items-center gap-2.5 rounded-row border border-hairline bg-surface-2 px-4 py-3 transition hover:border-accent"
        >
          <CornerUpLeft size={16} className="flex-none text-accent-text" />
          <span className="min-w-0">
            <span className="px-secao block">Origem</span>
            <span className="mt-0.5 block truncate text-[14.5px]">{origem.titulo}</span>
          </span>
        </Link>
      )}

      {/* 1) O DIA -------------------------------------------------------- */}
      <Secao titulo="Quando fazer">
        <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
          Escolher o dia não reserva horário — é só o dia em que você pretende fazer.
        </p>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {dias.map((d) => (
            <button
              key={d}
              onClick={() => acoes.planejarPara(t.id, d)}
              className={cx(
                'press flex min-w-[52px] flex-col items-center gap-0.5 rounded-row border px-2 py-2 transition',
                t.planejadaPara === d
                  ? 'border-transparent bg-accent-soft font-semibold text-accent-text'
                  : 'border-hairline text-secondary hover:border-accent',
              )}
            >
              <span className="text-[10.5px] uppercase tracking-wider">{diaCurto(d)}</span>
              <span className="px-hora text-[15px]">{numeroDoDia(d)}</span>
            </button>
          ))}
        </div>
        {t.planejadaPara && (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 text-[13.5px] text-secondary">
            <span>Fazer {nomeDoDia(t.planejadaPara) === nomeDoDia(estado.hoje) && t.planejadaPara === estado.hoje ? 'hoje' : `na ${nomeDoDia(t.planejadaPara)}`}.</span>
            <button onClick={() => acoes.retirarPlanejamento(t.id)} className="press text-[13px] text-muted hover:text-accent-text">
              Tirar o dia
            </button>
          </p>
        )}
      </Secao>

      {/* 2) O HORARIO — decisao separada ---------------------------------- */}
      <Secao titulo="Horário reservado">
        {t.reserva ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[15px]">
              <span className="px-hora font-semibold">{t.reserva.inicio}–{t.reserva.fim}</span>
              <span className="text-secondary"> · {rotuloDeData(t.reserva.data, estado.hoje)}</span>
            </p>
            <button
              onClick={() => acoes.retirarReserva(t.id)}
              className="press text-[13px] text-muted hover:text-accent-text"
            >
              Retirar horário reservado
            </button>
            <p className="w-full text-[12.5px] text-faint">
              Retirar o horário não conclui nem apaga a tarefa — ela continua {t.estado === ESTADO.FAZENDO ? 'em andamento' : 'na lista'}.
            </p>
          </div>
        ) : escolhendoHora ? (
          <div className="flex flex-wrap items-center gap-2">
            {['09:00', '11:00', '14:00', '16:00'].map((h) => (
              <button
                key={h}
                onClick={() => { acoes.reservarHorario(t.id, t.planejadaPara || estado.hoje, h, maisUma(h)); setEscolhendoHora(false) }}
                className="press rounded-control border border-hairline px-3 py-1.5 text-[13.5px] hover:border-accent"
              >
                <span className="px-hora">{h}–{maisUma(h)}</span>
              </button>
            ))}
            <button onClick={() => setEscolhendoHora(false)} className="press text-[13px] text-muted">cancelar</button>
          </div>
        ) : (
          <div>
            <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
              Nenhum tempo protegido para esta tarefa.
            </p>
            <Botao variante="secundario" onClick={() => setEscolhendoHora(true)}>Reservar horário</Botao>
          </div>
        )}
      </Secao>

      {/* 3) IA CONTEXTUAL — propoe; aplica so o que for selecionado ------- */}
      <Secao titulo="Próximos passos">
        {t.subtarefas.length > 0 && (
          <div className="mb-3">
            {t.subtarefas.map((s) => (
              <div key={s.id} className="px-linha items-start">
                <Marcar feito={s.feito} label={s.titulo} onClick={() => acoes.alternarSubtarefa(t.id, s.id)} />
                <span className={cx('flex-1 text-[14.5px]', s.feito && 'line-through opacity-60')}>{s.titulo}</span>
              </div>
            ))}
          </div>
        )}

        {!sugestoes && (
          <Botao variante="secundario" onClick={pedirPassos} disabled={pensando}>
            <Sparkles size={15} /> {pensando ? 'Pensando…' : 'Sugerir próximos passos'}
          </Botao>
        )}

        {sugestoes && (
          <div className="px-proposta px-entra mt-1 p-4">
            <p className="text-[13.5px] text-secondary">
              Separei o que eu faria. Escolha o que serve — nada entra sem você confirmar.
            </p>
            <div className="mt-3">
              {sugestoes.map((p) => (
                <button
                  key={p}
                  onClick={() => alternar(p)}
                  className="px-linha w-full items-start text-left"
                >
                  <span className={cx(
                    'mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border',
                    selecionadas.includes(p) ? 'border-accent bg-accent text-white' : 'border-hairline',
                  )}>
                    {selecionadas.includes(p) && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 4.7 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  <span className="flex-1 text-[14.5px]">{p}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Botao
                variante="primario"
                disabled={!selecionadas.length}
                className={cx(!selecionadas.length && 'opacity-40')}
                onClick={() => { acoes.adicionarSubtarefas(t.id, selecionadas); setSugestoes(null) }}
              >
                Adicionar {selecionadas.length} {selecionadas.length === 1 ? 'passo' : 'passos'}
              </Botao>
              <Botao variante="fantasma" onClick={() => setSugestoes(null)}>Descartar sugestão</Botao>
            </div>
          </div>
        )}
      </Secao>
    </div>
  )
}

function maisUma(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
