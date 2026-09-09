// ---------------------------------------------------------------------------
// Provider Manager — a PONTE entre a conversa e quem interpreta (CP6.4).
//
//   flag ai.remote DESLIGADA (padrao) ou sem Supabase -> interpretador LOCAL;
//   flag LIGADA -> Edge Function `ai-interpret` (JWT do usuario; a chave do
//   provider nunca sai do servidor).
//
// O QUE ESTE ARQUIVO PASSOU A FAZER, E POR QUE.
//
// Ate aqui a chamada remota mandava `{ text, context }` — um formato que a
// Function v2 nao le. Ligar a flag hoje daria 400 em toda chamada, o fallback
// silencioso entraria, e a conversa pareceria funcionar com o NLU local: o
// pior tipo de defeito, o que se disfarca de sucesso.
//
// Agora a ponte tem TRES passos, e cada um usa a peca canonica que ja existia
// em vez de improvisar a sua:
//
//   1. `buildInterpreterInput` (CP6.1) monta o pacote de entrada — input, now,
//      draft ESTRUTURADO, awaiting, categorias (so nomes) e historico curto;
//   2. `parseInterpretation` valida a resposta DE NOVO deste lado. A Function
//      ja validou; isso nao e desperdicio, e a regra de nunca confiar no que
//      chega pela rede — inclusive num servidor nosso;
//   3. `normalizeInterpretation` (CP6.1) traduz do que o modelo entendeu para
//      o que o dominio consome: categoria por nome -> id real, hora do aviso ->
//      antecedencia, especie -> exigencia.
//
// O RASCUNHO E O ITEM MAIS IMPORTANTE. Sem ele, "muda para 9h" e uma frase sem
// sujeito e a conversa recomeca a cada turno — era esse o defeito do QA do
// CP6.0. Ele viaja em `context.pending`, que o `contextEngine` ja preenche.
//
// ORIGEM VISIVEL. Toda interpretacao volta com `source`: 'remote', 'local' ou
// 'remote_fallback'. Fallback silencioso e veneno para QA — quem testa precisa
// saber se leu o Gemini ou o interpretador local.
//
// NENHUMA CHAVE AQUI. Este arquivo vai para o bundle do browser; o que ele
// conhece e o NOME de uma Edge Function.
// ---------------------------------------------------------------------------
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { featureFlags, FLAGS } from './featureFlags'
import { mockInterpret } from './providers/mockProvider'
import { buildInterpreterInput } from './contracts/input'
import { parseInterpretation, TURN_KIND } from './contracts/interpretation'
import { normalizeInterpretation } from './contracts/normalizeInterpretation'
import { resolveTemporal } from './nlu/temporal'

const MAX_TEXT = 1000 // defesa em profundidade; a Edge tambem limita

// De onde veio a leitura deste turno. Nao e enfeite: e o que distingue
// "o remoto respondeu" de "o remoto caiu e ninguem viu".
export const SOURCE = {
  REMOTE: 'remote',
  LOCAL: 'local',
  FALLBACK: 'remote_fallback',
}

// ---------------------------------------------------------------------------
// QUEM DECIDE SE A NOTACAO E AMBIGUA E A CAMADA DETERMINISTICA (CP6.4.2).
//
// O QA real de "Marca uma reunião amanhã às 9h" recebeu de volta
// `ambiguities: ["horario"]`, e o slot-filling — fazendo o seu trabalho —
// perguntou "09:00 da manhã ou 21:00 da noite?". Em portugues, `9h` E 09:00:
// "h" e notacao de 24 horas, e quem quer 21:00 escreve 21h.
//
// A regra do prompt foi corrigida, mas prompt e pedido, nao garantia. E a
// resposta certa ja existe do nosso lado: `resolveTemporal` resolve `9h`,
// `09h`, `21h`, `9:00`, `9 da manha` e `9 da noite` sem ambiguidade nenhuma, e
// levanta a bandeira exatamente onde ela cabe — a hora NUA de 1 a 11 sem
// periodo ("as 9").
//
// Entao a divisao que o `assistant.js` declara no cabecalho vale tambem aqui:
// SEMANTICO e do provider, DETERMINISTICO e nosso. Se o modelo disser que a
// hora e ambigua e a camada temporal resolver a MESMA hora com seguranca, a
// bandeira cai — e o descarte fica registrado em `notes`, porque uma decisao
// silenciosa e uma decisao que ninguem audita.
//
// Nenhum padrao temporal novo nasce aqui: isto CHAMA o que ja existe e ja e
// testado. As outras ambiguidades passam intactas — a regra e so sobre horario.
// ---------------------------------------------------------------------------
function conferirAmbiguidadeDeHorario(ambiguities = [], { text, context, patch, notes }) {
  if (!ambiguities.includes('horario')) return ambiguities

  const hora = patch?.start_time
  if (!hora) return ambiguities   // sem hora resolvida, nao ha o que conferir

  const local = resolveTemporal(text, { today: context.today, now: context.now })
  if (local.timeAmbiguous || local.time !== hora) return ambiguities

  notes.push(`ambiguidade "horario" descartada: ${hora} e inequivoco no texto`)
  return ambiguities.filter((a) => a !== 'horario')
}

// O runtime de hoje consome `{ intent, confidence, data, ... }`. A
// Interpretation v1 e mais rica. A traducao acontece AQUI, num lugar so — uma
// conversao ad hoc em cada chamador seria a forma mais rapida de fazer os dois
// formatos divergirem em silencio.
function paraORuntime(interp, { patch, requires, notes }, source, ambiguities = interp.ambiguities) {
  // `intent` pode vir null num turno que o modelo classificou como criacao
  // (o contrato permite: `turn_kind` e a classificacao, `intent` e a acao).
  // O runtime precisa de uma intencao para achar a tool, entao deduz-se a
  // unica que `create` + patch com conteudo pode significar. Deduzir isto e
  // diferente de inventar dado: nenhum campo da atividade sai daqui.
  const intent =
    interp.intent ||
    (interp.turn_kind === TURN_KIND.CREATE && Object.keys(patch).length > 0 ? 'create_task' : 'unknown')

  return {
    // --- o que o runtime ja esperava ---
    intent,
    confidence: interp.confidence,
    needs_clarification: interp.needs_clarification,
    clarification: interp.clarification,
    ambiguities,
    data: patch,
    // --- o que o contrato v1 acrescenta, para quem souber usar ---
    turn_kind: interp.turn_kind,
    refers_to_draft: interp.refers_to_draft,
    requires,
    notes,
    rejected: interp.rejected,
    // --- proveniencia ---
    provider: interp.provider || 'remote',
    source,
  }
}

function localComOrigem(text, context, source, extra = {}) {
  const base = mockInterpret(text, context)
  return { ...base, provider: base.provider || 'local', source, ...extra }
}

export function createProviderManager({ flags = featureFlags, edgeInvoke } = {}) {
  // `edgeInvoke` injetavel (testes). Padrao: supabase.functions.invoke.
  const invokeEdge = edgeInvoke || (async (name, body) => {
    if (!isSupabaseConfigured) throw new Error('supabase-nao-configurado')
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) throw error
    return data
  })

  const isRemoteEnabled = () => flags.isEnabled(FLAGS.AI_REMOTE) && isSupabaseConfigured

  async function interpret(text, context = {}) {
    const clean = String(text || '').slice(0, MAX_TEXT).trim()
    if (!clean) {
      return {
        intent: 'unknown',
        confidence: 0,
        needs_clarification: true,
        clarification: 'Digite um comando.',
        data: {},
        ambiguities: [],
        provider: 'local',
        source: SOURCE.LOCAL,
      }
    }

    if (!isRemoteEnabled()) return localComOrigem(clean, context, SOURCE.LOCAL)

    // O rascunho vivo e a pergunta em aberto: e o que transforma um turno solto
    // ("muda para 9h") numa revisao daquilo que a pessoa esta olhando.
    const draft = context.pending || null

    try {
      const entrada = buildInterpreterInput({
        text: clean,
        context,
        draft,
        awaiting: draft?.awaiting || null,
      })
      const bruto = await invokeEdge('ai-interpret', entrada)
      // Fronteira, de novo, deste lado. A Function ja validou; a rede entre nos
      // nao e parte do contrato.
      const interp = parseInterpretation(bruto, { provider: bruto?.provider || 'remote' })
      const normal = normalizeInterpretation(interp, {
        categories: context.categories || [],
        draft,
      })
      const ambiguities = conferirAmbiguidadeDeHorario(interp.ambiguities, {
        text: clean,
        context,
        patch: normal.patch,
        notes: normal.notes,
      })
      return paraORuntime(interp, normal, SOURCE.REMOTE, ambiguities)
    } catch (err) {
      // FALLBACK VISIVEL. A conversa continua — a captura nunca se perde — mas
      // o turno sai CARIMBADO como fallback, e a causa vai junto de forma
      // classificada, sem mensagem interna de provider.
      const motivo = err?.message === 'supabase-nao-configurado' ? 'nao_configurado' : 'falha_remota'
      console.warn('[providerManager] remoto indisponivel, usando interpretador local:', motivo)
      return localComOrigem(clean, context, SOURCE.FALLBACK, { fallback_reason: motivo })
    }
  }

  return {
    interpret,
    activeProvider: () => (isRemoteEnabled() ? 'remote' : 'local'),
  }
}

export const providerManager = createProviderManager()
