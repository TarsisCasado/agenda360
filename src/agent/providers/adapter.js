import { interpretLocal } from '../nlu/localNlu'
import { parseInterpretation, emptyInterpretation, TURN_KIND } from '../contracts/interpretation'

// ---------------------------------------------------------------------------
// ADAPTADORES DE INTERPRETACAO (CP6.1).
//
// Um adaptador tem UMA obrigacao: receber o contrato de entrada
// (contracts/input.js) e devolver o contrato de saida
// (contracts/interpretation.js). Nada alem disso.
//
//     { id, interpret(input) -> Promise<Interpretation> }
//
// E so isso porque e assim que a troca de provider fica barata. Um
// `GeminiAdapter`, um `OpenAIAdapter`, um `AnthropicAdapter` sao, cada um, uma
// funcao que monta um corpo HTTP e passa a resposta por `parseInterpretation`.
// Nenhum SDK e necessario: os tres falam JSON sobre HTTPS, e um SDK que so
// serve para montar um POST e uma dependencia a mais para auditar e atualizar.
//
// NENHUM ADAPTADOR REMOTO E IMPLEMENTADO AQUI. Os remotos nem sequer poderiam
// morar neste arquivo: eles rodam na Edge Function, porque chave de API no
// browser e a invariante que nao se negocia. O que mora no front e o adaptador
// LOCAL e, no futuro, um adaptador que faz UMA chamada a nossa propria Function.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} InterpreterAdapter
 * @property {string} id
 * @property {(input: object) => Promise<object>} interpret
 */

// ---------------------------------------------------------------------------
// LocalAdapter — o NLU deterministico de hoje, falando o contrato novo.
//
// Ele NAO foi reescrito e nao vai ser: `interpretLocal` continua exatamente o
// que era, com os seus limites conhecidos (nao extrai antecedencia, nao resolve
// anafora, dispara `create_task` com facilidade). Este adaptador so traduz o
// formato antigo para o novo — e essa traducao e o que prova que o contrato
// cabe no que ja existe, em vez de ser um formato bonito que so um LLM
// hipotetico conseguiria preencher.
//
// O que ele NAO tenta fingir:
//   . `turn_kind` sai sempre CREATE ou UNKNOWN. O local nao sabe distinguir
//     revisao de criacao — quem sabe isso hoje e o `turnClassifier`, por
//     heuristica, e continuara sabendo enquanto o local for o interpretador;
//   . `refers_to_draft` sai sempre false. Nao ha resolucao de anafora aqui, e
//     dizer `true` sem base seria pior que dizer nada: o lado seguro e nao
//     reivindicar o rascunho.
//
// Essa honestidade e o ponto. O contrato aceita um interpretador limitado sem
// mentir sobre ele; quando o remoto chegar, ele preenche os mesmos campos com
// mais competencia, e nada no produto muda de forma.
// ---------------------------------------------------------------------------
export function createLocalAdapter({ interpret: nlu = interpretLocal } = {}) {
  return {
    id: 'local',
    async interpret(input) {
      const texto = input?.input?.text || ''
      if (!texto) return emptyInterpretation({ provider: 'local' })

      let r
      try {
        r = nlu(texto, {
          today: input?.now?.today,
          now: input?.now?.time,
          timezone: input?.now?.timezone,
          categories: (input?.categories || []).map((name) => ({ name })),
        })
      } catch {
        return emptyInterpretation({ provider: 'local' })
      }

      const conhecido = r?.intent && r.intent !== 'unknown'
      return parseInterpretation(
        {
          turn_kind: conhecido ? TURN_KIND.CREATE : TURN_KIND.UNKNOWN,
          refers_to_draft: false,
          intent: conhecido ? r.intent : null,
          confidence: r?.confidence,
          patch: paraPatch(r?.data),
          needs_clarification: r?.needs_clarification,
          clarification: r?.clarification,
          ambiguities: r?.ambiguities,
        },
        { provider: 'local' },
      )
    },
  }
}

// O `data` do NLU local ja usa quase os mesmos nomes; o que nao pertence ao
// contrato (marcadores internos como `time_ambiguous`, `date_skipped`) e
// deixado de fora aqui em vez de ser rejeitado depois — sao decisoes nossas
// sobre a conversa, nao interpretacao.
function paraPatch(data = {}) {
  const CAMPOS = [
    'title', 'description', 'date', 'start_time', 'end_time',
    'alert_enabled', 'alert_minutes_before', 'priority', 'status',
    'link', 'notes', 'task_id', 'query', 'url',
  ]
  const out = {}
  for (const k of CAMPOS) if (data?.[k] !== undefined && data[k] !== null) out[k] = data[k]
  return out
}

// ---------------------------------------------------------------------------
// createRemoteAdapterStub — o lugar reservado, e a razao de ele estar vazio.
//
// Chamar isto hoje devolve `unknown` com a explicacao. NAO existe chave, NAO
// existe Function deployada e NAO se liga `ai.remote` neste checkpoint — o
// stub existe para que o CP6.4 tenha onde encaixar uma unica funcao
// (`fetch` -> `parseInterpretation`) sem inventar arquitetura naquele momento.
// ---------------------------------------------------------------------------
export function createRemoteAdapterStub(id = 'remote') {
  return {
    id,
    async interpret() {
      return emptyInterpretation({
        provider: id,
        clarification: 'Interpretação remota ainda não está configurada.',
      })
    },
  }
}
