// ---------------------------------------------------------------------------
// CONTRATO DE ENTRADA DO INTERPRETADOR (CP6.1).
//
// O que um interpretador recebe — qualquer um deles, local ou remoto.
//
// DUAS DECISOES QUE ESTE ARQUIVO EXISTE PARA REGISTRAR:
//
// 1. A ENTRADA E UMA MIDIA, NAO UMA STRING.
//
//    Hoje toda captura e texto, e seria natural escrever `interpret(text, ctx)`
//    — foi assim que o produto comecou. Mas foto e audio nao sao "texto depois";
//    sao a MESMA captura por outra porta, com o mesmo destino: interpretacao ->
//    proposta -> confirmacao -> dominio. Se a assinatura presumir string, o dia
//    da foto vira um segundo pipeline, com a sua propria maquina de estados, o
//    seu proprio cofre e as suas proprias regras de alerta — e a partir dai as
//    duas divergem sem ninguem decidir que deviam divergir. Foi exatamente esse
//    erro que o CP5.6 corrigiu na captura e o CP5.9.1 no alerta.
//
//    Entao `input.kind` existe DESDE AGORA, com um valor so ('text'). Nao ha
//    upload, camera nem microfone neste checkpoint — ha um lugar onde eles
//    caberao sem mexer no contrato de saida.
//
// 2. O CONTEXTO E MINIMO E EXPLICITO.
//
//    O `contextEngine` de hoje monta um pacote generoso: ate 20 tarefas
//    recentes, 20 atrasadas, 12 turnos de historico, preferencias de rotina.
//    Isso e barato para o NLU local, que ignora quase tudo, e caro para um LLM
//    — em tokens, em latencia e em superficie de vazamento. Um pacote que
//    "manda tudo por garantia" e um pacote que ninguem auditou.
//
//    Aqui o contexto e uma lista fechada, e cada item justifica a propria
//    presenca. O que nao esta na lista nao viaja.
// ---------------------------------------------------------------------------

export const INPUT_KIND = {
  TEXT: 'text',
  // Reservados. Nao implementados neste checkpoint — declarados para que o
  // contrato ja tenha forma quando chegarem.
  IMAGE: 'image',
  AUDIO: 'audio',
}

const SUPPORTED = new Set([INPUT_KIND.TEXT])

export const MAX_TEXT = 1000
// Poucos turnos, nao "o historico". O que o interpretador precisa e do fio da
// conversa recente; o resto e custo. O rascunho vivo — que e o que realmente
// desambigua "muda para 9h" — viaja separado e estruturado, nao diluido no
// meio de transcricoes.
export const MAX_HISTORY_TURNS = 6

export function isSupportedInput(kind) {
  return SUPPORTED.has(kind)
}

// ---------------------------------------------------------------------------
// buildInterpreterInput — o pacote fechado que qualquer adaptador recebe.
//
// `draft` e o item mais importante daqui e o que faltava no CP6.0: com o
// rascunho descrito de forma estruturada, "muda o horario da reuniao para as
// 9h" deixa de depender de adivinhar se "reuniao" e sujeito novo ou anafora —
// o interpretador VE que existe uma reuniao viva e pode dizer
// `refers_to_draft: true`.
// ---------------------------------------------------------------------------
export function buildInterpreterInput({
  kind = INPUT_KIND.TEXT,
  text = '',
  context = {},
  draft = null,
  awaiting = null,
} = {}) {
  const clean = String(text ?? '').slice(0, MAX_TEXT).trim()

  return {
    input: {
      kind: isSupportedInput(kind) ? kind : INPUT_KIND.TEXT,
      text: clean,
      // Quando chegarem: `media` carrega a referencia (nunca os bytes crus por
      // esta camada), e `text` passa a ser a transcricao/legenda quando houver.
      media: null,
    },
    // Ancoragem temporal. Sem isto "amanha" nao existe, e um modelo que chuta
    // uma data e pior que um que pergunta.
    now: {
      today: context.today || null,
      time: context.now || null,
      timezone: context.timezone || null,
    },
    // O que a pessoa esta olhando AGORA. Estruturado, nao narrado.
    draft: draft
      ? {
          intent: draft.intent || null,
          phase: draft.phase || null,
          // So os campos do contrato; nada de estado interno do slot-filling
          // viaja para fora.
          data: pickPatchLike(draft.data),
        }
      : null,
    // A pergunta em aberto, se houver: sem ela, uma resposta curta ("9h") nao
    // tem a que responder.
    awaiting: awaiting || draft?.awaiting || null,
    // Nomes, para o modelo poder citar uma categoria existente em vez de
    // inventar. Ids ficam de fora: sao nossos, e o modelo nao precisa deles.
    categories: (context.categories || []).map((c) => c.name).filter(Boolean).slice(0, 30),
    history: (context.history || [])
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 500) })),
  }
}

// Recorta um objeto de rascunho aos campos que o contrato conhece. Nada de
// `time_ambiguous`, `date_skipped` e outros marcadores internos do
// slot-filling: sao decisoes NOSSAS sobre a conversa, nao informacao que o
// interpretador precise — e mandar estado interno para fora e como comeca a
// dependencia que impede trocar de provider depois.
function pickPatchLike(data = {}) {
  const CAMPOS = [
    'title', 'description', 'date', 'start_time', 'end_time',
    'alert_enabled', 'alert_minutes_before', 'priority', 'status', 'link', 'notes',
  ]
  const out = {}
  for (const k of CAMPOS) if (data?.[k] !== undefined) out[k] = data[k]
  return out
}
