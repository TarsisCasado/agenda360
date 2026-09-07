import { buildSystemPrompt, buildResponseSchema, buildUserPrompt } from './prompt.js'

// ---------------------------------------------------------------------------
// ADAPTADORES DE PROVIDER — server-side (CP6.2).
//
// Cada um faz UMA coisa: monta um corpo HTTP, envia, e devolve o objeto cru que
// o modelo produziu. Nenhum valida nada — validar e da fronteira
// (`parseInterpretation`), e ter um so lugar de validacao e o que garante que
// trocar de provider nao afrouxa a seguranca.
//
// SEM SDK. Os tres falam JSON sobre HTTPS; um SDK que so serve para montar um
// POST e uma dependencia a mais para auditar, atualizar e confiar — numa
// funcao que ve texto do usuario e carrega uma chave de API, isso importa.
//
// SEM CHAVE NENHUMA AQUI. As chaves sao lidas do ambiente do servidor no
// momento da chamada e nunca saem dele. Este arquivo nunca e enviado ao
// browser: mora em `supabase/functions/`.
//
// STRUCTURED OUTPUT SEMPRE QUE O PROVIDER SUPORTAR. "Responda em JSON" no
// prompt e um pedido; um esquema e uma restricao de geracao. Gemini e OpenAI
// aceitam esquema; Anthropic ainda depende do prompt, e isso esta registrado
// abaixo em vez de escondido.
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 8000

// -------------------- MODELOS: um lugar so, com default explicito ----------
//
// Nome de modelo espalhado pelo codigo e nome de modelo que ninguem troca. Aqui
// cada provider tem UM default, sobrescrivel por env, e o valor efetivo aparece
// na resposta de diagnostico — entao "qual modelo respondeu isso?" e uma
// pergunta com resposta, nao uma arqueologia.
//
// Os nomes de Gemini Flash mudam com frequencia. O default abaixo e um ponto de
// partida documentado, NAO uma escolha definitiva: trocar e mexer no env
// `GEMINI_MODEL`, sem tocar em codigo nem redeployar por causa disso.
export const MODEL_DEFAULTS = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
}

export function resolveModel(provider, env) {
  const chave = { gemini: 'GEMINI_MODEL', openai: 'OPENAI_MODEL', anthropic: 'ANTHROPIC_MODEL' }[provider]
  return (chave && env.get(chave)) || MODEL_DEFAULTS[provider] || null
}

// Erro com CAUSA classificada. O cliente recebe so a causa; o detalhe fica no
// log do servidor. E o que permite distinguir timeout de recusa do provider sem
// contar ao browser como o servidor esta montado por dentro.
export class ProviderError extends Error {
  constructor(cause, detail) {
    super(detail || cause)
    this.name = 'ProviderError'
    this.cause = cause // 'timeout' | 'provider_http' | 'provider_body' | 'not_configured'
  }
}

async function postJson(url, { headers, body, timeoutMs, fetchImpl }) {
  const ctrl = new AbortController()
  // Sem isto, a Function ficava presa ate o limite da plataforma enquanto o
  // usuario olhava para uma tela parada. Oito segundos e mais que o dobro de
  // uma resposta normal de Flash: quem passa disso nao vai responder bem.
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await (fetchImpl || fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw new ProviderError('timeout', `abortado em ${timeoutMs}ms`)
    throw new ProviderError('provider_http', String(err?.message || err))
  } finally {
    clearTimeout(t)
  }
  if (!res.ok) throw new ProviderError('provider_http', `status ${res.status}`)
  try {
    return await res.json()
  } catch {
    throw new ProviderError('provider_body', 'resposta nao e JSON')
  }
}

// Um modelo pode devolver JSON valido embrulhado em ``` ou com texto em volta,
// mesmo instruido a nao fazer. Tolerar isso e barato; o conteudo ainda passa
// pela fronteira depois.
function parseModelJson(texto) {
  if (typeof texto !== 'string') throw new ProviderError('provider_body', 'sem texto na resposta')
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const o = JSON.parse(limpo)
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      throw new ProviderError('provider_body', 'JSON nao e objeto')
    }
    return o
  } catch (err) {
    if (err instanceof ProviderError) throw err
    throw new ProviderError('provider_body', 'JSON invalido')
  }
}

// -------------------- GEMINI ------------------------------------------------
// `responseMimeType` + `responseSchema` fazem o proprio provider restringir a
// geracao ao formato. `temperature: 0` porque interpretar nao e criar: a mesma
// frase deve produzir a mesma leitura.
export function createGeminiAdapter({ env, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    id: 'gemini',
    async interpret(input) {
      const key = env.get('GEMINI_API_KEY')
      if (!key) throw new ProviderError('not_configured', 'GEMINI_API_KEY ausente')
      const model = resolveModel('gemini', env)
      const json = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          headers: { 'x-goog-api-key': key },
          timeoutMs,
          fetchImpl,
          body: {
            systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
            contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: buildResponseSchema(),
            },
          },
        },
      )
      return { raw: parseModelJson(json?.candidates?.[0]?.content?.parts?.[0]?.text), model }
    },
  }
}

// -------------------- OPENAI ------------------------------------------------
export function createOpenAIAdapter({ env, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    id: 'openai',
    async interpret(input) {
      const key = env.get('OPENAI_API_KEY')
      if (!key) throw new ProviderError('not_configured', 'OPENAI_API_KEY ausente')
      const model = resolveModel('openai', env)
      const json = await postJson('https://api.openai.com/v1/chat/completions', {
        headers: { Authorization: `Bearer ${key}` },
        timeoutMs,
        fetchImpl,
        body: {
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        },
      })
      return { raw: parseModelJson(json?.choices?.[0]?.message?.content), model }
    },
  }
}

// -------------------- ANTHROPIC ---------------------------------------------
// Sem esquema de geracao nesta rota: aqui o formato depende do prompt. Fica
// dito em vez de suposto — e mais uma razao para a fronteira validar tudo de
// novo, independentemente de quem respondeu.
export function createAnthropicAdapter({ env, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    id: 'anthropic',
    async interpret(input) {
      const key = env.get('ANTHROPIC_API_KEY')
      if (!key) throw new ProviderError('not_configured', 'ANTHROPIC_API_KEY ausente')
      const model = resolveModel('anthropic', env)
      const json = await postJson('https://api.anthropic.com/v1/messages', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        timeoutMs,
        fetchImpl,
        body: {
          model,
          max_tokens: 1024,
          temperature: 0,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        },
      })
      return { raw: parseModelJson(json?.content?.[0]?.text), model }
    },
  }
}

const FABRICAS = {
  gemini: createGeminiAdapter,
  openai: createOpenAIAdapter,
  anthropic: createAnthropicAdapter,
}

// Provider escolhido SERVER-SIDE por `AI_PROVIDER`. Nunca pelo cliente: quem
// escolhe o provider escolhe onde o texto vai parar.
export function pickProvider(env, opts = {}) {
  const nome = (env.get('AI_PROVIDER') || 'gemini').toLowerCase()
  const fabrica = FABRICAS[nome]
  if (!fabrica) throw new ProviderError('not_configured', `AI_PROVIDER desconhecido: ${nome}`)
  return fabrica({ env, ...opts })
}
