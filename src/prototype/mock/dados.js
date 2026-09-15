// ---------------------------------------------------------------------------
// DADOS DO PROTOTIPO — uma semana que PARECE ter sido usada.
//
// UX1.2: a mesma historia ganhou a segunda metade — o trabalho que passa por
// outras pessoas. Nao ha datasets independentes por tela; ha UMA semana, e
// cada superficie olha para ela de um angulo:
//
//   a nota sobre preparacao dos veiculos gera a tarefa com os gerentes, que e
//   planejada para terça e ganha horario reservado;
//   a conferencia de documentacao dos seminovos foi DELEGADA ao Rubens: ele
//   aceitou, moveu para Em andamento e empurrou o prazo — e esses eventos
//   aparecem na Atividade da tarefa, em algumas notificacoes e no Relatorio;
//   as fotos do site voltaram da Carla com motivo, e por isso viram DECISAO em
//   Hoje;
//   a escala do sabado esta bloqueada esperando um documento;
//   a Marina atribuiu o reajuste da tabela a mim, e ainda nao aceitei;
//   a quinta tem dois compromissos que se sobrepoem — a Agenda mostra, a
//   Revisao aponta, e a decisao continua sendo minha.
//
// Ocupacao E folga, os dois: e preciso enxergar a terça cheia e a sexta livre.
// Lotar todos os horarios mentiria tanto quanto deixar tudo vazio.
//
// NADA aqui toca banco, servico ou rede. Sao objetos em memoria.
// ---------------------------------------------------------------------------

export const ESTADO = { A_FAZER: 'a_fazer', FAZENDO: 'fazendo', FEITO: 'feito' }
export const TIPO_MEMORIA = { NOTA: 'nota', IDEIA: 'ideia', LINK: 'link' }

// RESPONSABILIDADE e um eixo separado da EXECUCAO. Uma tarefa pode estar
// "aguardando aceite" E "a fazer" ao mesmo tempo: sao perguntas diferentes —
// "quem assumiu isso?" e "em que pe esta?".
export const RESPONSABILIDADE = {
  ACEITA: 'aceita',
  AGUARDANDO: 'aguardando',
  DEVOLVIDA: 'devolvida',
}

export const EU = 'p-tarsis'

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

// "ontem 17:40", "hoje 08:12" — o carimbo de um evento de atividade.
export function rotuloDeMomento(quando, hoje) {
  const [data, hora] = String(quando).split('T')
  return `${rotuloDeData(data, hoje)} ${hora}`
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

export function saudacao(hora = AGORA_DEMO) {
  const h = Number(String(hora).slice(0, 2))
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

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
    tema: 'sistema', // claro | escuro | sistema

    // --- as pessoas da historia --------------------------------------------
    // Sem usuarios reais, sem permissoes, sem backend: sao nomes que dao
    // sentido a delegacao. Um responsavel principal por tarefa neste
    // checkpoint; cadeia de delegacao fica de fora.
    pessoas: [
      { id: EU, nome: 'Tarsis', iniciais: 'TC', eu: true },
      { id: 'p-rubens', nome: 'Rubens', iniciais: 'RS' },
      { id: 'p-carla', nome: 'Carla', iniciais: 'CM' },
      { id: 'p-jorge', nome: 'Jorge', iniciais: 'JB' },
      { id: 'p-marina', nome: 'Marina', iniciais: 'MA' },
    ],

    // --- 9 compromissos, distribuidos: dias cheios e dias com folga ---------
    compromissos: [
      { id: 'c-gerentes', titulo: 'Reunião com os gerentes', data: SEG, inicio: '09:00', fim: '10:00', local: 'Sala 2', categoria: 'Operação', alerta: { minutos: 15, referencia: 'compromisso' }, notas: 'Padrão de preparação e escala do sábado.' },
      { id: 'c-almoco', titulo: 'Almoço com fornecedor', data: SEG, inicio: '12:30', fim: '14:00', local: 'Bendito', categoria: 'Comercial', alerta: { minutos: 30, referencia: 'compromisso' } },
      { id: 'c-seminovos', titulo: 'Reunião Seminovos', data: SEG, inicio: '16:00', fim: '17:00', categoria: 'Operação', alerta: null },
      { id: 'c-banco', titulo: 'Gerente do banco', data: TER, inicio: '08:30', fim: '09:30', local: 'Agência centro', categoria: 'Financeiro', alerta: { minutos: 1440, referencia: 'compromisso' } },
      { id: 'c-repasse', titulo: 'Alinhamento de repasse', data: TER, inicio: '17:00', fim: '18:00', categoria: 'Financeiro', alerta: null, notas: 'Levar o fechamento conferido.' },
      { id: 'c-dentista', titulo: 'Dentista', data: QUA, inicio: '16:00', fim: '17:00', categoria: 'Pessoal', alerta: { minutos: 60, referencia: 'compromisso' } },
      { id: 'c-diretoria', titulo: 'Diretoria — resultado do trimestre', data: QUI, inicio: '10:00', fim: '12:00', local: 'Sala 1', categoria: 'Diretoria', alerta: { minutos: 30, referencia: 'compromisso' }, notas: 'Apresentação pronta na véspera.' },
      // O conflito da semana: encavala 30 min no fim da diretoria. Nao e um
      // erro do mock — e o caso que a Agenda e a Revisao existem para mostrar.
      { id: 'c-auditoria', titulo: 'Auditoria do estoque', data: QUI, inicio: '11:30', fim: '12:30', local: 'Pátio', categoria: 'Operação', alerta: null },
      { id: 'c-visita', titulo: 'Visita à unidade Norte', data: QUI, inicio: '15:00', fim: '16:30', categoria: 'Operação', alerta: null },
    ],

    // --- 17 tarefas ativas + 4 concluídas ----------------------------------
    tarefas: [
      // hoje, escolhidas
      {
        id: 't-repasse', titulo: 'Conferir fechamento do repasse', estado: ESTADO.FAZENDO,
        prazo: SEG, paraHoje: true, planejadaPara: SEG,
        reserva: { data: SEG, inicio: '14:15', fim: '15:30' },
        prioridade: 'alta', contexto: 'Financeiro',
        alerta: { minutos: 15, referencia: 'reserva' },
        origemId: null, subtarefas: [],
        descricao: 'Bater as notas de repasse com o extrato antes do alinhamento de terça.',
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-estoque', titulo: 'Revisar estoque acima de 60 dias', estado: ESTADO.FAZENDO,
        prazo: null, paraHoje: true, planejadaPara: SEG, reserva: null,
        prioridade: 'alta', contexto: 'Estoque', alerta: null, origemId: null,
        subtarefas: [
          { id: 's-e1', titulo: 'Listar o que passou de 60 dias', feito: true },
          { id: 's-e2', titulo: 'Definir desconto por faixa', feito: false },
        ],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-porcino', titulo: 'Retornar Porcino', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: true, planejadaPara: SEG, reserva: null,
        prioridade: 'media', contexto: 'Comercial', alerta: null, origemId: 'm-reuniao', subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      // atrasada de verdade
      {
        id: 't-consorcio', titulo: 'Enviar documentação do consórcio', estado: ESTADO.A_FAZER,
        prazo: semanaPassada(4), paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'alta', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [],
        descricao: 'Falta a cópia autenticada do contrato social.',
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true,
        // reagendada varias vezes: a evidencia que a Revisao usa
        reagendamentos: 4,
        atividade: [
          { id: 'a-cs1', autorId: EU, evento: 'reagendou', detalhe: '4ª vez', quando: `${semanaPassada(1)}T18:20` },
        ],
      },
      // vinda da nota, planejada para terça com horário reservado
      {
        id: 't-gerentes', titulo: 'Discutir padrão de preparação com os gerentes', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: TER,
        reserva: { data: TER, inicio: '14:00', fim: '15:00' },
        prioridade: 'media', contexto: 'Operação',
        alerta: { minutos: 15, referencia: 'reserva' },
        origemId: 'm-preparacao', subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-apresentacao', titulo: 'Preparar apresentação do trimestre', estado: ESTADO.FAZENDO,
        prazo: QUI, paraHoje: false, planejadaPara: QUA,
        reserva: { data: QUA, inicio: '09:00', fim: '11:00' },
        prioridade: 'alta', contexto: 'Diretoria',
        alerta: { minutos: 30, referencia: 'reserva' },
        origemId: null, grande: true,
        descricao: 'Giro, margem por linha e o plano de compra do próximo trimestre.',
        subtarefas: [{ id: 's-a1', titulo: 'Puxar os números de giro', feito: true }],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-proposta', titulo: 'Revisar proposta comercial da frota', estado: ESTADO.A_FAZER,
        prazo: TER, paraHoje: false, planejadaPara: TER, reserva: null,
        prioridade: 'alta', contexto: 'Comercial', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },

      // --- DELEGADA E ANDANDO: o Rubens assumiu e esta tocando --------------
      {
        id: 't-docs', titulo: 'Conferir documentação pendente dos seminovos', estado: ESTADO.FAZENDO,
        prazo: QUI, paraHoje: false, planejadaPara: QUA, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: EU, responsavelId: 'p-rubens',
        responsabilidade: RESPONSABILIDADE.ACEITA, acompanhando: true,
        atividade: [
          { id: 'a-d1', autorId: EU, evento: 'delegou', detalhe: 'para Rubens', quando: `${semanaPassada(1)}T16:05` },
          { id: 'a-d2', autorId: 'p-rubens', evento: 'aceitou', quando: `${SEG}T08:12` },
          { id: 'a-d3', autorId: 'p-rubens', evento: 'moveu', detalhe: 'A fazer → Em andamento', quando: `${SEG}T08:14` },
          { id: 'a-d4', autorId: 'p-rubens', evento: 'alterou o prazo', detalhe: `${numeroDoDia(QUA)} → ${numeroDoDia(QUI)} de ${mesCurto(QUI)}`, quando: `${SEG}T08:20` },
          { id: 'a-d5', autorId: 'p-rubens', evento: 'comentou', detalhe: 'Faltam três CRVs; o despachante devolve quarta.', quando: `${SEG}T08:21` },
        ],
      },

      // --- DELEGADA E BLOQUEADA: exige decisao minha -----------------------
      {
        id: 't-escala', titulo: 'Fechar a escala do próximo sábado', estado: ESTADO.A_FAZER,
        prazo: QUI, paraHoje: false, planejadaPara: QUI, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: 'm-reuniao', subtarefas: [],
        criadorId: EU, delegadorId: EU, responsavelId: 'p-rubens',
        responsabilidade: RESPONSABILIDADE.ACEITA, acompanhando: true,
        bloqueio: 'aguardando documento do RH',
        atividade: [
          { id: 'a-e1', autorId: EU, evento: 'delegou', detalhe: 'para Rubens', quando: `${semanaPassada(2)}T11:30` },
          { id: 'a-e2', autorId: 'p-rubens', evento: 'aceitou', quando: `${semanaPassada(2)}T11:52` },
          { id: 'a-e3', autorId: 'p-rubens', evento: 'bloqueou', detalhe: 'aguardando documento do RH', quando: `${ontem}T17:40` },
        ],
      },

      // --- DEVOLVIDA: virou decisao em Hoje --------------------------------
      {
        id: 't-site', titulo: 'Atualizar fotos do site', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Marketing', alerta: null, origemId: null, subtarefas: [],
        // Devolvida: a responsabilidade JA voltou para quem delegou. O nome da
        // Carla fica no histórico, não no campo de responsável — senão a tarefa
        // apareceria como dela, parada, sem ninguém para decidir.
        criadorId: EU, delegadorId: EU, responsavelId: EU,
        responsabilidade: RESPONSABILIDADE.DEVOLVIDA,
        motivoDevolucao: 'Sem acesso ao banco de imagens; preciso da liberação do marketing.',
        acompanhando: true,
        atividade: [
          { id: 'a-s1', autorId: EU, evento: 'delegou', detalhe: 'para Carla', quando: `${semanaPassada(3)}T09:10` },
          { id: 'a-s2', autorId: 'p-carla', evento: 'aceitou', quando: `${semanaPassada(3)}T09:44` },
          { id: 'a-s3', autorId: 'p-carla', evento: 'devolveu', detalhe: 'Sem acesso ao banco de imagens; preciso da liberação do marketing.', quando: `${SEG}T07:55` },
        ],
      },

      // --- DELEGADA, AINDA SEM ACEITE --------------------------------------
      {
        id: 't-jorge', titulo: 'Combinar a vistoria de entrada dos seminovos', estado: ESTADO.A_FAZER,
        prazo: TER, paraHoje: false, planejadaPara: TER, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: EU, responsavelId: 'p-jorge',
        responsabilidade: RESPONSABILIDADE.AGUARDANDO, acompanhando: true,
        atividade: [
          { id: 'a-j1', autorId: EU, evento: 'delegou', detalhe: 'para Jorge', quando: `${ontem}T15:02` },
        ],
      },

      // --- RECEBIDA: a Marina atribuiu a mim, e eu ainda nao aceitei -------
      {
        id: 't-reajuste', titulo: 'Aprovar reajuste da tabela de serviços', estado: ESTADO.A_FAZER,
        prazo: QUA, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'alta', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [],
        descricao: 'Reajuste de 6,2% na mão de obra a partir do mês que vem.',
        criadorId: 'p-marina', delegadorId: 'p-marina', responsavelId: EU,
        responsabilidade: RESPONSABILIDADE.AGUARDANDO, acompanhando: true,
        atividade: [
          { id: 'a-r1', autorId: 'p-marina', evento: 'atribuiu', detalhe: 'para você', quando: `${ontem}T16:10` },
        ],
      },

      {
        id: 't-higienizacao', titulo: 'Trocar fornecedor de higienização', estado: ESTADO.FAZENDO,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [],
        descricao: 'Dois orçamentos recebidos; falta o terceiro.',
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-seguro', titulo: 'Negociar renovação do seguro da frota', estado: ESTADO.FAZENDO,
        prazo: SEX, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'media', contexto: 'Financeiro',
        alerta: { minutos: 1440, referencia: 'prazo' },
        origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-treinamento', titulo: 'Montar treinamento de vendas para novatos', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Comercial', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-transferencia', titulo: 'Rever processo de transferência', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: SEX, reserva: null,
        prioridade: 'media', contexto: 'Operação', alerta: null, origemId: 'm-transferencia', subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: true, atividade: [],
      },
      {
        id: 't-anuncios2', titulo: 'Definir verba de anúncios do mês', estado: ESTADO.A_FAZER,
        prazo: null, paraHoje: false, planejadaPara: null, reserva: null,
        prioridade: 'baixa', contexto: 'Marketing', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null,
        acompanhando: false, atividade: [],
      },

      // concluídas
      { id: 't-patio', titulo: 'Conferir pátio na abertura', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: SEG, reserva: null, prioridade: 'baixa', contexto: 'Operação', alerta: null, origemId: null, subtarefas: [], criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null, acompanhando: true, concluidaEm: SEG, atividade: [] },
      { id: 't-caixa', titulo: 'Fechar o caixa da semana', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: ontem, reserva: null, prioridade: 'media', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [], criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null, acompanhando: true, concluidaEm: ontem, atividade: [] },
      {
        id: 't-anuncios', titulo: 'Revisar anúncios do fim de semana', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: ontem, reserva: null, prioridade: 'baixa', contexto: 'Marketing', alerta: null, origemId: null, subtarefas: [],
        criadorId: EU, delegadorId: EU, responsavelId: 'p-carla',
        responsabilidade: RESPONSABILIDADE.ACEITA, acompanhando: true, concluidaEm: ontem,
        atividade: [
          { id: 'a-an1', autorId: EU, evento: 'delegou', detalhe: 'para Carla', quando: `${semanaPassada(4)}T10:00` },
          { id: 'a-an2', autorId: 'p-carla', evento: 'aceitou', quando: `${semanaPassada(4)}T10:26` },
          { id: 'a-an3', autorId: 'p-carla', evento: 'concluiu', quando: `${ontem}T14:08` },
        ],
      },
      { id: 't-boletos', titulo: 'Pagar boletos do mês', estado: ESTADO.FEITO, prazo: null, paraHoje: false, planejadaPara: semanaPassada(3), reserva: null, prioridade: 'media', contexto: 'Financeiro', alerta: null, origemId: null, subtarefas: [], criadorId: EU, delegadorId: null, responsavelId: EU, responsabilidade: null, acompanhando: true, concluidaEm: semanaPassada(3), atividade: [] },
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
        porOrganizar: false, arquivada: false, criadoEm: semanaPassada(6), atualizadoEm: semanaPassada(6),
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
        porOrganizar: false, arquivada: false, criadoEm: semanaPassada(7), atualizadoEm: semanaPassada(7),
      },
      {
        id: 'm-transferencia', tipo: TIPO_MEMORIA.LINK,
        titulo: 'Processo de transferência — passo a passo',
        resumo: 'O fluxo que o pós-venda usa hoje, com os prazos de cada etapa.',
        url: 'https://carmais.com.br/processos/transferencia',
        texto: 'Guardado como referência — é o fluxo que o pós-venda segue hoje, com os prazos de cada etapa e quem assina o quê.',
        porOrganizar: false, referencia: true, arquivada: false, criadoEm: semanaPassada(9), atualizadoEm: semanaPassada(9),
      },
      {
        id: 'm-vistoria', tipo: TIPO_MEMORIA.LINK,
        titulo: 'Checklist de vistoria de entrada',
        resumo: 'Modelo que o pessoal do pós-venda usa na chegada do veículo.',
        url: 'https://exemplo.com.br/checklist-vistoria',
        texto: 'Guardado como referência — modelo que o pessoal do pós-venda usa na entrada do veículo.',
        porOrganizar: false, referencia: true, arquivada: false, criadoEm: semanaPassada(12), atualizadoEm: semanaPassada(12),
      },
      {
        id: 'm-testdrive', tipo: TIPO_MEMORIA.IDEIA,
        titulo: 'Test drive agendado pelo WhatsApp',
        resumo: 'Cliente escolhe o horário antes de vir; reduz fila no sábado.',
        texto:
          'O cliente escolhe o horário antes de vir. Reduz fila no sábado e a gente já separa ' +
          'o carro limpo e abastecido.\n\nDá para testar com um número só, na loja do centro.',
        porOrganizar: false, arquivada: false, criadoEm: semanaPassada(4), atualizadoEm: semanaPassada(4),
      },
      {
        id: 'm-garantia', tipo: TIPO_MEMORIA.IDEIA,
        titulo: 'Garantia estendida como argumento de fechamento',
        resumo: 'Oferecer no momento da proposta, não depois da venda.',
        texto: 'Hoje a garantia entra como adicional depois que o cliente já decidiu. Testar oferecer junto com a proposta e medir conversão.',
        porOrganizar: false, arquivada: false, criadoEm: semanaPassada(2), atualizadoEm: semanaPassada(2),
      },

      // capturas ainda cruas
      {
        id: 'm-cap-1', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'pensar melhor sobre a troca da frota de apoio',
        texto: 'pensar melhor sobre a troca da frota de apoio',
        porOrganizar: true, arquivada: false, criadoEm: semanaPassada(9), atualizadoEm: semanaPassada(9),
      },
      {
        id: 'm-cap-2', tipo: TIPO_MEMORIA.LINK,
        titulo: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        texto: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        url: 'https://exemplo.com.br/relatorio-mercado-seminovos',
        porOrganizar: true, arquivada: false, criadoEm: semanaPassada(11), atualizadoEm: semanaPassada(11),
      },
      {
        id: 'm-cap-3', tipo: TIPO_MEMORIA.NOTA,
        titulo: 'ver com o jurídico o contrato da locadora',
        texto: 'ver com o jurídico o contrato da locadora',
        porOrganizar: true, arquivada: false, criadoEm: ontem, atualizadoEm: ontem,
      },
    ],

    // ------------------------------------------------------------------------
    // NOTIFICACOES — e aqui que mora a distincao que o UX1.2 pediu em voz alta:
    //
    //   HISTORICO != NOTIFICACAO.
    //
    // A Atividade das tarefas acima tem MAIS eventos do que esta lista. "Rubens
    // moveu A fazer → Em andamento" esta la e NAO esta aqui: mudanca rotineira
    // de estado fica no historico e nao interrompe ninguem. Aceite, devolucao,
    // bloqueio, alteracao de prazo e nova atribuicao interrompem.
    //
    // Duas origens, e elas nao se misturam: LEMBRETE e tempo; ATIVIDADE e
    // gente.
    // ------------------------------------------------------------------------
    notificacoes: [
      { id: 'n-1', origem: 'lembrete', titulo: 'Gerente do banco — amanhã às 08:30', detalhe: '1 dia antes do compromisso', quando: `${SEG}T08:30`, lida: false, alvo: { tipo: 'agenda', id: TER } },
      { id: 'n-2', origem: 'atividade', titulo: 'Rubens alterou o prazo', detalhe: `Conferir documentação pendente dos seminovos · ${numeroDoDia(QUA)} → ${numeroDoDia(QUI)} de ${mesCurto(QUI)}`, quando: `${SEG}T08:20`, lida: false, alvo: { tipo: 'tarefa', id: 't-docs' } },
      { id: 'n-3', origem: 'atividade', titulo: 'Rubens aceitou a tarefa', detalhe: 'Conferir documentação pendente dos seminovos', quando: `${SEG}T08:12`, lida: false, alvo: { tipo: 'tarefa', id: 't-docs' } },
      { id: 'n-4', origem: 'lembrete', titulo: 'Prazo hoje: conferir fechamento do repasse', detalhe: '1 hora antes do prazo', quando: `${SEG}T08:00`, lida: true, alvo: { tipo: 'tarefa', id: 't-repasse' } },
      { id: 'n-5', origem: 'atividade', titulo: 'Carla devolveu a tarefa', detalhe: 'Atualizar fotos do site · sem acesso ao banco de imagens', quando: `${SEG}T07:55`, lida: false, alvo: { tipo: 'tarefa', id: 't-site' } },
      { id: 'n-6', origem: 'atividade', titulo: 'Rubens bloqueou a tarefa', detalhe: 'Fechar a escala do próximo sábado · aguardando documento do RH', quando: `${ontem}T17:40`, lida: true, alvo: { tipo: 'tarefa', id: 't-escala' } },
      { id: 'n-7', origem: 'atividade', titulo: 'Marina atribuiu uma tarefa a você', detalhe: 'Aprovar reajuste da tabela de serviços', quando: `${ontem}T16:10`, lida: true, alvo: { tipo: 'tarefa', id: 't-reajuste' } },
      { id: 'n-8', origem: 'lembrete', titulo: 'Reunião com os gerentes às 09:00', detalhe: '15 min antes do compromisso', quando: `${SEG}T08:45`, lida: false, agendada: true, alvo: { tipo: 'agenda', id: SEG } },
    ],
  }
}
