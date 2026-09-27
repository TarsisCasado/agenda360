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

// ---------------------------------------------------------------------------
// O RECORTE DA SEMANA (UX-M3.1).
//
// A versao anterior punha os sete dias na grade ao mesmo tempo. Cabia — e
// custava caro: em 390px cada coluna ficava com ~43px e o texto dentro do
// bloco desceu a 9,5px para nao estourar. Passou no QA funcional e reprovou no
// unico teste que importa: ninguem reconhece um compromisso antes de tocar.
//
// A regra nova e o contrario: a REPRESENTACAO se adapta ao conteudo. A faixa
// de cima continua com os sete dias — e ela que responde "como e minha
// semana?" — e a grade passa a mostrar TRES, que e onde se le "o que acontece
// nestes dias?".
//
// O recorte sai da SELECAO, nunca de um estado paralelo: assim o dia tocado
// esta sempre visivel, e a mesma selecao produz sempre o mesmo recorte. O dia
// escolhido fica no meio; nas pontas da semana a janela encosta e para, em vez
// de mostrar dias de outra semana no meio desta.
//
//   SEG -> SEG TER QUA      QUI -> QUA QUI SEX
//   TER -> SEG TER QUA      SEX -> QUI SEX SAB
//   QUA -> TER QUA QUI      SAB -> SEX SAB DOM
//                           DOM -> SEX SAB DOM
// ---------------------------------------------------------------------------
export const DIAS_VISIVEIS = 3

export function recorteDaSemana(dias, dia) {
  const i = dias.indexOf(dia)
  if (i < 0) return dias.slice(0, DIAS_VISIVEIS)
  const ultimo = Math.max(0, dias.length - DIAS_VISIVEIS)
  const inicio = Math.min(Math.max(i - 1, 0), ultimo)
  return dias.slice(inicio, inicio + DIAS_VISIVEIS)
}

// ---------------------------------------------------------------------------
// ESCALA DA GRADE E CONTEUDO DO BLOCO.
//
// Com tres colunas a largura recuperada volta para a tipografia: titulo em
// 14.5px, apoio em 13px. Esses numeros sao PISO — quando o bloco e curto, o
// que encolhe e a quantidade de informacao, nunca a fonte. Um compromisso de
// meia hora mostra so o titulo; um de duas horas mostra titulo, horario e
// local. Reconhecer antes do toque vale mais do que exibir todos os metadados.
// ---------------------------------------------------------------------------
export const PX_HORA_SEMANA = 62
export const ALTURA_MINIMA_BLOCO = 30
export const FONTE_TITULO_BLOCO = 14.5
export const FONTE_APOIO_BLOCO = 13

export function detalheDoBloco(altura, colunas = 1) {
  const base =
    altura >= 82 ? { linhas: 2, horario: true, apoio: true }
      : altura >= 58 ? { linhas: 2, horario: true, apoio: false }
        : altura >= 40 ? { linhas: 1, horario: true, apoio: false }
          : { linhas: 1, horario: false, apoio: false }

  // Coluna inteira: cabe o intervalo ("09:00 – 10:00") e o local.
  if (colunas === 1) return { ...base, intervalo: base.horario }

  // Bloco DIVIDIDO por sobreposicao: a largura caiu pela metade. Quem cede e o
  // metadado, nao a fonte — some o local, o horario vira so o inicio, e a linha
  // liberada vai para o titulo, que e o que faz reconhecer antes do toque.
  return {
    linhas: base.linhas + (base.apoio ? 1 : 0),
    horario: base.horario,
    intervalo: false,
    apoio: false,
  }
}

// ---------------------------------------------------------------------------
// ANDAR COM O RECORTE — um passo, um dia, sempre.
//
// A janela desliza um dia e a selecao vai para o MEIO dela, porque o meio
// reproduz exatamente aquela janela em `recorteDaSemana` (o recorte continua
// saindo so da selecao). Quando a janela ja esta encostada na ponta da semana,
// o passo atravessa para a semana vizinha em vez de nao fazer nada: quem toca
// "proximos dias" tem que ver a grade andar.
// ---------------------------------------------------------------------------
export function andarNoRecorte(dias, dia, delta) {
  const recorte = recorteDaSemana(dias, dia)
  const inicio = dias.indexOf(recorte[0])
  const alvo = inicio + delta
  const ultimo = Math.max(0, dias.length - DIAS_VISIVEIS)
  if (alvo >= 0 && alvo <= ultimo) return dias[alvo + 1]
  const borda = delta > 0 ? recorte[recorte.length - 1] : recorte[0]
  return iso(somarDias(new Date(`${borda}T12:00:00`), delta))
}

// ---------------------------------------------------------------------------
// A LARGURA DE UM BLOCO QUANDO HA SOBREPOSICAO (UX-M3.1).
//
// UX-M3 dividia a coluna em partes iguais. Com sete colunas isso ja era
// apertado; com tres ficou pior de um jeito inesperado — a coluna de 101px
// virava 48px, e "Diretoria — resultado do trimestre" em 14.5px aparecia como
// "Dire — re…". Dividir ao meio deixou de revelar o conflito e passou a
// esconder os dois.
//
// A saida e a que todo calendario usa: os blocos se ESCALONAM em vez de se
// espremerem. Cada um recua um degrau e fica por cima do anterior; a tira
// exposta a esquerda (cor + barra) continua denunciando que existe algo
// embaixo, e cada bloco guarda ~72% da coluna, que e onde o titulo volta a ser
// lido. O recuo total tem teto para que tres ou mais conflitos nao derretam a
// largura de novo.
//
// O que se perde: o titulo do bloco de tras fica parcialmente coberto. E uma
// troca deliberada — legibilidade de quem esta na frente, sinal de conflito
// preservado, e o Dia (que nao escalona nada) mostra os dois por inteiro.
// ---------------------------------------------------------------------------
export const RECUO_SOBREPOSICAO = 28
export const RECUO_TOTAL_MAXIMO = 44

export function faixaDoBloco(coluna, colunas) {
  if (colunas <= 1) return { esquerda: 0, largura: 100 }
  const passo = Math.min(RECUO_SOBREPOSICAO, RECUO_TOTAL_MAXIMO / (colunas - 1))
  return { esquerda: coluna * passo, largura: 100 - passo * (colunas - 1) }
}
