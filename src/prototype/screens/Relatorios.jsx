import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useProto, useDesktop } from '../store/contexto'
import { relatorio } from '../store/reducer'
import { inicioDaSemana, somarDias, iso, diaCurto, numeroDoDia, mesCurto, rotuloDeData, ESTADO } from '../mock/dados'
import { Secao, Chip, Vazio } from '../parts/base'
import { Segmentos, TituloDeTela } from '../parts/movel'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// RELATORIOS — a pergunta e "O QUE ACONTECEU?".
//
// Revisao e Relatorios nao sao a mesma tela com nomes diferentes: aqui e
// retrospectiva, la e o que merece atencao agora. Por isso este lugar pode ser
// quantitativo sem culpa — e o outro nao deve ser.
//
// Tres honestidades obrigatorias, porque numero mal-contado e pior que numero
// nenhum:
//
//   1. O PERIODO ANALISADO APARECE SEMPRE. "12 concluidas" sem periodo nao quer
//      dizer nada.
//   2. A TAXA DIZ DE ONDE SAIU. Nao ha "87% de conclusao" solto: ha
//      "8 de 15 atividades do periodo", e o denominador esta escrito.
//   3. DA PARA ABRIR O QUE COMPOE O NUMERO. Um indicador que nao se abre e um
//      indicador que nao se confere.
//
// E nada aqui infere estado de espirito de ninguem.
// ---------------------------------------------------------------------------
export default function Relatorios() {
  const { estado } = useProto()
  const desktop = useDesktop()
  const [periodo, setPeriodo] = useState('semana')
  const [aberto, setAberto] = useState(null) // 'concluidas' | 'abertas' | 'delegadas'

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const base = periodo === 'passada' ? somarDias(seg, -7) : seg
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(base, i)))
  const r = relatorio(estado, dias)

  const alternar = (chave) => setAberto((a) => (a === chave ? null : chave))
  const maiorDia = Math.max(1, ...r.porDia.map((d) => d.concluidas + d.compromissos))
  const maiorContexto = Math.max(1, ...r.porContexto.map(([, n]) => n))

  return (
    <div className="px-entra">
      {!desktop ? (
        <>
          <TituloDeTela titulo="Relatórios" detalhe="o que aconteceu" />
          <Segmentos
            className="mt-3"
            valor={periodo}
            aoEscolher={setPeriodo}
            opcoes={[
              { chave: 'semana', label: 'Esta semana' },
              { chave: 'passada', label: 'Semana passada' },
            ]}
          />
        </>
      ) : (
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="px-titulo-tela">Relatórios</h1>
          <p className="mt-1 text-[13px] text-muted">O que aconteceu</p>
        </div>
        <div className="flex gap-1.5">
          <Chip on={periodo === 'semana'} onClick={() => setPeriodo('semana')}>Esta semana</Chip>
          <Chip on={periodo === 'passada'} onClick={() => setPeriodo('passada')}>Semana passada</Chip>
        </div>
      </header>
      )}

      {/* O PERÍODO, sempre visível — é o que dá sentido a todo o resto. */}
      <p className="mt-3 rounded-row border border-hairline bg-surface-2 px-3.5 py-2 text-[12.5px] text-secondary">
        Período analisado:{' '}
        <strong className="px-hora font-semibold text-primary">
          {numeroDoDia(dias[0])} de {mesCurto(dias[0])} a {numeroDoDia(dias[6])} de {mesCurto(dias[6])}
        </strong>
        {periodo === 'semana' && ' · a semana ainda está correndo, então os números são parciais.'}
      </p>

      <div className={cx('mt-4 grid', desktop ? 'gap-3 sm:grid-cols-3' : 'grid-cols-1 gap-2')}>
        <Indicador
          rotulo="Concluídas"
          valor={r.concluidas.length}
          nota="atividades marcadas como concluídas no período"
          ativo={aberto === 'concluidas'}
          aoAbrir={() => alternar('concluidas')}
        />
        <Indicador
          rotulo="Ainda abertas"
          valor={r.abertas.length}
          nota="do mesmo conjunto de atividades do período"
          ativo={aberto === 'abertas'}
          aoAbrir={() => alternar('abertas')}
        />
        <Indicador
          rotulo="Com outra pessoa"
          valor={r.delegadas.length}
          nota="delegadas por você e ainda sob responsabilidade de alguém"
          ativo={aberto === 'delegadas'}
          aoAbrir={() => alternar('delegadas')}
        />
      </div>

      {/* A TAXA com denominador à vista. */}
      <div className="mt-3 rounded-row border border-hairline px-4 py-3">
        {r.taxa == null ? (
          <p className="text-[13.5px] text-muted">Sem atividades no período — não há taxa a calcular.</p>
        ) : (
          <>
            <p className="text-[14px]">
              <strong className="text-[19px] font-semibold">{r.taxa}%</strong>{' '}
              <span className="text-secondary">
                — {r.concluidas.length} de {r.consideradas.length} atividades do período foram concluídas.
              </span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${r.taxa}%` }} />
            </div>
            <p className="px-motivo mt-1.5">
              Conta as atividades com dia, prazo ou conclusão dentro do período. Atividades
              sem data nenhuma ficam de fora — entrariam no denominador sem nunca ter sido
              do período.
            </p>
          </>
        )}
      </div>

      {aberto && (
        <Secao titulo={`Registros · ${aberto}`}>
          <Registros
            lista={aberto === 'concluidas' ? r.concluidas : aberto === 'abertas' ? r.abertas : r.delegadas}
            hoje={estado.hoje}
            pessoas={estado.pessoas}
          />
        </Secao>
      )}

      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <section>
          <h2 className="px-secao mb-2">Distribuição pelos dias</h2>
          {r.porDia.map((d) => (
            <div key={d.data} className="px-linha items-center gap-3 py-1.5">
              <span className="px-hora w-[52px] flex-none text-[12.5px] text-muted">
                {diaCurto(d.data)} {numeroDoDia(d.data)}
              </span>
              <span className="flex h-2.5 flex-1 items-center gap-1">
                <span
                  className="h-2.5 rounded-[3px] bg-accent"
                  style={{ width: `${(d.concluidas / maiorDia) * 100}%` }}
                  aria-hidden="true"
                />
                <span
                  className="h-2.5 rounded-[3px] bg-accent/25"
                  style={{ width: `${(d.compromissos / maiorDia) * 100}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="px-motivo w-[118px] flex-none text-right">
                {d.concluidas} concl. · {d.compromissos} compr.
              </span>
            </div>
          ))}
          <p className="px-motivo mt-2 flex flex-wrap gap-x-3">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-accent" /> concluídas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-accent/25" /> compromissos</span>
          </p>
        </section>

        <section>
          <h2 className="px-secao mb-2">Por contexto</h2>
          {r.porContexto.length === 0 && <Vazio>Nada no período.</Vazio>}
          {r.porContexto.map(([nome, n]) => (
            <div key={nome} className="px-linha items-center gap-3 py-1.5">
              <span className="w-[92px] flex-none truncate text-[13px]">{nome}</span>
              <span className="flex-1">
                <span className="block h-2.5 rounded-[3px] bg-accent/60" style={{ width: `${(n / maiorContexto) * 100}%` }} aria-hidden="true" />
              </span>
              <span className="px-motivo w-8 flex-none text-right">{n}</span>
            </div>
          ))}

          <h2 className="px-secao mb-2 mt-6">O que passou por outras pessoas</h2>
          {r.concluidasPorOutros.length === 0 && r.delegadas.length === 0 ? (
            <Vazio>Nada delegado no período.</Vazio>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-secondary">
              {r.delegadas.length} {r.delegadas.length === 1 ? 'atividade está' : 'atividades estão'} sob
              responsabilidade de outra pessoa e {r.concluidasPorOutros.length}{' '}
              {r.concluidasPorOutros.length === 1 ? 'foi concluída' : 'foram concluídas'} por
              quem recebeu. É a mesma atividade acompanhada, não uma cópia.
            </p>
          )}
        </section>
      </div>

      <p className="mt-8 text-[12px] leading-relaxed text-faint">
        Os números vêm dos mesmos registros que aparecem em Hoje, Agenda, Tarefas
        e Memória. Não há um segundo conjunto de dados por trás desta tela.
      </p>
    </div>
  )
}

// No telefone o indicador é uma LINHA: número à esquerda, rótulo e explicação à
// direita. Três cartões quadrados empilhados eram três "cards dentro de card"
// ocupando o primeiro viewport inteiro para dizer três números.
function Indicador({ rotulo, valor, nota, ativo, aoAbrir }) {
  const desktop = useDesktop()
  if (!desktop) {
    return (
      <button
        type="button"
        onClick={aoAbrir}
        aria-expanded={ativo}
        className={cx(
          'press flex items-center gap-3 rounded-row border px-3.5 py-2.5 text-left transition',
          ativo ? 'border-accent bg-accent-soft/50' : 'border-hairline',
        )}
      >
        <span className="w-[42px] flex-none text-[22px] font-semibold leading-none">{valor}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium leading-snug">{rotulo}</span>
          <span className="px-motivo mt-0.5 block leading-snug">{nota}</span>
        </span>
        <ChevronRight size={15} className={cx('flex-none text-muted transition', ativo && 'rotate-90')} />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-expanded={ativo}
      className={cx(
        'press rounded-row border px-4 py-3 text-left transition',
        ativo ? 'border-accent bg-accent-soft/50' : 'border-hairline hover:border-accent',
      )}
    >
      <span className="px-secao block">{rotulo}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[24px] font-semibold leading-none">{valor}</span>
        <ChevronRight size={14} className={cx('text-muted transition', ativo && 'rotate-90')} />
      </span>
      <span className="px-motivo mt-1 block leading-snug">{nota}</span>
    </button>
  )
}

function Registros({ lista, hoje, pessoas }) {
  if (!lista.length) return <Vazio>Nenhum registro compõe este número.</Vazio>
  const nome = (id) => pessoas?.find((p) => p.id === id)?.nome
  return lista.map((t) => (
    <Link key={t.id} to={`/prototipo/tarefas/${t.id}`} className="px-linha px-toque items-center">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{t.titulo}</span>
        <span className="px-motivo mt-0.5 flex flex-wrap gap-x-2">
          <span>{t.estado === ESTADO.FEITO ? 'concluída' : t.estado === ESTADO.FAZENDO ? 'em andamento' : 'a fazer'}</span>
          {t.concluidaEm && <span>{rotuloDeData(t.concluidaEm, hoje)}</span>}
          {t.contexto && <span>{t.contexto}</span>}
          {t.responsavelId && t.responsavelId !== 'p-tarsis' && <span>com {nome(t.responsavelId)}</span>}
        </span>
      </span>
      <ChevronRight size={14} className="flex-none text-muted" />
    </Link>
  ))
}
