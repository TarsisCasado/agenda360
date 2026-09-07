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

// -------------------- TIMEOUT: UM LUGAR SO ---------------------------------
//
// Este e o unico timeout dos tres adaptadores. Os adaptadores continuam
// aceitando `timeoutMs` (os testes injetam 40ms para provar o caminho de
// abortar), mas nenhum carrega numero proprio: mudar aqui muda para todos.
//
// 15s, e nao os 8s originais, por MEDICAO e nao por palpite. O QA real do
// CP6.3, ja com a Function deployada e o JWT valido, deu em tres chamadas:
//   . ~9,1s  -> outcome=timeout   (abortado por nos, no limite de 8s)
//   . ~3,3s  -> provider_http 503 (o Gemini recusou; transitorio, nao lentidao)
//   . ~8,4s  -> outcome=timeout   (idem a primeira)
// Ou seja: 2 de 3 chamadas foram cortadas POR NOS, e nao pelo provider. Um
// timeout que aborta a resposta que estava chegando nao protege ninguem — so
// transforma latencia em falha e esconde o comportamento real do modelo.
//
// O numero antigo saiu de uma estimativa ("o dobro de uma resposta de Flash")
// feita antes de existir qualquer medida. A primeira medida a contradisse.
//
// 15s continua MUITO abaixo do limite de execucao da plataforma, entao o
// AbortController segue fazendo o que importa: garantir que a Function termine
// por decisao nossa, com `outcome=timeout` no log, em vez de ficar presa.
export const DEFAULT_TIMEOUT_MS = 15000

// -------------------- MODELOS: um lugar so, com default explicito ----------
//
// Nome de modelo espalhado pelo codigo e nome de modelo que ninguem troca. Aqui
// cada provider tem UM default, sobrescrivel por env, e o valor efetivo aparece
// na resposta de diagnostico — entao "qual modelo respondeu isso?" e uma
// pergunta com resposta, nao uma arqueologia.
//
// Os nomes de Gemini Flash mudam com frequencia — e mudaram: o CP6.2 nasceu com
// `gemini-2.0-flash`, que ja nao e o Flash corrente. O default aqui subiu para
// `gemini-3.8-flash` porque um default obsoleto e pior que nenhum: se o env
// falhar, o fallback silencioso apontaria para um modelo que pode nem responder.
// O ambiente continua mandando por `GEMINI_MODEL`; este valor e a rede de
// seguranca, e rede de seguranca velha nao segura ninguem.
export const MODEL_DEFAULTS = {
  gemini: 'gemini-3.8-flash',
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
  // usuario olhava para uma tela parada. O valor esta em DEFAULT_TIMEOUT_MS, com
  // a medicao que o justifica.
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
// geracao ao formato — nao e o prompt pedindo JSON, e o modelo impedido de sair
// dele. Ver `generationConfig` abaixo para por que nao ha `temperature` aqui.
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
              // SEM `temperature`. A familia Gemini 3 IGNORA temperature, top_p e
              // top_k — nao da erro, simplesmente nao faz nada. Um parametro que
              // nao faz nada e pior que ausente: parece que a determinacao esta
              // configurada quando nao esta. Quem controla isso agora e
              // `thinkingLevel`.
              //
              // `low` porque a tarefa e extrair campos de uma frase curta, nao
              // raciocinar sobre um problema: nivel alto custaria latencia dentro
              // do timeout e dinheiro, sem ler melhor "reuniao amanha as 8h".
              // Configuravel por env pela mesma razao do modelo — a escolha
              // certa hoje pode nao ser a de amanha. (`minimal` nao existe no 3.8
              // e devolve erro de validacao.)
              thinkingConfig: { thinkingLevel: env.get('GEMINI_THINKING_LEVEL') || 'low' },
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
