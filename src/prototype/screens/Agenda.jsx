import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useProto, useDesktop } from '../store/contexto'
import { agendaDoDia, planejadasDoDia } from '../store/reducer'
import { inicioDaSemana, somarDias, iso, diaCurto, numeroDoDia, rotuloDeData, nomeDoDia } from '../mock/dados'
import { Secao, Vazio } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// AGENDA — "quando acontece, ou quando cabe?"
//
// Tres especies convivem aqui, e a tela precisa deixar claro que sao coisas
// diferentes:
//
//   COMPROMISSO         acontece naquele horario (barra cheia);
//   HORARIO RESERVADO   tempo que decidi proteger para executar uma tarefa
//                       (barra hachurada — e tempo meu, nao um encontro);
//   TAREFA PLANEJADA    quero fazer naquele DIA, sem hora (fio neutro, fora da
//                       linha do tempo, embaixo).
//
// Uma tarefa no calendario continua sendo a mesma tarefa: o bloco aponta para
// ela, e retirar o horario nao a apaga.
// ---------------------------------------------------------------------------
export default function Agenda() {
  const { estado } = useProto()
  const desktop = useDesktop()
  const [params] = useSearchParams()
  // Abrir a agenda "no dia daquilo que acabou de ser criado" e o que fecha o
  // ciclo da captura: quem confirmou um compromisso de amanha quer ver amanha.
  const diaPedido = params.get('dia')
  const [visao, setVisao] = useState(diaPedido ? 'dia' : desktop ? 'semana' : 'dia')
  const [dia, setDia] = useState(diaPedido || estado.hoje)

  // O pedido pode chegar com a tela JA montada (o aviso "Ver na agenda" e um
  // link para a mesma rota): sem isto, o dia so valeria na primeira abertura.
  useEffect(() => {
    if (diaPedido) { setDia(diaPedido); setVisao('dia') }
  }, [diaPedido])

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))

  return (
    <div className="px-entra">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="px-secao">Agenda</p>
          <h1 className="px-serif px-titulo mt-1.5">
            {visao === 'semana'
              ? `${numeroDoDia(dias[0])}–${numeroDoDia(dias[6])} de ${mesDe(dias[6])}`
              : capitalizar(nomeDoDia(dia))}
          </h1>
        </div>
        <div className="flex gap-1 rounded-control border border-hairline p-0.5">
          {['dia', 'semana', 'mês'].map((v) => (
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

      {/* Faixa da semana — no telefone e a bussola; no desktop, o cabecalho. */}
      <div className="no-scrollbar mt-5 flex gap-1 overflow-x-auto">
        {dias.map((d) => {
          const ativo = visao === 'semana' ? false : d === dia
          const hoje = d === estado.hoje
          const carga = agendaDoDia(estado, d).length + planejadasDoDia(estado, d).length
          return (
            <button
              key={d}
              onClick={() => { setDia(d); if (visao === 'semana') setVisao('dia') }}
              className={cx(
                'press flex min-w-[46px] flex-1 flex-col items-center gap-1 rounded-row py-2 transition',
                ativo ? 'bg-accent-soft' : 'hover:bg-surface-2',
              )}
            >
              <span className={cx('text-[10.5px] uppercase tracking-wider', ativo ? 'text-accent-text' : 'text-faint')}>
                {diaCurto(d)}
              </span>
              <span className={cx(
                'px-hora text-[15px]',
                ativo ? 'font-semibold text-accent-text' : hoje ? 'font-semibold text-primary' : 'text-secondary',
              )}>
                {numeroDoDia(d)}
              </span>
              <span className={cx('h-1 w-1 rounded-full', carga ? 'bg-accent/60' : 'bg-transparent')} />
            </button>
          )
        })}
      </div>

      {visao === 'semana' ? (
        <Semana dias={dias} onDia={(d) => { setDia(d); setVisao('dia') }} />
      ) : visao === 'mês' ? (
        <Mes onDia={(d) => { setDia(d); setVisao('dia') }} />
      ) : (
        <Dia data={dia} />
      )}

      <Link
        to="/prototipo/copiloto?contexto=semana"
        className="press mt-10 flex items-center justify-center gap-2 rounded-row border border-hairline py-3 text-[13.5px] font-semibold text-accent-text transition hover:bg-surface-2"
      >
        <Sparkles size={16} /> Planejar esta semana com o Copiloto
      </Link>
    </div>
  )
}

function Dia({ data }) {
  const { estado } = useProto()
  const eventos = agendaDoDia(estado, data)
  const planejadas = planejadasDoDia(estado, data)

  return (
    <>
      <Secao titulo={rotuloDeData(data, estado.hoje)}>
        {eventos.length === 0 && <Vazio>Nenhum horário ocupado neste dia.</Vazio>}
        {eventos.map((e) => (
          <Bloco key={e.id} evento={e} />
        ))}
      </Secao>

      {planejadas.length > 0 && (
        <Secao titulo="Para fazer neste dia">
          <p className="mb-2 text-[12.5px] leading-relaxed text-faint">
            Sem horário marcado — é o dia em que você decidiu fazer.
          </p>
          {planejadas.map((t) => (
            <Link key={t.id} to={`/prototipo/tarefas/${t.id}`} className="px-linha px-toque items-center">
              <span className="px-especie px-planejada self-stretch" />
              <span className="flex-1 text-[14.5px]">{t.titulo}</span>
              <span className="px-motivo">tarefa</span>
            </Link>
          ))}
        </Secao>
      )}
    </>
  )
}

function Bloco({ evento }) {
  const reserva = evento.especie === 'reserva'
  const conteudo = (
    <>
      <span className="px-hora w-[46px] flex-none pt-0.5 text-[13.5px] text-muted">{evento.inicio}</span>
      <span className={cx('px-especie self-stretch', reserva ? 'px-reserva' : 'px-compromisso')} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug">{evento.titulo}</span>
        <span className="px-motivo mt-0.5 block">
          {reserva ? 'Horário reservado' : 'Compromisso'} · {evento.inicio}–{evento.fim}
          {evento.local ? ` · ${evento.local}` : ''}
        </span>
      </span>
    </>
  )
  return reserva ? (
    <Link to={`/prototipo/tarefas/${evento.tarefaId}`} className="px-linha px-toque">{conteudo}</Link>
  ) : (
    <div className="px-linha">{conteudo}</div>
  )
}

function Semana({ dias, onDia }) {
  const { estado } = useProto()
  return (
    <div className="mt-6 grid gap-x-5 gap-y-6 lg:grid-cols-2">
      {dias.map((d) => {
        const eventos = agendaDoDia(estado, d)
        const planejadas = planejadasDoDia(estado, d)
        const vazio = !eventos.length && !planejadas.length
        return (
          <section key={d}>
            <button onClick={() => onDia(d)} className="press mb-1.5 flex items-baseline gap-2 text-left">
              <span className="px-secao">{diaCurto(d)} {numeroDoDia(d)}</span>
              {d === estado.hoje && <span className="px-chip px-chip-on">hoje</span>}
            </button>
            {vazio && <p className="py-2 text-[13px] text-faint">livre</p>}
            {eventos.map((e) => (
              <div key={e.id} className="flex items-baseline gap-2.5 py-1">
                <span className="px-hora w-[42px] flex-none text-[12.5px] text-muted">{e.inicio}</span>
                <span className={cx('px-especie h-3.5 self-center', e.especie === 'reserva' ? 'px-reserva' : 'px-compromisso')} />
                <span className="truncate text-[14px]">{e.titulo}</span>
              </div>
            ))}
            {planejadas.map((t) => (
              <div key={t.id} className="flex items-baseline gap-2.5 py-1">
                <span className="w-[42px] flex-none text-[12px] text-faint">—</span>
                <span className="px-especie px-planejada h-3.5 self-center" />
                <span className="truncate text-[14px] text-secondary">{t.titulo}</span>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

// O mes serve para orientacao e escolha de data — nao para ler conteudo.
function Mes({ onDia }) {
  const { estado } = useProto()
  const base = new Date(`${estado.hoje}T12:00:00`)
  const primeiro = new Date(base.getFullYear(), base.getMonth(), 1)
  const inicio = inicioDaSemana(primeiro)
  const celulas = Array.from({ length: 42 }, (_, i) => iso(somarDias(inicio, i)))
  const mesAtual = base.getMonth()

  return (
    <div className="mt-6">
      <div className="grid grid-cols-7 gap-1 text-center">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
          <span key={d} className="px-secao pb-1">{d}</span>
        ))}
        {celulas.map((d) => {
          const doMes = new Date(`${d}T12:00:00`).getMonth() === mesAtual
          const carga = agendaDoDia(estado, d).length + planejadasDoDia(estado, d).length
          return (
            <button
              key={d}
              onClick={() => onDia(d)}
              className={cx(
                'press aspect-square rounded-[10px] text-[13.5px] transition hover:bg-surface-2',
                !doMes && 'text-faint',
                d === estado.hoje && 'bg-accent-soft font-semibold text-accent-text',
              )}
            >
              <span className="px-hora">{numeroDoDia(d)}</span>
              <span className={cx('mx-auto mt-0.5 block h-1 w-1 rounded-full', carga && doMes ? 'bg-accent/60' : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesDe = (data) => MESES[new Date(`${data}T12:00:00`).getMonth()]
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)
