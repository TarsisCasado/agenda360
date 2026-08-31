// ---------------------------------------------------------------------------
// CLASSIFICADOR DE TURNO — o que este turno faz com o rascunho que esta vivo?
//
// Vale SO quando existe uma entidade em construcao aguardando confirmacao. Ate
// a proposta, quem manda e o slot-filling (slots.js/mergeTurn), que ja funciona.
//
// PRINCIPIO (nao e lista de frases):
//
//   Um turno so cria uma ENTIDADE NOVA se trouxer um SUJEITO que nao cabe como
//   valor de campo da entidade viva. Na duvida, e alteracao dela.
//
// Isso e resolucao de referencia, nao casamento de padrao: a mesma coisa que
// faz "ele" apontar para o ultimo sujeito citado numa conversa. Os quatro
// sinais que sustentam a decisao sao todos deterministicos:
//
//   1. DELTA        — os extratores de campo acharam algum valor? (delta.js)
//   2. SUJEITO      — sobrou conteudo depois de tirar tudo que foi consumido?
//   3. ATO DE FALA  — aceite/desistencia, classe gramatical fechada.
//   4. VALIDACAO    — o patch aplicado ao rascunho ainda passa no schema?
//                     (feita por quem executa, no assistant, com o registry)
//
// A tabela de decisao abaixo tem SEIS linhas e nenhuma delas cita uma frase.
//
//   sujeito novo | delta | ato de fala | ->
//   sim (e o interpretador concorda)    -> NOVA INTENCAO
//   nao          | sim   | -           -> ALTERACAO      (delta vence o ato de fala)
//   nao          | nao   | cancelar    -> CANCELAMENTO
//   nao          | nao   | confirmar   -> CONFIRMACAO
//   sim (sem concordancia)              -> PERGUNTA
//   nao          | nao   | -           -> PERGUNTA
//
// A ordem importa e e o que resolve os casos dificeis:
//   "nao quero lembrete"  -> tem delta (lembrete=false) => ALTERACAO, nao cancelamento.
//   "cancela isso"        -> sem delta, "isso" e anafora => CANCELAMENTO.
//   "reuniao com o Joao amanha" -> sujeito novo + provider concorda => NOVA INTENCAO.
//
// PROVIDER-AGNOSTIC: `interp` entra apenas como um VOTO ("o interpretador tambem
// acha que isso e coisa nova"). Trocar o NLU local por um LLM remoto nao afrouxa
// nada — a garantia de nao descartar um rascunho vivo continua sendo desta
// camada.
// ---------------------------------------------------------------------------
import { extractDelta, residualSubject } from './nlu/delta'
import { detectSpeechAct } from './nlu/speechAct'

export const TURN = {
  MODIFY: 'modify',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  NEW_INTENT: 'new_intent',
  AMBIGUOUS: 'ambiguous',
}

const CONFIDENCE_THRESHOLD = 0.5

// classifyTurn({ interp, text, context }) ->
//   { kind, patch?, fields?, residue?, act? }
export function classifyTurn({ interp = {}, text, context = {} } = {}) {
  const delta = extractDelta(text, {
    today: context.today,
    now: context.now,
    categories: context.categories,
  })
  const speech = detectSpeechAct(text)
  const residue = residualSubject(text, [...delta.spans, ...speech.spans])

  // O interpretador ve isto como uma frase completa e autossuficiente?
  const providerAgrees =
    Boolean(interp.intent) &&
    interp.intent !== 'unknown' &&
    (interp.confidence ?? 0) >= CONFIDENCE_THRESHOLD

  // 1) Sujeito novo E concordancia do interpretador: substituicao inequivoca.
  //    Exigir os DOIS e o que impede um rascunho de ser descartado por engano.
  if (residue.length > 0 && providerAgrees) {
    return { kind: TURN.NEW_INTENT, residue, act: speech.act }
  }

  // 2) Traz valor de campo -> altera o rascunho. Vence o ato de fala.
  if (!delta.empty) {
    return { kind: TURN.MODIFY, patch: delta.patch, fields: delta.fields, residue }
  }

  // 3) Atos de fala puros.
  if (speech.act === 'cancel') return { kind: TURN.CANCEL, act: 'cancel' }
  if (speech.act === 'confirm') return { kind: TURN.CONFIRM, act: 'confirm' }

  // 4) Nao deu para decidir: perguntar e melhor que adivinhar.
  return { kind: TURN.AMBIGUOUS, residue, act: speech.act }
}
