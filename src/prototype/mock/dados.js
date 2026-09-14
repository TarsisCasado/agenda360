// ---------------------------------------------------------------------------
// DADOS DO PROTOTIPO — uma semana que PARECE ter sido usada.
//
// O UX1.1 foi lido como "ainda vazio", e parte disso nao era layout: era o
// conteudo. Um produto pessoal com quatro tarefas e um compromisso parece uma
// demonstracao, nao a agenda de alguem que trabalha. Aqui a semana tem o peso
// de alguns dias de uso real — e continua sendo UMA HISTORIA, nao ruido:
//
//   a nota sobre preparacao dos veiculos gera a tarefa com os gerentes, que e
//   planejada para terca e ganha horario reservado; o repasse aparece como
//   tarefa, como prazo e como compromisso de alinhamento; o Porcino aparece na
//   nota da reuniao e na tarefa de retorno.
//
// Ocupacao E folga, os dois: e preciso enxergar a terça cheia e a sexta livre.
// Lotar todos os horarios mentiria tanto quanto deixar tudo vazio.
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
export const inicioDaSemana = (base) => {
  const x = new Date(base)
  const dia = x.getDay()
  return somarDias(x, dia === 0 ? -6 : 1 - dia)
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const nomeDoDia = (data) => DIAS[new Date(`${data}T12:00:00`).getDay()]
export const diaCurto = (data) => DIAS_CURTO[new Date(`${data}T12:00:00`).getDay()]
export const numeroDoDia = (data) => new Date(`${data}T12:00:00`).getDate()
export const mesCurto = (data) => MESES[new Date(`${data}T12:00:00`).getMonth()]

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

// Minutos entre dois horarios "HH:MM" — usado para "em 20 min" e para a grade.
export const emMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

// ---------------------------------------------------------------------------
// O RELOGIO DA DEMONSTRACAO.
//
// Um prototipo existe para ser julgado, e uma cena que muda conforme a hora em
// que alguem abre nao da para julgar: as 22h de domingo, "Hoje" apareceria
// vazio e a tela seria avaliada por um acaso do relogio.
//
// Entao o dia da demonstracao e a SEGUNDA da semana corrente — a semana
// inteira pela frente, "amanha" e terça de verdade — e o "agora" e 08:40:
// comeco de expediente, com o dia todo por decidir e a primeira reuniao a
// vinte minutos, que e o que da sentido a "AGORA / PROXIMO".
// ---------------------------------------------------------------------------
export const AGORA_DEMO = '08:40'
export const diaDaDemonstracao = (base = new Date()) => inicioDaSemana(base)

export function semearEstado(hojeDate = diaDaDemonstracao()) {
  const hoje = iso(hojeDate)
  const seg = inicioDaSemana(hojeDate)
  const d = (n) => iso(somarDias(seg, n))
  const [SEG, TER, QUA, QUI, SEX] = [d(0), d(1), d(2), d(3), d(4)]
  const ontem = iso(somarDias(hojeDate, -1))
  const semanaPassada = (n) => iso(somarDias(hojeDate, -n))

  return {
    hoje,
    pessoa: 'Tarsis',

    // --- 8 compromissos, distribuidos: dias cheios e dias com folga ---------
    compromissos: [
      { id: 'c-gerentes', titulo: 'Reunião com os gerentes', data: SEG, inicio: '09:00', fim: '10:00', local: 'Sala 2', categoria: 'Operação', alerta: 15, notas: 'Padrão de preparação e escala do sábado.' },
      { id: 'c-almoco', titulo: 'Almoço com fornecedor', data: SEG, inicio: '12:30', fim: '14:00', local: 'Bendito', categoria: 'Comercial', alerta: 30 },
      { id: 'c-seminovos', titulo: 'Reunião Seminovos', data: SEG, inicio: '16:00', fim: '17:00', categoria: 'Operação' },
      { id: 'c-banco', titulo: 'Gerente do banco', data: TER, inicio: '08:30', fim: '09:30', local: 'Agência centro', categoria: 'Financeiro', alerta: 30 },
      { id: 'c-repasse', titulo: 'Alinhamento de repasse', data: TER, inicio: '17:00', fim: '18:00', categoria: 'Financeiro', notas: 'Levar o fechamento conferido.' },
      { id: 'c-dentista', titulo: 'Dentista', data: QUA, inicio: '16:00', fim: '17:00', categoria: 'Pessoal', alerta: 60 },
      { id: 'c-diretoria', titulo: 'Diretoria — resultado do trimestre', data: QUI, inicio: '10:00', fim: '12:00', local: 'Sala 1', categoria: 'Diretoria', alerta: 30, notas: 'Apresentação pronta na véspera.' },
      { id: 'c-visita', titulo: 'Visita à unidade Norte', data: QUI, inicio: '15:00', fim: '16:30', categoria: 'Operação' },
    ],

    // --- 15 tarefas ativas + 4 concluídas ----------------------------------
    tarefas: [
      // hoje, escolhidas
      {
        id: 't-repasse', titulo: 'Conferir fechamento do repasse', estado: ESTADO.FAZENDO,
        prazo: SEG, paraHoje: true, planejadaPara: SEG,
        reserva: { data: SEG, inicio: '14:15', fim: '15:30' },
        prioridade: 'alta', contexto: 'Financeiro', alerta: 15, origemId: null, subtarefas: [],
        descricao: 'Bater as notas de repasse com o extrato antes do alinhamento de terça.',
      },
      {
        id: 't-estoque', titulo: 'Revisar estoque acima de 60 dias', estado: ESTADO.FAZENDO,
        prazo: null, paraHoje: true, planejadaPara: SEG, reserva: null,
        prioridade: 'alta', contexto: 'Estoque', alerta: null, origemId: null,
        subtarefas: [
          { id: 's-e1', titulo: 'Listar o que passou de 60 dias', feito: true },
          { id: 's-e2', titulo: 'Definir desconto por faixa', feito: false },
        ],
      },
      {
        id: 't-porcino', titulo: 'Retornar Porcino', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: true, planejadaPara: SEG, reserva: null,
        prioridade: 'media', contexto: 'Comercial', alerta: null, origemId: 'm-reuniao', subtarefas: [],
      },
      // atrasada de verdade
      {
        id: 't-consorcio', titulo: 'Enviar documentação do consórcio', estado: ESTADO.A_FAZER,
        prazo: semanaPassada(4), paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'alta', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [],
        descricao: 'Falta a cópia autenticada do contrato social.',
      },
      // vinda da nota, planejada para terça com horário reservado
      {
        id: 't-gerentes', titulo: 'Discutir padrão de preparação com os gerentes', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: TER,
        reserva: { data: TER, inicio: '14:00', fim: '15:00' },
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: 'm-preparacao', subtarefas: [],
      },
      {
        id: 't-apresentacao', titulo: 'Preparar apresentação do trimestre', estado: ESTADO.FAZENDO,
        prazo: QUI, paraHoje: false, planejadaPara: QUA,
        reserva: { data: QUA, inicio: '09:00', fim: '11:00' },
        prioridade: 'alta', contexto: 'Diretoria', alerta: 30, origemId: null, grande: true,
        descricao: 'Giro, margem por linha e o plano de compra do próximo trimestre.',
        subtarefas: [{ id: 's-a1', titulo: 'Puxar os números de giro', feito: true }],
      },
      {
        id: 't-proposta', titulo: 'Revisar proposta comercial da frota', estado: ESTADO.A_FAZER,
        prazo: TER, paraHoje: false, planejadaPara: TER, reserva: null,
        prioridade: 'alta', contexto: 'Comercial', alerta: null, origemId: null, subtarefas: [],
      },
      {
        id: 't-docs', titulo: 'Conferir documentação pendente dos seminovos', estado: ESTADO.A_FAZER,
        prazo: QUA, paraHoje: false, planejadaPara: QUA, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
      },
      {
        id: 't-escala', titulo: 'Fechar a escala do próximo sábado', estado: ESTADO.A_FAZER,
        prazo: QUI, paraHoje: false, planejadaPara: QUI, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: 'm-reuniao', subtarefas: [],
      },
      {
        id: 't-higienizacao', titulo: 'Trocar fornecedor de higienização', estado: ESTADO.FAZENDO,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
        descricao: 'Dois orçamentos recebidos; falta o terceiro.',
      },
      {
        id: 't-seguro', titulo: 'Negociar renovação do seguro da frota', estado: ESTADO.FAZENDO,
        prazo: SEX, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'media', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [],
      },
      {
        id: 't-site', titulo: 'Atualizar fotos do site', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Marketing', alerta: null, origemId: null, subtarefas: [],
      },
      {
        id: 't-treinamento', titulo: 'Montar treinamento de vendas para novatos', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Comercial', alerta: null, origemId: null, subtarefas: [],
      },
      {
        id: 't-transferencia', titulo: 'Rever processo de transferência', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: SEX, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: 'm-transferencia', subtarefas: [],
      },
      {
        id: 't-jorge', titulo: 'Combinar com o Jorge a vistoria', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: TER, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
      },

      // concluídas
      { id: 't-patio', titulo: 'Conferir pátio na abertura', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: SEG, reserva: null, prioridade: 'baixa', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [] },
      { id: 't-caixa', titulo: 'Fechar o caixa da semana', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: ontem, reserva: null, prioridade: 'media', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [] },
      { id: 't-anuncios', titulo: 'Revisar anúncios do fim de semana', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: ontem, reserva: null, prioridade: 'baixa', contexto: 'Marketing', alerta: null, origemId: null, subtarefas: [] },
      { id: 't-boletos', titulo: 'Pagar boletos do mês', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: semanaPassada(3), reserva: null, prioridade: 'media', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [] },
    ],

    // --- 6 referências + 3 capturas por organizar ---------------------------
    memoria: [
      {
        id: 'm-preparacao', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'Padrão de preparação dos veículos',
        resumo: 'Checklist único assinado por quem entrega, com foto do painel e do porta-malas.',
        texto:
          'Os carros estão saindo para a loja com padrão diferente conforme quem prepara. ' +
          'Higienização, calibragem e revisão de itens de série variam demais.\n\n' +
          'Ideia: um checklist único de preparação, assinado por quem entrega, com foto do ' +
          'painel e do porta-malas. Testar primeiro com os seminovos e medir retrabalho em 30 dias.',
        porOrganizar: false, criadoEm: semanaPassada(6),
      },
      {
        id: 'm-reuniao', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'Notas da reunião com os gerentes',
        resumo: 'Giro do seminovo em 45 dias, política de desconto e o retorno do Porcino.',
        texto:
          'Meta de giro do seminovo em 45 dias.\n' +
          'Rever política de desconto no fim do mês — hoje cada loja decide sozinha.\n' +
          'Porcino cobrou retorno sobre a proposta da frota.\n' +
          'Escala do sábado ainda não fechou; o Jorge assume a vistoria.',
        porOrganizar: false, criadoEm: semanaPassada(7),
      },
      {
        id: 'm-transferencia', tipo: TIPO_MEMORIA.LINK,
        titulo: 'Processo de transferência — passo a passo',
        resumo: 'O fluxo que o pós-venda usa hoje, com os prazos de cada etapa.',
        url: 'https://carmais.com.br/processos/transferencia',
        texto: 'Guardado como referência — é o fluxo que o pós-venda segue hoje, com os prazos de cada etapa e quem assina o quê.',
        porOrganizar: false, referencia: true, criadoEm: semanaPassada(9),
      },
      {
        id: 'm-vistoria', tipo: TIPO_MEMORIA.LINK,
        titulo: 'Checklist de vistoria de entrada',
        resumo: 'Modelo que o pessoal do pós-venda usa na chegada do veículo.',
        url: 'https://exemplo.com.br/checklist-vistoria',
        texto: 'Guardado como referência — modelo que o pessoal do pós-venda usa na entrada do veículo.',
        porOrganizar: false, referencia: true, criadoEm: semanaPassada(12),
      },
      {
        id: 'm-testdrive', tipo: TIPO_MEMORIA.IDEIA,
        titulo: 'Test drive agendado pelo WhatsApp',
        resumo: 'Cliente escolhe o horário antes de vir; reduz fila no sábado.',
        texto:
          'O cliente escolhe o horário antes de vir. Reduz fila no sábado e a gente já separa ' +
          'o carro limpo e abastecido.\n\nDá para testar com um número só, na loja do centro.',
        porOrganizar: false, criadoEm: semanaPassada(4),
      },
      {
        id: 'm-garantia', tipo: TIPO_MEMORIA.IDEIA,
        titulo: 'Garantia estendida como argumento de fechamento',
        resumo: 'Oferecer no momento da proposta, não depois da venda.',
        texto: 'Hoje a garantia entra como adicional depois que o cliente já decidiu. Testar oferecer junto com a proposta e medir conversão.',
        porOrganizar: false, criadoEm: semanaPassada(2),
      },

      // capturas ainda cruas
      {
        id: 'm-cap-1', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'pensar melhor sobre a troca da frota de apoio',
        texto: 'pensar melhor sobre a troca da frota de apoio',
        porOrganizar: true, criadoEm: semanaPassada(2),
      },
      {
        id: 'm-cap-2', tipo: TIPO_MEMORIA.LINK,
        titulo: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        texto: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        url: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        porOrganizar: true, criadoEm: semanaPassada(5),
      },
      {
        id: 'm-cap-3', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'ver com o jurídico o contrato da locadora',
        texto: 'ver com o jurídico o contrato da locadora',
        porOrganizar: true, criadoEm: ontem,
      },
    ],
  }
}
