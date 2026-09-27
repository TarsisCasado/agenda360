import { agendaDoDia, planejadasDoDia, conflitosDoDia } from './reducer'
import { ESTADO, EU, inicioDaSemana, somarDias, iso, emMinutos } from '../mock/dados'

// ---------------------------------------------------------------------------
// AS REGRAS DA AGENDA NO TELEFONE (UX-M3) — fora da interface, para poderem
// ser testadas.
//
// As tres visoes aprovadas respondem perguntas diferentes, e e isso que decide
// o que cada uma deriva:
//
//   DIA     "o que acontece hoje e quando?"      -> uma linha do tempo
//   SEMANA  "como meu tempo esta distribuido?"   -> posicao espacial
//   MES     "onde ha atividade, e o que tem nesse dia?" -> densidade + detalhe
//
// Nenhuma delas inventa dado: todas leem os mesmos seletores que o resto do
// prototipo ja usava. O que fazem e POSICIONAR, AGRUPAR e CLASSIFICAR.
// ---------------------------------------------------------------------------

export const VISOES = ['dia', 'semana', 'mes']

// A grade cobre o expediente com folga. Fora disso, a faixa se estica sozinha
// para caber o que existir — ninguem deve descobrir que tem um compromisso as
// 06:30 rolando para cima e nao achando nada.
export const HORA_PADRAO_INICIO = 7
export const HORA_PADRAO_FIM = 20

export const semanaDe = (data) => {
  const seg = inicioDaSemana(new Date(`${data}T12:00:00`))
  return Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))
}

// ---------------------------------------------------------------------------
// COR E ICONE — classificacao VISUAL, nunca ranking.
//
// A referencia aprovada usa cores para separar OBJETOS, e nao para dizer que
// um vale mais que o outro. Aqui a cor sai de dois fatos que ja existem no
// dado: a ESPECIE (compromisso ou horario reservado) e a CATEGORIA.
//
// O mapa e fechado e deterministico — a mesma categoria tem sempre a mesma
// cor, em todas as visoes e nos dois temas. Categoria desconhecida cai em
// "cinza" em vez de ganhar uma cor nova por sorteio, porque uma cor que muda
// de significado e pior do que nenhuma cor.
//
// Isto e vocabulario de PROTOTIPO: nao existe "cor da categoria" no banco, e
// nada aqui cria significado de negocio novo.
// ---------------------------------------------------------------------------
export const CORES = {
  Operação: 'violeta',
  Comercial: 'azul',
  Financeiro: 'ciano',
  Diretoria: 'rosa',
  Pessoal: 'verde',
}
export const COR_RESERVA = 'ambar'
export const COR_PADRAO = 'cinza'

export function corDoEvento(e) {
  if (e?.especie === 'reserva') return COR_RESERVA
  return CORES[e?.categoria] || COR_PADRAO
}

// ---------------------------------------------------------------------------
// O QUE UM EVENTO E AGORA.
//
// A referencia mostra a etiqueta "Agora" no compromisso das 09:00 com o
// relogio em 08:40 — e uma reuniao que ainda nao comecou nao esta acontecendo.
// A forma (etiqueta no canto direito da linha) fica; o texto passa a dizer a
// verdade: "em 20 min" antes, "agora" durante, nada depois.
// ---------------------------------------------------------------------------
export function situacaoDoEvento(e, agora) {
  if (!e?.inicio || !e?.fim) return null
  if (e.inicio <= agora && e.fim > agora) return { tipo: 'agora', texto: 'Agora' }
  const faltam = emMinutos(e.inicio) - emMinutos(agora)
  if (faltam > 0 && faltam <= 90) return { tipo: 'proximo', texto: `em ${faltam} min` }
  return null
}

// ---------------------------------------------------------------------------
// SEM HORARIO — o que foi escolhido para o dia e nao tem hora marcada.
//
// Nao e "sem data": tem dia, falta hora. A secao existe porque um item sem
// hora nao tem lugar numa linha do tempo, e enfia-lo numa posicao inventada
// seria mentir sobre quando ele acontece.
// ---------------------------------------------------------------------------
export function semHorario(estado, data) {
  return planejadasDoDia(estado, data).filter(
    (t) => t.estado !== ESTADO.FEITO && (t.responsavelId || EU) === EU,
  )
}

export function eventosDoDia(estado, data) {
  return agendaDoDia(estado, data)
}

export function temConflito(estado, data) {
  return conflitosDoDia(estado, data).length > 0
}

// ---------------------------------------------------------------------------
// A FAIXA DE HORAS de um conjunto de dias. Comeca no padrao e se abre o
// quanto o dado exigir, sempre em horas inteiras.
// ---------------------------------------------------------------------------
export function faixaDeHoras(estado, dias) {
  let inicio = HORA_PADRAO_INICIO
  let fim = HORA_PADRAO_FIM
  for (const d of dias) {
    for (const e of agendaDoDia(estado, d)) {
      inicio = Math.min(inicio, Math.floor(emMinutos(e.inicio) / 60))
      fim = Math.max(fim, Math.ceil(emMinutos(e.fim) / 60))
    }
  }
  return { inicio, fim }
}

// ---------------------------------------------------------------------------
// SOBREPOSICAO — dois compromissos no mesmo horario dividem a largura.
//
// Sem isto o segundo bloco cobre o primeiro, e a grade passa a esconder
// justamente o caso que ela existe para revelar: a quinta tem a diretoria das
// 10:00 as 12:00 e a auditoria das 11:30 as 12:30, e quem olha precisa VER que
// elas se encavalam, nao descobrir depois.
//
// O agrupamento e o classico: eventos em ordem de inicio, um grupo se fecha
// quando comeca um evento depois do fim de todos os anteriores. Dentro do
// grupo, cada um ganha uma coluna livre.
// ---------------------------------------------------------------------------
export function disposicaoDoDia(estado, data) {
  const eventos = [...agendaDoDia(estado, data)].sort(
    (a, b) => emMinutos(a.inicio) - emMinutos(b.inicio) || emMinutos(a.fim) - emMinutos(b.fim),
  )
  const saida = []
  let grupo = []
  let fimDoGrupo = -1

  const fecharGrupo = () => {
    const colunas = grupo.reduce((max, x) => Math.max(max, x.coluna + 1), 0)
    for (const x of grupo) saida.push({ ...x, colunas })
    grupo = []
    fimDoGrupo = -1
  }

  for (const e of eventos) {
    if (grupo.length && emMinutos(e.inicio) >= fimDoGrupo) fecharGrupo()
    const ocupadas = new Set(
      grupo.filter((x) => emMinutos(x.evento.fim) > emMinutos(e.inicio)).map((x) => x.coluna),
    )
    let coluna = 0
    while (ocupadas.has(coluna)) coluna += 1
    grupo.push({ evento: e, coluna })
    fimDoGrupo = Math.max(fimDoGrupo, emMinutos(e.fim))
  }
  if (grupo.length) fecharGrupo()
  return saida
}

// Posicao de um bloco dentro da grade, em pixels. A altura MINIMA existe para
// um compromisso de 30 min continuar tocavel e legivel; acima dela, altura e
// duracao — que e o que faz a grade mostrar "esta tarde esta livre".
export function posicaoNaGrade(e, { inicio, px, alturaMinima = 26 }) {
  const topo = ((emMinutos(e.inicio) - inicio * 60) / 60) * px
  const altura = Math.max(alturaMinima, ((emMinutos(e.fim) - emMinutos(e.inicio)) / 60) * px)
  return { topo, altura }
}

// ---------------------------------------------------------------------------
// O MES — 6 semanas a partir de DOMINGO, como na referencia aprovada.
//
// A celula NAO carrega titulo nenhum: o mes serve para orientacao, e quem
// responde "o que tem nesse dia" e a agenda que aparece ABAIXO do calendario
// quando um dia e escolhido. Cada celula leva so o que o olho usa para varrer:
// as cores presentes naquele dia, no maximo tres.
// ---------------------------------------------------------------------------
export const MAX_PONTOS = 3

export function gradeDoMes(estado, ano, mes) {
  const primeiro = new Date(ano, mes, 1)
  // Domingo da semana em que cai o dia 1.
  const inicio = somarDias(primeiro, -primeiro.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const data = iso(somarDias(inicio, i))
    const d = new Date(`${data}T12:00:00`)
    const eventos = agendaDoDia(estado, data)
    const soltas = semHorario(estado, data)
    const cores = []
    for (const e of eventos) {
      const c = corDoEvento(e)
      if (!cores.includes(c)) cores.push(c)
    }
    if (soltas.length && !cores.includes(COR_PADRAO)) cores.push(COR_PADRAO)
    return {
      data,
      dia: d.getDate(),
      doMes: d.getMonth() === mes,
      total: eventos.length + soltas.length,
      compromissos: eventos.length,
      pontos: cores.slice(0, MAX_PONTOS),
    }
  })
}
