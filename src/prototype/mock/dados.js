// ---------------------------------------------------------------------------
// DADOS DO PROTOTIPO — uma historia so, nao sete demonstracoes.
//
// O que se quer avaliar aqui nao e cada tela isolada: e a CONTINUIDADE. Por
// isso os itens se referem uns aos outros. A nota sobre preparacao dos veiculos
// e a mesma que vira tarefa, que e planejada para terca, que recebe horario
// reservado e que continua apontando de volta para a nota. O compromisso criado
// na captura e o mesmo que aparece na Agenda.
//
// Datas sao RELATIVAS a "hoje" (injetavel nos testes), porque uma semana
// congelada em 2026 envelhece e passa a mentir sobre o produto.
//
// NADA aqui toca banco, servico ou rede. Sao objetos em memoria.
// ---------------------------------------------------------------------------

export const ESTADO = { A_FAZER: 'a_fazer', FAZENDO: 'fazendo', FEITO: 'feito' }
export const TIPO_MEMORIA = { NOTA: 'nota', IDEIA: 'ideia', LINK: 'link' }

// --- datas, sem dependencia externa -----------------------------------------
export const iso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const somarDias = (base, n) => {
  const x = new Date(base)
  x.setDate(x.getDate() + n)
  return x
}
// Segunda-feira da semana de `base` (semana comeca na segunda).
export const inicioDaSemana = (base) => {
  const x = new Date(base)
  const dia = x.getDay() // 0 = domingo
  return somarDias(x, dia === 0 ? -6 : 1 - dia)
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const nomeDoDia = (data) => DIAS[new Date(`${data}T12:00:00`).getDay()]
export const diaCurto = (data) => DIAS_CURTO[new Date(`${data}T12:00:00`).getDay()]
export const numeroDoDia = (data) => new Date(`${data}T12:00:00`).getDate()
export const mesCurto = (data) => MESES[new Date(`${data}T12:00:00`).getMonth()]

// Quantos dias separam `data` de hoje (negativo = passado).
export const distanciaEmDias = (data, hoje) => {
  const a = new Date(`${data}T12:00:00`)
  const b = new Date(`${hoje}T12:00:00`)
  return Math.round((a - b) / 86400000)
}

export function rotuloDeData(data, hoje) {
  const d = distanciaEmDias(data, hoje)
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  if (d === -1) return 'ontem'
  if (d > 1 && d < 7) return nomeDoDia(data)
  if (d < 0) return `há ${Math.abs(d)} dias`
  return `${numeroDoDia(data)} de ${mesCurto(data)}`
}

// ---------------------------------------------------------------------------
// A SEMANA
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// O RELOGIO DA DEMONSTRACAO.
//
// Um prototipo existe para ser julgado, e uma cena que muda conforme a hora em
// que alguem abre nao da para julgar: as 22h de domingo, "Hoje" apareceria
// vazio e a tela seria avaliada por um acaso do relogio.
//
// Entao o dia da demonstracao e a SEGUNDA da semana corrente — a semana
// inteira pela frente, "amanha" e terça de verdade — e o "agora" e 08:40:
// comeco de expediente, com o dia todo por decidir. O produto real, claro, usa o
// relogio de verdade.
// ---------------------------------------------------------------------------
export const AGORA_DEMO = '08:40'
export const diaDaDemonstracao = (base = new Date()) => inicioDaSemana(base)

export function semearEstado(hojeDate = diaDaDemonstracao()) {
  const hoje = iso(hojeDate)
  const seg = inicioDaSemana(hojeDate)
  const d = (n) => iso(somarDias(seg, n)) // 0 = segunda da semana corrente
  const terca = d(1) // amanha, a partir do dia da demonstracao
  const amanha = iso(somarDias(hojeDate, 1))

  return {
    hoje,
    pessoa: 'Tarsis',

    compromissos: [
      { id: 'c-diretoria', titulo: 'Reunião de diretoria', data: hoje, inicio: '09:00', fim: '10:30', local: 'Sala 2' },
      { id: 'c-almoco', titulo: 'Almoço com fornecedor', data: hoje, inicio: '11:30', fim: '13:00', local: 'Bendito' },
      { id: 'c-seminovos', titulo: 'Reunião Seminovos', data: hoje, inicio: '15:00', fim: '16:00' },
      { id: 'c-dentista', titulo: 'Dentista', data: amanha, inicio: '16:00', fim: '17:00' },
      { id: 'c-repasse', titulo: 'Alinhamento de repasse', data: d(3), inicio: '10:00', fim: '11:00' },
    ],

    tarefas: [
      {
        id: 't-estoque',
        titulo: 'Revisar estoque acima de 60 dias',
        estado: ESTADO.FAZENDO,
        prazo: null,
        paraHoje: true,          // escolhida para hoje
        planejadaPara: hoje,
        reserva: null,
        prioridade: 'alta',
        contexto: 'Operação',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-porcino',
        titulo: 'Retornar Porcino',
        estado: ESTADO.A_FAZER,
        prazo: null,
        paraHoje: true,
        planejadaPara: hoje,
        reserva: null,
        prioridade: 'media',
        contexto: 'Comercial',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-repasse',
        titulo: 'Conferir fechamento do repasse',
        estado: ESTADO.A_FAZER,
        prazo: hoje,             // prazo hoje
        paraHoje: false,
        planejadaPara: null,
        reserva: null,
        prioridade: 'alta',
        contexto: 'Financeiro',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-consorcio',
        titulo: 'Enviar documentação do consórcio',
        estado: ESTADO.A_FAZER,
        prazo: iso(somarDias(hojeDate, -3)),  // atrasada de verdade
        paraHoje: false,
        planejadaPara: null,
        reserva: null,
        prioridade: 'alta',
        contexto: 'Financeiro',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-apresentacao',
        titulo: 'Preparar apresentação do trimestre',
        estado: ESTADO.A_FAZER,
        prazo: null,
        paraHoje: false,
        planejadaPara: null,     // sem data: NAO aparece em Hoje
        reserva: null,
        prioridade: 'media',
        contexto: 'Diretoria',
        origemId: null,
        subtarefas: [],
        grande: true,            // candidata a decomposicao pela IA
      },
      {
        id: 't-higienizacao',
        titulo: 'Trocar fornecedor de higienização',
        estado: ESTADO.FAZENDO,  // em andamento E sem data, ao mesmo tempo
        prazo: null,
        paraHoje: false,
        planejadaPara: null,
        reserva: null,
        prioridade: 'baixa',
        contexto: 'Operação',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-gerentes',
        titulo: 'Discutir padrão de preparação com os gerentes',
        estado: ESTADO.A_FAZER,
        prazo: null,
        paraHoje: false,
        planejadaPara: terca,    // ja planejada, SEM horario reservado
        reserva: null,
        prioridade: 'media',
        contexto: 'Operação',
        origemId: 'm-preparacao', // <- a nota de origem continua existindo
        subtarefas: [],
      },
      {
        id: 't-escala',
        titulo: 'Fechar escala do sábado',
        estado: ESTADO.FEITO,
        prazo: null,
        paraHoje: false,
        planejadaPara: iso(somarDias(hojeDate, -1)),
        reserva: null,
        prioridade: 'media',
        contexto: 'Operação',
        origemId: null,
        subtarefas: [],
      },
      {
        id: 't-patio',
        titulo: 'Conferir pátio na abertura',
        estado: ESTADO.FEITO,
        prazo: null,
        paraHoje: false,
        planejadaPara: hoje,
        reserva: null,
        prioridade: 'baixa',
        contexto: 'Operação',
        origemId: null,
        subtarefas: [],
      },
    ],

    memoria: [
      {
        id: 'm-preparacao',
        tipo: TIPO_MEMORIA.NOTA,
        titulo: 'Padrão de preparação dos veículos',
        texto:
          'Os carros estão saindo para a loja com padrão diferente conforme quem prepara. ' +
          'Higienização, calibragem e revisão de itens de série variam demais.\n\n' +
          'Ideia: um checklist único de preparação, assinado por quem entrega, com foto do ' +
          'painel e do porta-malas. Testar primeiro com os seminovos e medir retrabalho em 30 dias.',
        porOrganizar: false,
        criadoEm: iso(somarDias(hojeDate, -6)),
      },
      {
        id: 'm-testdrive',
        tipo: TIPO_MEMORIA.IDEIA,
        titulo: 'Test drive agendado pelo WhatsApp',
        texto:
          'O cliente escolhe o horário antes de vir. Reduz fila no sábado e a gente já separa ' +
          'o carro limpo e abastecido.',
        porOrganizar: false,
        criadoEm: iso(somarDias(hojeDate, -4)),
      },
      {
        id: 'm-vistoria',
        tipo: TIPO_MEMORIA.LINK,
        titulo: 'Checklist de vistoria de entrada',
        texto: 'Guardado como referência — modelo que o pessoal do pós-venda usa.',
        url: 'https://exemplo.com/checklist-vistoria',
        porOrganizar: false,
        referencia: true,    // guardado como referencia: NAO gerou tarefa
        criadoEm: iso(somarDias(hojeDate, -9)),
      },
      {
        id: 'm-reuniao',
        tipo: TIPO_MEMORIA.NOTA,
        titulo: 'Notas da reunião de diretoria',
        texto:
          'Meta de giro do seminovo em 45 dias. Rever política de desconto no fim do mês. ' +
          'Porcino cobrou retorno sobre a proposta.',
        porOrganizar: false,
        criadoEm: iso(somarDias(hojeDate, -7)),
      },
      {
        id: 'm-cap-1',
        tipo: TIPO_MEMORIA.NOTA,
        titulo: 'pensar melhor sobre a troca da frota de apoio',
        texto: 'pensar melhor sobre a troca da frota de apoio',
        porOrganizar: true,
        criadoEm: iso(somarDias(hojeDate, -2)),
      },
      {
        id: 'm-cap-2',
        tipo: TIPO_MEMORIA.LINK,
        titulo: 'https://exemplo.com/relatorio-mercado-seminovos',
        texto: 'https://exemplo.com/relatorio-mercado-seminovos',
        url: 'https://exemplo.com/relatorio-mercado-seminovos',
        porOrganizar: true,
        criadoEm: iso(somarDias(hojeDate, -5)),
      },
      {
        id: 'm-cap-3',
        tipo: TIPO_MEMORIA.NOTA,
        titulo: 'combinar com o Jorge a vistoria do repasse',
        texto: 'combinar com o Jorge a vistoria do repasse',
        porOrganizar: true,
        criadoEm: iso(somarDias(hojeDate, -1)),
      },
    ],
  }
}
