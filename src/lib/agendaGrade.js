import { toISODate, fromISODate, addDays, getWeekDays } from './date'
import { toMinutes } from './agendaTime'

// ---------------------------------------------------------------------------
// A GEOMETRIA DA AGENDA NO TELEFONE (C2).
//
// Isto e a direcao aprovada em UX-M3/UX-M3.1 trazida para o PRODUTO REAL. As
// regras sao as mesmas, numero por numero; o que muda e de onde vem o dado.
//
// -------------------- POR QUE UM ARQUIVO PROPRIO ---------------------------
//
// As mesmas funcoes existem em `src/prototype/store/agendaM3.js`. Poderiam ser
// importadas de la — e nao sao, por uma razao de arquitetura:
//
//   o prototipo tem de continuar DESCARTAVEL. O comentario em App.jsx promete
//   que remove-lo e "apagar a pasta e estas duas linhas". No momento em que o
//   produto real importa de `src/prototype/`, essa promessa deixa de valer e
//   uma pasta de maquete passa a ser dependencia de producao.
//
// O custo dessa escolha e ~60 linhas de geometria repetidas em dois lugares, e
// o risco e a divergencia silenciosa. O risco esta coberto: `agendaGrade.test.js`
// compara, caso por caso, a saida daqui com a do prototipo. Se um dos dois
// mudar sozinho, o teste cai.
//
// O que NAO veio para ca: cor por nome de categoria, icone por categoria e a
// nocao de `especie: 'reserva'`. Aquilo e vocabulario do mock — a cor real sai
// de `categories.color`, que o banco ja guarda. Ver `lib/agendaReal.js`.
// ---------------------------------------------------------------------------

// A grade cobre o expediente com folga e se abre o quanto o dado exigir.
export const HORA_PADRAO_INICIO = 7
export const HORA_PADRAO_FIM = 20

// Escala e pisos tipograficos (UX-M3.1). Sao PISO: quando o bloco encolhe, o
// que cede e a quantidade de informacao — nunca o corpo da fonte.
export const PX_HORA_SEMANA = 62
export const ALTURA_MINIMA_BLOCO = 30
export const DIAS_VISIVEIS = 3

// A semana do produto comeca na SEGUNDA (`lib/date.js`), e e a mesma semana do
// Kanban. O recorte de tres dias anda dentro dela.
export function semanaDe(data) {
  return getWeekDays(fromISODate(data) || new Date()).map(toISODate)
}

// ---------------------------------------------------------------------------
// O RECORTE DA SEMANA. O dia escolhido fica no meio; nas pontas a janela
// encosta e para, em vez de mostrar dias de outra semana no meio desta.
//
//   SEG -> SEG TER QUA      QUI -> QUA QUI SEX
//   TER -> SEG TER QUA      SEX -> QUI SEX SAB
//   QUA -> TER QUA QUI      SAB -> SEX SAB DOM
//                           DOM -> SEX SAB DOM
// ---------------------------------------------------------------------------
export function recorteDaSemana(dias, dia) {
  const i = dias.indexOf(dia)
  if (i < 0) return dias.slice(0, DIAS_VISIVEIS)
  const ultimo = Math.max(0, dias.length - DIAS_VISIVEIS)
  const inicio = Math.min(Math.max(i - 1, 0), ultimo)
  return dias.slice(inicio, inicio + DIAS_VISIVEIS)
}

// Um passo, um dia. A selecao vai para o MEIO da janela nova, porque o meio
// reproduz exatamente aquela janela em `recorteDaSemana`. Na ponta da semana o
// passo atravessa para a semana vizinha: quem toca "proximos dias" tem de ver
// a grade andar.
export function andarNoRecorte(dias, dia, delta) {
  const recorte = recorteDaSemana(dias, dia)
  const inicio = dias.indexOf(recorte[0])
  const alvo = inicio + delta
  const ultimo = Math.max(0, dias.length - DIAS_VISIVEIS)
  if (alvo >= 0 && alvo <= ultimo) return dias[alvo + 1]
  const borda = delta > 0 ? recorte[recorte.length - 1] : recorte[0]
  return toISODate(addDays(fromISODate(borda), delta))
}

// ---------------------------------------------------------------------------
// O QUE CABE NUM BLOCO. Um compromisso de meia hora mostra so o titulo; um de
// duas horas mostra titulo, horario e local.
// ---------------------------------------------------------------------------
export function detalheDoBloco(altura, colunas = 1) {
  const base =
    altura >= 82 ? { linhas: 2, horario: true, apoio: true }
      : altura >= 58 ? { linhas: 2, horario: true, apoio: false }
        : altura >= 40 ? { linhas: 1, horario: true, apoio: false }
          : { linhas: 1, horario: false, apoio: false }

  if (colunas === 1) return { ...base, intervalo: base.horario }

  // Bloco escalonado por sobreposicao: some o local, o horario vira so o
  // inicio, e a linha liberada vai para o titulo.
  return {
    linhas: base.linhas + (base.apoio ? 1 : 0),
    horario: base.horario,
    intervalo: false,
    apoio: false,
  }
}

// ---------------------------------------------------------------------------
// A LARGURA DE UM BLOCO QUANDO HA SOBREPOSICAO.
//
// Dividir a coluna em partes iguais foi tentado e reprovado: 101px viravam
// 48px e o titulo aparecia como "Dire — re…". Os blocos ESCALONAM — cada um
// recua um degrau e fica por cima do anterior, guardando ~72% da coluna. A
// tira exposta a esquerda continua denunciando que ha algo embaixo.
// ---------------------------------------------------------------------------
export const RECUO_SOBREPOSICAO = 28
export const RECUO_TOTAL_MAXIMO = 44

export function faixaDoBloco(coluna, colunas) {
  if (colunas <= 1) return { esquerda: 0, largura: 100 }
  const passo = Math.min(RECUO_SOBREPOSICAO, RECUO_TOTAL_MAXIMO / (colunas - 1))
  return { esquerda: coluna * passo, largura: 100 - passo * (colunas - 1) }
}

// Posicao de um bloco na grade, em pixels. Acima do piso, altura E duracao —
// e isso que faz a grade mostrar "esta tarde esta livre".
export function posicaoNaGrade(e, { inicio, px, alturaMinima = ALTURA_MINIMA_BLOCO }) {
  const topo = ((toMinutes(e.inicio) - inicio * 60) / 60) * px
  const altura = Math.max(alturaMinima, ((toMinutes(e.fim) - toMinutes(e.inicio)) / 60) * px)
  return { topo, altura }
}

// ---------------------------------------------------------------------------
// SOBREPOSICAO — o agrupamento classico. Eventos em ordem de inicio; um grupo
// se fecha quando comeca um evento depois do fim de todos os anteriores.
// Dentro do grupo, cada um ganha uma coluna livre.
//
// Sem isto o segundo bloco cobre o primeiro, e a grade passa a esconder
// justamente o caso que ela existe para revelar.
// ---------------------------------------------------------------------------
export function disporDia(eventos = []) {
  const ordenados = [...eventos].sort(
    (a, b) => toMinutes(a.inicio) - toMinutes(b.inicio) || toMinutes(a.fim) - toMinutes(b.fim),
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

  for (const e of ordenados) {
    if (grupo.length && toMinutes(e.inicio) >= fimDoGrupo) fecharGrupo()
    const ocupadas = new Set(
      grupo.filter((x) => toMinutes(x.evento.fim) > toMinutes(e.inicio)).map((x) => x.coluna),
    )
    let coluna = 0
    while (ocupadas.has(coluna)) coluna += 1
    grupo.push({ evento: e, coluna })
    fimDoGrupo = Math.max(fimDoGrupo, toMinutes(e.fim))
  }
  if (grupo.length) fecharGrupo()
  return saida
}

// A faixa de horas de um conjunto de eventos. Comeca no padrao e se abre em
// horas inteiras — ninguem deve descobrir um compromisso das 06:30 rolando
// para cima e nao achando nada.
export function faixaDeHoras(eventos = []) {
  let inicio = HORA_PADRAO_INICIO
  let fim = HORA_PADRAO_FIM
  for (const e of eventos) {
    inicio = Math.min(inicio, Math.floor(toMinutes(e.inicio) / 60))
    fim = Math.max(fim, Math.ceil(toMinutes(e.fim) / 60))
  }
  return { inicio, fim }
}

// OS PARES QUE SE ENCAVALAM. O Dia avisa que ha sobreposicao, e a Semana a
// mostra escalonada — as duas leem isto. Pares, e nao um booleano, porque e
// assim que se pode dizer QUAIS depois sem recalcular.
export function conflitosDoDia(eventos = []) {
  const ordenados = [...eventos].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))
  const pares = []
  for (let i = 0; i < ordenados.length; i += 1) {
    for (let j = i + 1; j < ordenados.length; j += 1) {
      if (ordenados[j].inicio < ordenados[i].fim) pares.push([ordenados[i], ordenados[j]])
    }
  }
  return pares
}

export const temConflito = (eventos = []) => conflitosDoDia(eventos).length > 0
