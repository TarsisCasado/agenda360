// ---------------------------------------------------------------------------
// CAPTURA — a leitura da proposta, isolada da interface.
//
// A superficie de captura e a mesma no mobile (`+`) e no desktop
// ("Nova atividade"): CAPTURO -> o sistema entende -> pergunta se precisar ->
// propoe -> eu confirmo -> vira artefato. Aqui vive so o pedaco pensavel dessa
// cadeia: DE QUE TIPO e o artefato que esta a ponto de entrar no sistema.
//
// Por que isso precisa existir separado da tela: o briefing pede que a
// proposta pareca um objeto, com hierarquia TIPO / TITULO / DATA-HORA /
// ALERTA / CONTEXTO / ACAO. O TIPO nao e escolhido pelo usuario ANTES de
// escrever — seria voltar ao formulario com abas. Ele e DERIVADO do que o
// agente entendeu, e por isso e uma regra, nao um estilo.
//
// A REGRA DO TIPO:
//   - link                 intencao de salvar um link;
//   - compromisso          tem hora de inicio. Hora marcada e um encontro com
//                          o relogio: ou voce esta lá, ou perdeu;
//   - tarefa               nao tem hora. Trabalho a fazer, inclusive sem data
//                          nenhuma ("sem data" e informacao, nao falta dela);
//   - ideia                nota que entrou na Caixa sem virar atividade;
//   - alteracao            a proposta mexe em algo que JA existe (editar,
//                          reagendar, concluir, cancelar, excluir). Nao e um
//                          artefato novo, e uma mudanca — e dizer "Tarefa"
//                          aqui faria o usuario confirmar a criacao de algo
//                          que ele esta, na verdade, alterando.
//
// NUNCA inventar hora para promover uma tarefa a compromisso. A distincao vale
// justamente porque o produto se recusa a adivinhar o relogio do usuario.
// ---------------------------------------------------------------------------

export const TIPOS = {
  compromisso: { key: 'compromisso', label: 'Compromisso' },
  tarefa: { key: 'tarefa', label: 'Tarefa' },
  ideia: { key: 'ideia', label: 'Ideia' },
  link: { key: 'link', label: 'Link' },
  alteracao: { key: 'alteracao', label: 'Alteração' },
}

const INTENCOES_DE_ALTERACAO = [
  'update_task',
  'reschedule_task',
  'complete_task',
  'mark_missed',
  'cancel_task',
  'delete_task',
]

export function tipoDaProposta(proposal) {
  if (!proposal) return null
  const { intent, payload } = proposal
  if (intent === 'create_link') return TIPOS.link
  if (intent === 'create_note' || intent === 'create_idea') return TIPOS.ideia
  if (INTENCOES_DE_ALTERACAO.includes(intent)) return TIPOS.alteracao
  return payload?.start_time ? TIPOS.compromisso : TIPOS.tarefa
}

// Onde o artefato vai cair, dito no idioma do produto — o retorno curto depois
// de confirmar ("Criado em Tarefas.") existe para fechar o ciclo: sem ele o
// usuario confirma e nao sabe para onde a coisa foi.
export function destinoDaProposta(proposal) {
  const tipo = tipoDaProposta(proposal)
  if (!tipo) return null
  if (tipo.key === 'link') return 'Criado em Links.'
  if (tipo.key === 'ideia') return 'Guardado na Caixa.'
  if (tipo.key === 'alteracao') return 'Atualizado.'
  if (tipo.key === 'compromisso') return 'Criado na Agenda.'
  return 'Criado em Tarefas.'
}

// ---------------------------------------------------------------------------
// OS ESTADOS DA SUPERFICIE — desenhados, nao improvisados.
//
//   A vazio            campo aberto, nada escrito. Convida sem instruir.
//   B escrevendo       ha texto; o envio fica alcancavel.
//   C interpretando    o agente pensa. Tem fim: nunca spinner infinito.
//   D pergunta         falta um dado; a pergunta e fala dele e o campo fica.
//   E proposta         o objeto na tela, pronto para confirmar.
//   F revisando        a proposta foi ajustada por texto e substituida.
//   G salvando         confirmacao em curso.
//   H salvo            retorno curto dizendo PARA ONDE foi.
//   I cancelado        rascunho descartado, sem resto na tela.
//   J nao interpretado a captura nao virou artefato — e continua recuperavel,
//                      no campo e na Caixa. E o estado que cumpre "NUNCA
//                      PERDER UMA CAPTURA".
//   K recuperado       ao reabrir, o texto de uma captura que nao completou
//                      volta para o campo, dito com clareza.
//
// A tela referencia estes nomes; a lista mora aqui para que nao existam dois
// vocabularios (um no codigo, outro na cabeca de quem revisa).
// ---------------------------------------------------------------------------
export const ESTADOS = [
  'vazio',
  'escrevendo',
  'interpretando',
  'pergunta',
  'proposta',
  'revisando',
  'salvando',
  'salvo',
  'cancelado',
  'nao_interpretado',
  'recuperado',
]
