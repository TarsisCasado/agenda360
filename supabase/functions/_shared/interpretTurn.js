import { parseInterpretation } from './contract.js'
import { ProviderError } from './providers.js'

// ---------------------------------------------------------------------------
// O MIOLO DA FUNCTION (CP6.2) — puro, testavel em Node, sem HTTP nem Deno.
//
// O handler (index.ts) fica fino de proposito: autentica, limita e delega. Toda
// a logica que precisa de teste mora aqui, e por isso os testes deste
// checkpoint rodam na suite normal, sem rede e sem Deno.
//
// LIMITE DE ENTRADA: 1000 caracteres. Nao e economia de token — e que uma
// captura de agenda nao tem 40 mil caracteres, e aceitar isso e aceitar pagar
// para processar texto colado por engano ou de proposito.
// ---------------------------------------------------------------------------

export const MAX_TEXT = 1000
export const MAX_HISTORY = 6

// ---------------------------------------------------------------------------
// OBSERVABILIDADE PRIVADA.
//
// Precisamos saber o que aconteceu sem saber o que a pessoa escreveu. Entao o
// log leva FORMA, nunca CONTEUDO: quantos caracteres tinha o texto, nao o
// texto; quais campos vieram no patch, nao os valores; qual causa falhou, nao a
// mensagem do provider.
//
// `text_len` em vez de `text` e a decisao inteira em miniatura: serve para
// diagnosticar ("os erros sao todos em frases longas?") e nao serve para ler a
// vida de ninguem.
// ---------------------------------------------------------------------------
export const OUTCOME = {
  OK: 'remote_ok',
  INVALID: 'remote_invalid',      // respondeu, mas nada util sobrou da validacao
  TIMEOUT: 'timeout',
  PROVIDER: 'provider_failure',
  NOT_CONFIGURED: 'not_configured',
  BAD_REQUEST: 'bad_request',
}

function sanitizeInput(body) {
  const input = body?.input && typeof body.input === 'object' ? body.input : {}
  const texto = String(input.text ?? '')
    // Caracteres de controle viram espaco: nao dizem nada numa captura e
    // sujam log e prompt.
    // eslint-disable-next-line no-control-regex
    .replace(new RegExp('[\\u0000-\\u001f\\u007f]', 'g'), ' ')
    .slice(0, MAX_TEXT)
    .trim()
  const now = body?.now && typeof body.now === 'object' ? body.now : {}
  return {
    input: { kind: input.kind === 'text' ? 'text' : 'text', text: texto, media: null },
    now: {
      today: typeof now.today === 'string' ? now.today.slice(0, 10) : null,
      time: typeof now.time === 'string' ? now.time.slice(0, 5) : null,
      timezone: typeof now.timezone === 'string' ? now.timezone.slice(0, 64) : null,
    },
    draft: body?.draft && typeof body.draft === 'object' ? body.draft : null,
    awaiting: typeof body?.awaiting === 'string' ? body.awaiting.slice(0, 64) : null,
    categories: Array.isArray(body?.categories)
      ? body.categories.filter((c) => typeof c === 'string').slice(0, 30)
      : [],
    history: Array.isArray(body?.history)
      ? body.history.slice(-MAX_HISTORY).map((m) => ({
          role: m?.role === 'assistant' ? 'assistant' : 'user',
          content: String(m?.content ?? '').slice(0, 500),
        }))
      : [],
  }
}

/**
 * interpretTurn({ body, provider, log })
 *   -> { status, payload, meta }
 *
 * `payload` e o que vai ao cliente. `meta` e o que vai ao log — e as duas
 * coisas sao deliberadamente diferentes: o cliente nunca recebe a causa
 * detalhada, e o log nunca recebe o conteudo.
 */
export async function interpretTurn({ body, provider, log = () => {} }) {
  const t0 = Date.now()
  const input = sanitizeInput(body)

  if (!input.input.text) {
    log({ outcome: OUTCOME.BAD_REQUEST, reason: 'empty_text' })
    return { status: 400, payload: { error: 'empty_text' }, meta: { outcome: OUTCOME.BAD_REQUEST } }
  }

  let resultado
  try {
    resultado = await provider.interpret(input)
  } catch (err) {
    const cause = err instanceof ProviderError ? err.cause : 'provider_http'
    const outcome =
      cause === 'timeout' ? OUTCOME.TIMEOUT
        : cause === 'not_configured' ? OUTCOME.NOT_CONFIGURED
          : OUTCOME.PROVIDER
    // O detalhe (status HTTP, mensagem do provider) fica AQUI. O cliente nao
    // precisa saber que provider usamos nem por que ele recusou — e saber isso
    // so ajudaria quem estivesse sondando o servidor.
    log({
      outcome,
      provider: provider.id,
      cause,
      detail: String(err?.message || err).slice(0, 200),
      ms: Date.now() - t0,
      text_len: input.input.text.length,
    })
    return {
      status: outcome === OUTCOME.NOT_CONFIGURED ? 503 : 502,
      payload: { error: 'interpret_failed', outcome },
      meta: { outcome, provider: provider.id },
    }
  }

  // A MESMA fronteira do front, no mesmo arquivo de contrato. Um provider que
  // respondeu 200 nao e um provider em quem se confia.
  //
  // `wire: true` porque o esquema que mandamos ao provider exige todo campo e
  // aceita `null` como "a frase nao falou disso" — a fronteira traduz isso de
  // volta para os tres estados do dominio. Ver contract.js.
  const interp = parseInterpretation(resultado?.raw, { provider: provider.id, wire: true })

  const inutil = interp.turn_kind === 'unknown' && Object.keys(interp.patch).length === 0
  const outcome = inutil ? OUTCOME.INVALID : OUTCOME.OK

  log({
    outcome,
    provider: provider.id,
    model: resultado?.model || null,
    ms: Date.now() - t0,
    // FORMA, nunca conteudo.
    text_len: input.input.text.length,
    had_draft: Boolean(input.draft),
    turn_kind: interp.turn_kind,
    refers_to_draft: interp.refers_to_draft,
    intent: interp.intent,
    patch_fields: Object.keys(interp.patch),
    rejected: interp.rejected.map((r) => r.field),
  })

  return {
    status: 200,
    payload: interp,
    meta: { outcome, provider: provider.id, model: resultado?.model || null },
  }
}
