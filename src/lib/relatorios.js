import { STATUS } from './constants'
import { fromISODate, toISODate, addDays } from './date'

// ---------------------------------------------------------------------------
// RELATORIOS — a derivacao (UX1.6 / Mobile 2.0).
//
// RELATORIOS responde "o que aconteceu". Nao interpreta, nao aconselha e nao
// decide — isso seria Revisao, que e outra capacidade (e que ainda nao existe
// no produto). Aqui so ha contagem sobre o que esta no banco.
//
// -------------------- A REGRA QUE GOVERNA ESTE ARQUIVO ---------------------
//
// NAO INVENTAR DADO. Cada numero abaixo sai de uma coluna que existe:
// `status`, `date`, `reschedule_count`, `category_id`. Onde o modelo nao tem o
// dado, a funcao devolve `null` e a interface NAO desenha o grafico — um
// grafico com dado inventado e pior que um espaco vazio, porque o espaco vazio
// nao mente.
//
// Por isso "devolvida" e "bloqueada" nao aparecem em `delegacao()`: delegacao
// hoje e um unico `status`, sem retorno registrado. O que da para dizer com
// honestidade e quantas foram delegadas e quantas dessas ja terminaram.
// ---------------------------------------------------------------------------

const ABERTA_OU_FEITA = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.DONE, STATUS.RESCHEDULED, STATUS.MISSED]

// Segunda-feira da semana de `iso` (padrao brasileiro, igual ao Kanban).
export function segundaDa(iso) {
  const base = fromISODate(iso)
  if (!base) return null
  const dow = base.getDay()
  return addDays(base, dow === 0 ? -6 : 1 - dow)
}

export function diasDaSemana(iso) {
  const seg = segundaDa(iso)
  if (!seg) return []
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(seg, i)))
}

// ---------------------------------------------------------------------------
// CONCLUSAO DA SEMANA — o numero-manchete.
//
// "Planejado" e o que tinha data naquela semana e nao foi cancelado nem
// marcado como desnecessario: cancelar e uma decisao, nao um fracasso, e
// conta-la como meta perdida distorceria o numero para baixo sem motivo.
// ---------------------------------------------------------------------------
export function conclusaoDaSemana(tasks = [], iso = toISODate(new Date())) {
  const dias = new Set(diasDaSemana(iso))
  if (!dias.size) return null
  const planejadas = tasks.filter((t) => dias.has(t.date) && ABERTA_OU_FEITA.includes(t.status))
  const concluidas = planejadas.filter((t) => t.status === STATUS.DONE)
  return {
    planejado: planejadas.length,
    concluido: concluidas.length,
    pct: planejadas.length ? Math.round((concluidas.length / planejadas.length) * 100) : 0,
  }
}

// Comparacao com a semana anterior. Devolve null quando NAO ha o que comparar
// — a semana passada sem nenhuma atividade nao e "0%", e ausencia de dado.
export function variacaoSemanal(tasks = [], iso = toISODate(new Date())) {
  const atual = conclusaoDaSemana(tasks, iso)
  const seg = segundaDa(iso)
  if (!atual || !seg) return null
  const anterior = conclusaoDaSemana(tasks, toISODate(addDays(seg, -7)))
  if (!anterior || anterior.planejado === 0) return null
  return { atual: atual.pct, anterior: anterior.pct, delta: atual.pct - anterior.pct }
}

// ---------------------------------------------------------------------------
// PLANEJADO x CONCLUIDO POR DIA — a serie temporal da semana.
//
// UMA escala e UMA cor. "Concluido" nao e outra serie disputando o grafico: e
// a PARTE preenchida do que foi planejado. Duas cores fortes lado a lado
// obrigariam a legenda a explicar o obvio, e o briefing pediu legenda minima.
// ---------------------------------------------------------------------------
export function porDiaDaSemana(tasks = [], iso = toISODate(new Date())) {
  const rotulos = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  return diasDaSemana(iso).map((dia, i) => {
    const doDia = tasks.filter((t) => t.date === dia && ABERTA_OU_FEITA.includes(t.status))
    return {
      iso: dia,
      rotulo: rotulos[i],
      planejado: doDia.length,
      concluido: doDia.filter((t) => t.status === STATUS.DONE).length,
    }
  })
}

// ---------------------------------------------------------------------------
// REMARCACOES — tendencia, nao ranking de culpa.
//
// Devolve as atividades que mais mudaram de dia. A frase que a interface usa
// diz o que ACONTECEU ("mudou de dia 4 vezes") e nao o que isso significa
// sobre quem usa.
// ---------------------------------------------------------------------------
export function remarcacoes(tasks = [], { max = 4 } = {}) {
  const lista = tasks
    .filter((t) => (t.reschedule_count || 0) > 0)
    .map((t) => ({ id: t.id, titulo: t.title, vezes: t.reschedule_count }))
    .sort((a, b) => b.vezes - a.vezes)
  return { total: lista.reduce((n, x) => n + x.vezes, 0), itens: lista.slice(0, max) }
}

// ---------------------------------------------------------------------------
// DELEGACAO — so o que o modelo sustenta.
//
// O briefing pede criadas / concluidas / devolvidas / bloqueadas. As duas
// ultimas NAO EXISTEM: nao ha coluna, nao ha evento, nao ha retorno
// registrado. Devolvemos as duas que existem e um `naoSuportado` explicito,
// para a interface poder dizer a verdade em vez de desenhar duas barras zeradas
// que pareceriam "nenhuma devolvida" quando o certo e "nao sabemos".
// ---------------------------------------------------------------------------
export function delegacao(tasks = []) {
  const delegadas = tasks.filter((t) => t.status === STATUS.DELEGATED)
  const jaConcluidas = tasks.filter((t) => t.status === STATUS.DONE && t.delegated_by)
  return {
    delegadas: delegadas.length,
    concluidas: jaConcluidas.length,
    naoSuportado: ['devolvidas', 'bloqueadas'],
  }
}

// ---------------------------------------------------------------------------
// CATEGORIAS — magnitude por identidade. A cor vem da CATEGORIA (a entidade),
// nunca da posicao no ranking: filtrar a lista nao pode repintar quem sobrou.
// ---------------------------------------------------------------------------
export function porCategoria(tasks = [], corDe = () => null, { max = 5 } = {}) {
  const conta = new Map()
  for (const t of tasks) {
    if (!ABERTA_OU_FEITA.includes(t.status)) continue
    const chave = t.category_id || '__sem__'
    const atual = conta.get(chave) || { id: chave, valor: 0 }
    atual.valor += 1
    conta.set(chave, atual)
  }
  return [...conta.values()]
    .map((c) => ({
      ...c,
      rotulo: c.id === '__sem__' ? 'Sem categoria' : corDe(c.id)?.name || 'Sem categoria',
      cor: c.id === '__sem__' ? null : corDe(c.id)?.color || null,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, max)
}
