import { useMemo, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { toISODate, formatLong } from '../../lib/date'
import {
  conclusaoDaSemana, variacaoSemanal, porDiaDaSemana,
  remarcacoes, delegacao, porCategoria,
} from '../../lib/relatorios'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// RELATORIOS NO TELEFONE (UX1.6 / Mobile 2.0).
//
// O QA humano disse que os graficos pareciam simples demais. Eram — mas o
// problema nao era falta de graficos: eram CINCO listas de barras com o mesmo
// desenho, cada uma dentro do seu card, respondendo perguntas parecidas. Mais
// graficos daquele tipo deixariam a tela mais cheia e igualmente muda.
//
// Entao aqui sao POUCOS e cada um responde UMA pergunta:
//
//   quanto do que planejei eu fiz?     -> numero-manchete + comparacao
//   como isso se distribuiu na semana? -> serie temporal de 7 dias
//   em que isso se concentra?          -> magnitude por categoria
//   o que nao para de mudar de dia?    -> remarcacoes
//
// -------------------- DECISOES DE DESENHO ----------------------------------
//
// UMA ESCALA, UMA COR. "Concluido" nao e uma segunda serie competindo com
// "planejado": e a PARTE preenchida dele. Duas cores fortes lado a lado
// exigiriam uma legenda para explicar o obvio e dobrariam a tinta na tela.
//
// A COR DA CATEGORIA E DA CATEGORIA. A barra usa a cor da propria categoria,
// nunca uma cor por posicao no ranking — filtrar a lista nao pode repintar
// quem sobrou.
//
// SEM CAIXA GIGANTE COM GRAFICO PEQUENO DENTRO. Os blocos nao tem fundo nem
// borda: separam-se por rotulo e por espaco. Era exatamente o "grafico
// minusculo dentro de card enorme" que fazia a tela parecer administrativa.
//
// TOM DEPENDE DO TEMA, e nao daqui: tudo desenha com `currentColor` e com os
// tokens (`text-accent`, `bg-surface-2`), que ja tem passo proprio no escuro.
// Nenhum hex fixo — no escuro um hex claro viraria uma mancha.
// ---------------------------------------------------------------------------

function Bloco({ titulo, contexto, children }) {
  return (
    <section className="px-2">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-section">{titulo}</h2>
        {contexto && <span className="text-caption shrink-0">{contexto}</span>}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// O NUMERO-MANCHETE. Quando a resposta e UM numero, um grafico so atrapalha:
// a forma certa e o proprio numero, grande, com a evidencia embaixo.
// ---------------------------------------------------------------------------
function Manchete({ c, v }) {
  const Icone = !v ? null : v.delta > 0 ? ArrowUpRight : v.delta < 0 ? ArrowDownRight : Minus
  return (
    <div data-testid="rel-manchete">
      <div className="flex items-end gap-3">
        <span className="text-[44px] font-bold leading-[0.95] tracking-[-0.03em] tabular-nums text-primary">
          {c.pct}%
        </span>
        {v && (
          <span
            className={cx(
              'mb-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold tabular-nums',
              v.delta > 0 ? 'text-positive' : v.delta < 0 ? 'text-danger' : 'text-muted',
            )}
          >
            <Icone size={14} />
            {v.delta > 0 ? '+' : ''}{v.delta} pts
          </span>
        )}
      </div>
      <p className="text-body mt-1.5">
        {c.concluido} de {c.planejado} {c.planejado === 1 ? 'concluída' : 'concluídas'}
        {v && <span className="text-muted"> · semana passada {v.anterior}%</span>}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A SEMANA. Sete colunas: o trilho e o planejado, o preenchimento e o
// concluido. Tocar num dia da o numero daquele dia — e a camada de interacao
// que um grafico de toque precisa ter, no lugar do tooltip do mouse.
//
// Rotulo direto SO no maior dia: um numero em cima de cada barra e ruido, e
// sete numerinhos de 10px nao sao legiveis em 390px de qualquer forma.
// ---------------------------------------------------------------------------
function Semana({ dias, hojeISO }) {
  const [sel, setSel] = useState(null)
  const max = Math.max(1, ...dias.map((d) => d.planejado))
  const ALTURA = 116
  const escolhido = dias.find((d) => d.iso === sel)

  return (
    <div data-testid="rel-semana">
      <div className="flex items-end gap-1.5" style={{ height: ALTURA }}>
        {dias.map((d) => {
          const hTrilho = d.planejado === 0 ? 3 : Math.max(8, (d.planejado / max) * ALTURA)
          const hFeito = d.planejado === 0 ? 0 : (d.concluido / max) * ALTURA
          const hoje = d.iso === hojeISO
          const ativo = d.iso === sel
          return (
            <button
              key={d.iso}
              data-testid={`rel-dia-${d.rotulo}`}
              aria-label={`${d.rotulo}: ${d.concluido} de ${d.planejado}`}
              onClick={() => setSel((x) => (x === d.iso ? null : d.iso))}
              className="group relative flex flex-1 flex-col justify-end"
              style={{ height: ALTURA }}
            >
              {/* O maior dia ganha o numero; os outros ficam limpos. */}
              {d.planejado === max && d.planejado > 0 && (
                <span
                  className="absolute inset-x-0 text-center text-[11px] font-semibold tabular-nums text-muted"
                  style={{ bottom: hTrilho + 4 }}
                >
                  {d.planejado}
                </span>
              )}
              <span
                className={cx(
                  'relative w-full overflow-hidden rounded-[5px] transition-colors',
                  ativo ? 'bg-surface-3' : 'bg-surface-2',
                  // HOJE marcado no proprio trilho, e nao so no rotulo: quem le
                  // o grafico olha as barras, nao a linha de baixo.
                  hoje && !ativo && 'ring-1 ring-inset ring-accent/40',
                )}
                style={{ height: hTrilho }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 rounded-[5px] bg-accent"
                  style={{ height: hFeito }}
                />
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {dias.map((d) => (
          <span
            key={d.iso}
            className={cx(
              'flex-1 text-center text-[11px] font-medium',
              d.iso === hojeISO ? 'font-bold text-accent-text' : 'text-muted',
            )}
          >
            {d.rotulo}
          </span>
        ))}
      </div>

      {/* Legenda minima + leitura do dia tocado, no MESMO lugar: a linha nao
          muda de altura ao selecionar, entao o grafico nao pula. */}
      <p className="text-caption mt-2.5 min-h-[18px]" aria-live="polite">
        {escolhido ? (
          <span className="text-secondary">
            {escolhido.rotulo} · {escolhido.concluido} de {escolhido.planejado}{' '}
            {escolhido.planejado === 1 ? 'concluída' : 'concluídas'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-accent" />
            concluído
            {/* O trilho e quase da cor do canvas: sem o anel, a amostra da
                legenda sumia justamente no tema claro. */}
            <span className="ml-2 h-2 w-2 rounded-[2px] bg-surface-2 ring-1 ring-hairline" />
            planejado
          </span>
        )}
      </p>
    </div>
  )
}

function Barras({ itens, vazio }) {
  if (!itens.length) return <p className="text-caption">{vazio}</p>
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <div className="space-y-2.5" data-testid="rel-barras">
      {itens.map((i) => (
        <div key={i.id ?? i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[14px] text-primary">
              <span
                className={cx('h-2 w-2 shrink-0 rounded-full', !i.cor && 'bg-surface-3')}
                style={i.cor ? { backgroundColor: i.cor } : undefined}
              />
              <span className="truncate">{i.rotulo}</span>
            </span>
            <span className="text-caption shrink-0 tabular-nums">{i.valor}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${(i.valor / max) * 100}%`,
                backgroundColor: i.cor || 'rgb(var(--c-accent))',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RelatoriosMobile({ tasks }) {
  const { categoryById } = useData()
  const hojeISO = toISODate(new Date())

  const dados = useMemo(() => ({
    conclusao: conclusaoDaSemana(tasks, hojeISO),
    variacao: variacaoSemanal(tasks, hojeISO),
    semana: porDiaDaSemana(tasks, hojeISO),
    categorias: porCategoria(tasks, categoryById),
    remarcadas: remarcacoes(tasks),
    delegadas: delegacao(tasks),
  }), [tasks, hojeISO, categoryById])

  const { conclusao, variacao, semana, categorias, remarcadas, delegadas } = dados

  return (
    <div className="space-y-8" data-testid="relatorios-mobile">
      <Bloco titulo="Conclusão da semana" contexto={formatLong(hojeISO).split(',')[0]}>
        <Manchete c={conclusao} v={variacao} />
      </Bloco>

      <Bloco titulo="Planejado × concluído" contexto="esta semana">
        <Semana dias={semana} hojeISO={hojeISO} />
      </Bloco>

      <Bloco titulo="Onde se concentra">
        <Barras itens={categorias} vazio="Sem atividades para agrupar." />
      </Bloco>

      <Bloco
        titulo="Remarcações"
        contexto={remarcadas.total > 0 ? `${remarcadas.total} no total` : null}
      >
        {remarcadas.itens.length === 0 ? (
          <p className="text-caption">Nada mudou de dia.</p>
        ) : (
          <ul className="divide-hair divide-y" data-testid="rel-remarcacoes">
            {remarcadas.itens.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-[14px] text-primary">{i.titulo}</span>
                <span className="text-caption shrink-0 tabular-nums">
                  mudou de dia {i.vezes}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco titulo="Delegação">
        <div className="flex gap-6" data-testid="rel-delegacao">
          <div>
            <p className="text-[26px] font-bold leading-none tabular-nums text-primary">
              {delegadas.delegadas}
            </p>
            <p className="text-caption mt-1">com outra pessoa</p>
          </div>
          <div>
            <p className="text-[26px] font-bold leading-none tabular-nums text-primary">
              {delegadas.concluidas}
            </p>
            <p className="text-caption mt-1">já concluídas</p>
          </div>
        </div>
        {/* HONESTIDADE, e nao duas barras zeradas: "devolvida" e "bloqueada"
            nao existem no modelo. Zero desenhado pareceria "nenhuma", quando a
            verdade e "nao da para saber". */}
        <p className="text-caption mt-3">
          Devolvidas e bloqueadas ainda não são registradas pelo produto.
        </p>
      </Bloco>
    </div>
  )
}
