import { describe, it, expect, vi } from 'vitest'
import { interpretTurn, OUTCOME, MAX_TEXT } from '../_shared/interpretTurn.js'
import {
  createGeminiAdapter, createOpenAIAdapter, createAnthropicAdapter,
  pickProvider, resolveModel, MODEL_DEFAULTS, ProviderError, DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_TOKENS, INTERACTIONS_URL, extrairModelOutput,
} from '../_shared/providers.js'
import { buildSystemPrompt, buildResponseSchema } from '../_shared/prompt.js'
import { PATCH_FIELD_NAMES } from '../_shared/contract.js'

// ---------------------------------------------------------------------------
// AI-INTERPRET v2 — provado SEM internet e SEM chave (CP6.2).
//
// Todo HTTP e mockado. O que se prova nao e que o Gemini funciona — isso so o
// Gemini prova — mas que NOS pedimos a coisa certa e sabemos receber tanto uma
// resposta boa quanto todas as formas de resposta ruim: timeout, 4xx, 5xx,
// texto que nao e JSON, JSON que nao e objeto, intent proibida, campo
// desconhecido, valor impossivel.
//
// A parte mais importante e a ultima: nada do que der errado pode contar ao
// cliente como o servidor esta montado por dentro.
// ---------------------------------------------------------------------------

const ENV = (vars = {}) => ({ get: (k) => vars[k] ?? undefined })

const ENTRADA = {
  input: { kind: 'text', text: 'Marca uma reuniao com os gerentes amanha as 8h e me avisa meia hora antes' },
  now: { today: '2026-09-07', time: '20:00', timezone: 'America/Fortaleza' },
  draft: null,
  awaiting: null,
  categories: ['Reuniao', 'Pessoal'],
  history: [],
}

// Resposta da Interactions API bem formada. A forma nova e uma LINHA DO TEMPO
// de passos: pensamento, ferramentas e, no fim, o `model_output`. O helper
// inclui um passo de raciocinio ANTES do util de proposito — se algum dia o
// parser voltar a pegar "o primeiro passo", isto quebra.
function respostaTexto(texto) {
  return {
    ok: true,
    json: async () => ({
      steps: [
        { type: 'thought', content: [{ type: 'text', text: 'pensando...' }] },
        { type: 'model_output', content: [{ type: 'text', text: texto }] },
      ],
    }),
  }
}
function respostaGemini(obj) {
  return respostaTexto(JSON.stringify(obj))
}

const CRIAR_OK = {
  turn_kind: 'create',
  refers_to_draft: false,
  intent: 'create_task',
  confidence: 0.94,
  patch: {
    title: 'Reunião com os gerentes',
    date: '2026-09-08',
    start_time: '08:00',
    kind: 'compromisso',
    alert_enabled: true,
    alert_minutes_before: 30,
    category_hint: 'Reuniao',
  },
  needs_clarification: false,
  clarification: null,
  ambiguities: [],
}

describe('o que se PEDE ao Gemini', () => {
  it('fala com a Interactions API, e o modelo vai no corpo — não na URL', async () => {
    // A rota mudou no CP6.3.3: `:generateContent` devolvia 404 para esta chave.
    // Na Interactions o modelo e um CAMPO, entao a URL e sempre a mesma.
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)

    const [url, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(url).toBe(INTERACTIONS_URL)
    expect(url).toContain('/v1beta/interactions')
    expect(url).not.toContain(':generateContent')
    expect(body.model).toBe(MODEL_DEFAULTS.gemini)
    expect(body.system_instruction).toContain('Agenda 360')
  })

  it('o modelo do env manda, e continua no corpo', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-outro-flash' }), fetchImpl,
    }).interpret(ENTRADA)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('gemini-outro-flash')
  })

  it('nada desta captura fica guardado no provider: store=false explícito', async () => {
    // O default do servidor e ARMAZENAR. Silencio aqui seria consentimento.
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.store).toBe(false)
    expect(body.previous_interaction_id).toBeUndefined()   // stateless de verdade
  })

  it('vai com esquema de geração — não só "responda JSON" no prompt', async () => {
    // Na forma nova o mime foi para dentro de um objeto polimorfico com
    // discriminador; `response_mime_type` solto deixou de existir.
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.response_format.type).toBe('text')
    expect(body.response_format.mime_type).toBe('application/json')
    expect(body.response_format.schema.properties.turn_kind.enum).toContain('revise')
    expect(body.response_mime_type).toBeUndefined()
    expect(body.generationConfig).toBeUndefined()          // camelCase legacy fora
  })

  it('a saída tem teto — 64k de corda é o que vira timeout', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).generation_config.max_output_tokens)
      .toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(2048)

    const outro = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: 'k', GEMINI_MAX_OUTPUT_TOKENS: '256' }), fetchImpl: outro,
    }).interpret(ENTRADA)
    expect(JSON.parse(outro.mock.calls[0][1].body).generation_config.max_output_tokens).toBe(256)
  })

  it('o timeout é um só, e é o medido — 30s', () => {
    // Guarda de regressao de uma decisao MEDIDA, nao estimada: a chamada valida
    // do QA real pela rota certa levou 23,88s, e 15s a teria cortado. E teto de
    // seguranca temporario, nao alvo — ver o comentario em providers.js.
    // Se alguem baixar o numero sem nova medida, o teste avisa.
    expect(DEFAULT_TIMEOUT_MS).toBe(30000)
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(23876)   // a medida que o obriga
  })

  it('nenhum adaptador carrega timeout próprio — todos herdam a constante', async () => {
    // Prova pelo comportamento, nao pela leitura do codigo: sem `timeoutMs`, o
    // abort dos tres cai exatamente em DEFAULT_TIMEOUT_MS.
    const nuncaResponde = (_url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    const chaves = { GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }
    for (const criar of [createGeminiAdapter, createOpenAIAdapter, createAnthropicAdapter]) {
      vi.useFakeTimers()
      try {
        const p = criar({ env: ENV(chaves), fetchImpl: nuncaResponde }).interpret(ENTRADA)
        const capturado = p.then(() => null, (e) => e)
        await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS)
        const err = await capturado
        expect(err).toBeInstanceOf(ProviderError)
        expect(err.cause).toBe('timeout')
        expect(err.message).toContain(String(DEFAULT_TIMEOUT_MS))
      } finally {
        vi.useRealTimers()
      }
    }
  })

  it('NÃO manda temperature — a família Gemini 3 a ignora', async () => {
    // Ignorada nao e inofensiva: um parametro morto no corpo faz parecer que a
    // determinacao esta configurada quando nao esta. Quem controla isso agora e
    // thinkingLevel, e o teste guarda as duas metades dessa troca.
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)
    const cfg = JSON.parse(fetchImpl.mock.calls[0][1].body).generation_config
    expect(cfg.temperature).toBeUndefined()
    expect(cfg.top_p).toBeUndefined()
    expect(cfg.top_k).toBeUndefined()
    expect(cfg.thinking_level).toBe('low')
  })

  it('o nível de raciocínio é configurável — e nunca "minimal"', async () => {
    // `minimal` nao existe no 3.8 e devolve erro de validacao; se um dia for
    // configurado por engano, que quebre aqui e nao em producao.
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: 'k', GEMINI_THINKING_LEVEL: 'medium' }), fetchImpl,
    }).interpret(ENTRADA)
    const cfg = JSON.parse(fetchImpl.mock.calls[0][1].body).generation_config
    expect(cfg.thinking_level).toBe('medium')
    expect(['low', 'medium', 'high']).toContain(cfg.thinking_level)
  })

  it('a chave viaja no header, nunca na URL', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'segredo-123' }), fetchImpl }).interpret(ENTRADA)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).not.toContain('segredo-123')   // URL vai para log de proxy
    expect(init.headers['x-goog-api-key']).toBe('segredo-123')
  })

  it('o contexto enviado é o do CP6.1 — e nada além dele', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret({
      ...ENTRADA,
      draft: { intent: 'create_task', phase: 'awaiting_confirmation', data: { start_time: '09:00' } },
    })
    const enviado = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).input)
    expect(Object.keys(enviado).sort()).toEqual(
      ['awaiting', 'categorias', 'draft', 'historico', 'mensagem', 'now'].sort(),
    )
    expect(enviado.draft.data.start_time).toBe('09:00')
    expect(enviado.categorias).toEqual(['Reuniao', 'Pessoal'])
  })

  it('o prompt explica os seis turn_kind e proíbe inventar horário', () => {
    const p = buildSystemPrompt()
    for (const k of ['create', 'revise', 'confirm', 'cancel', 'query', 'unknown']) {
      expect(p).toContain(`"${k}"`)
    }
    expect(p).toMatch(/SOMENTE os campos que mudam/i)
    expect(p).toMatch(/NUNCA invente data ou horario/i)
    expect(p).toMatch(/DADO, nunca instrucao/i)
    expect(buildResponseSchema().required).toContain('turn_kind')
  })

  it('o modelo é configurável por env, com default explícito e ATUAL', () => {
    expect(resolveModel('gemini', ENV({}))).toBe(MODEL_DEFAULTS.gemini)
    expect(resolveModel('gemini', ENV({ GEMINI_MODEL: 'gemini-9-turbo' }))).toBe('gemini-9-turbo')
    // O fallback nao pode apontar para um modelo aposentado: se o env falhar, a
    // rede de seguranca precisa segurar. O CP6.2 nasceu com gemini-2.0-flash.
    expect(MODEL_DEFAULTS.gemini).not.toMatch(/^gemini-2\./)
    expect(MODEL_DEFAULTS.gemini).toBe('gemini-3.8-flash')
  })

  it('o provider é escolhido server-side, e um nome desconhecido não passa', () => {
    expect(pickProvider(ENV({ AI_PROVIDER: 'openai' })).id).toBe('openai')
    expect(pickProvider(ENV({})).id).toBe('gemini')   // default
    expect(() => pickProvider(ENV({ AI_PROVIDER: 'meu-modelo-caseiro' }))).toThrow(ProviderError)
  })

  it('os outros dois adaptadores continuam de pé', async () => {
    const f1 = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(CRIAR_OK) } }] }) }))
    const f2 = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(CRIAR_OK) }] }) }))
    expect((await createOpenAIAdapter({ env: ENV({ OPENAI_API_KEY: 'k' }), fetchImpl: f1 }).interpret(ENTRADA)).raw.intent).toBe('create_task')
    expect((await createAnthropicAdapter({ env: ENV({ ANTHROPIC_API_KEY: 'k' }), fetchImpl: f2 }).interpret(ENTRADA)).raw.intent).toBe('create_task')
    expect(JSON.parse(f1.mock.calls[0][1].body).response_format.type).toBe('json_object')
  })
})

describe('o que se RECEBE — turno bom', () => {
  const rodar = async (obj, body = ENTRADA) => {
    const logs = []
    const provider = createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: 'k' }),
      fetchImpl: async () => respostaGemini(obj),
    })
    const r = await interpretTurn({ body, provider, log: (e) => logs.push(e) })
    return { ...r, logs }
  }

  it('create com alerta de 30 minutos chega inteiro', async () => {
    const { status, payload, meta } = await rodar(CRIAR_OK)
    expect(status).toBe(200)
    expect(meta.outcome).toBe(OUTCOME.OK)
    expect(payload.turn_kind).toBe('create')
    expect(payload.patch).toMatchObject({
      date: '2026-09-08', start_time: '08:00', alert_enabled: true, alert_minutes_before: 30,
    })
  })

  it('revise com refers_to_draft e patch PARCIAL', async () => {
    const { payload } = await rodar(
      { turn_kind: 'revise', refers_to_draft: true, intent: 'create_task', confidence: 0.9, patch: { start_time: '09:00' } },
      { ...ENTRADA, draft: { intent: 'create_task', data: { start_time: '08:00' } } },
    )
    expect(payload.turn_kind).toBe('revise')
    expect(payload.refers_to_draft).toBe(true)
    expect(Object.keys(payload.patch)).toEqual(['start_time'])
  })

  it('alert_at_time atravessa o contrato — a conta é do domínio', async () => {
    const { payload } = await rodar(
      { turn_kind: 'revise', refers_to_draft: true, confidence: 0.9, patch: { alert_at_time: '08:30' } },
    )
    expect(payload.patch.alert_at_time).toBe('08:30')
    expect(payload.patch.alert_minutes_before).toBeUndefined()
  })

  it('query, cancel e confirm não trazem mutação', async () => {
    for (const kind of ['query', 'cancel', 'confirm']) {
      const { payload } = await rodar({ turn_kind: kind, refers_to_draft: true, confidence: 0.9, patch: {} })
      expect(payload.turn_kind).toBe(kind)
      expect(payload.patch).toEqual({})
    }
  })
})

describe('o que se RECEBE — turno ruim', () => {
  const comFetch = async (fetchImpl, body = ENTRADA) => {
    const logs = []
    const provider = createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl, timeoutMs: 40 })
    const r = await interpretTurn({ body, provider, log: (e) => logs.push(e) })
    return { ...r, logs }
  }
  const comObjeto = (obj) => comFetch(async () => respostaGemini(obj))

  it('intent proibida é recusada — e registrada', async () => {
    const { payload } = await comObjeto({ turn_kind: 'create', intent: 'drop_database', confidence: 0.9, patch: { title: 'X' } })
    expect(payload.intent).toBeNull()
    expect(payload.rejected.some((r) => r.field === 'intent')).toBe(true)
  })

  it('campo desconhecido some sem derrubar o resto', async () => {
    const { payload, meta } = await comObjeto({
      turn_kind: 'create', intent: 'create_task', confidence: 0.9,
      patch: { title: 'Reunião', sql: 'DROP TABLE tasks;', service_role_key: 'eyJ...' },
    })
    expect(payload.patch.title).toBe('Reunião')
    expect(payload.patch.sql).toBeUndefined()
    expect(payload.patch.service_role_key).toBeUndefined()
    expect(meta.outcome).toBe(OUTCOME.OK)
  })

  it('valores impossíveis não entram', async () => {
    const { payload } = await comObjeto({
      turn_kind: 'create', intent: 'create_task', confidence: 9,
      patch: { date: '31/12/2026', start_time: '99:99', alert_minutes_before: 999999, priority: 'catastrofica' },
    })
    expect(payload.patch).toEqual({})
    expect(payload.confidence).toBeLessThanOrEqual(1)
  })

  it('resposta vazia de conteúdo vira remote_invalid, não 200 mentiroso', async () => {
    const { status, meta, logs } = await comObjeto({ turn_kind: 'destruir', patch: {} })
    expect(status).toBe(200)
    expect(meta.outcome).toBe(OUTCOME.INVALID)
    expect(logs[0].outcome).toBe(OUTCOME.INVALID)
  })

  it('timeout é distinguível de falha do provider', async () => {
    const { status, payload, logs } = await comFetch(
      (url, init) => new Promise((_, rej) => {
        init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))
      }),
    )
    expect(status).toBe(502)
    expect(payload.outcome).toBe(OUTCOME.TIMEOUT)
    expect(logs[0].outcome).toBe(OUTCOME.TIMEOUT)
    expect(logs[0].ms).toBeGreaterThan(0)
  })

  it('HTTP 4xx e 5xx do provider viram falha controlada', async () => {
    for (const s of [401, 403, 429, 500, 503]) {
      const { status, payload } = await comFetch(async () => ({ ok: false, status: s, json: async () => ({}) }))
      expect(status).toBe(502)
      expect(payload.outcome).toBe(OUTCOME.PROVIDER)
    }
  })

  it('resposta que não é JSON não explode', async () => {
    const { status, payload } = await comFetch(async () => ({ ok: true, json: async () => { throw new Error('nao e json') } }))
    expect(status).toBe(502)
    expect(payload.outcome).toBe(OUTCOME.PROVIDER)
  })

  it('texto do modelo que não é JSON (ou vem em ```) é tratado', async () => {
    const cercado = await comFetch(async () => respostaTexto('```json\n' + JSON.stringify(CRIAR_OK) + '\n```'))
    expect(cercado.payload.turn_kind).toBe('create')

    const prosa = await comFetch(async () => respostaTexto('Claro! Vou marcar sim.'))
    expect(prosa.status).toBe(502)
  })

  it('resposta sem model_output é falha, não silêncio', async () => {
    // So passo de pensamento: o modelo "respondeu" e nao disse nada util.
    // Inventar um objeto vazio aqui seria pior que falhar.
    const soPensamento = await comFetch(async () => ({
      ok: true,
      json: async () => ({ steps: [{ type: 'thought', content: [{ type: 'text', text: 'hm' }] }] }),
    }))
    expect(soPensamento.status).toBe(502)
    expect(soPensamento.payload.outcome).toBe(OUTCOME.PROVIDER)

    const semSteps = await comFetch(async () => ({ ok: true, json: async () => ({ interaction: {} }) }))
    expect(semSteps.status).toBe(502)

    const outputSemTexto = await comFetch(async () => ({
      ok: true,
      json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'image', image: {} }] }] }),
    }))
    expect(outputSemTexto.status).toBe(502)
  })

  it('extrairModelOutput pega o passo certo mesmo com ruído em volta', () => {
    const texto = extrairModelOutput({
      steps: [
        { type: 'thought', content: [{ type: 'text', text: 'nao sou eu' }] },
        { type: 'function_call', content: [{ type: 'text', text: 'nem eu' }] },
        { type: 'model_output', content: [{ type: 'image' }, { type: 'text', text: 'sou eu' }] },
      ],
    })
    expect(texto).toBe('sou eu')
    expect(() => extrairModelOutput({})).toThrow(ProviderError)
  })

  it('sem chave configurada: 503, e o cliente não descobre qual env falta', async () => {
    const provider = createGeminiAdapter({ env: ENV({}), fetchImpl: async () => respostaGemini(CRIAR_OK) })
    const { status, payload } = await interpretTurn({ body: ENTRADA, provider })
    expect(status).toBe(503)
    expect(JSON.stringify(payload)).not.toMatch(/GEMINI_API_KEY/)
  })

  it('texto vazio é recusado antes de gastar uma chamada', async () => {
    const fetchImpl = vi.fn()
    const provider = createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl })
    const { status } = await interpretTurn({ body: { input: { text: '   ' } }, provider })
    expect(status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('nada interno vaza, e o log não lê a vida de ninguém', () => {
  it('a resposta de erro leva CAUSA, nunca a mensagem do provider', async () => {
    const provider = createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: 'k' }),
      fetchImpl: async () => { throw new Error('connect ECONNREFUSED 10.0.0.7:443 (upstream openai-proxy)') },
    })
    const { payload } = await interpretTurn({ body: ENTRADA, provider })
    const txt = JSON.stringify(payload)
    expect(txt).not.toMatch(/ECONNREFUSED|10\.0\.0\.7|upstream/)
    expect(payload).toEqual({ error: 'interpret_failed', outcome: OUTCOME.PROVIDER })
  })

  it('a chave não aparece em log nem em erro — nem quando o provider recusa', async () => {
    // 401 e exatamente o caso em que a tentacao de "mostrar a credencial para
    // depurar" aparece. O log leva o status; a chave nao sai daqui.
    const CHAVE = 'AIza-chave-ficticia-do-teste-123'
    const logs = []
    const provider = createGeminiAdapter({
      env: ENV({ GEMINI_API_KEY: CHAVE }),
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `key ${CHAVE} invalid` } }) }),
    })
    const { payload } = await interpretTurn({ body: ENTRADA, provider, log: (e) => logs.push(e) })
    expect(JSON.stringify(payload)).not.toContain(CHAVE)
    expect(JSON.stringify(logs)).not.toContain(CHAVE)
    expect(logs[0].detail).toBe('status 401')
    expect(payload.outcome).toBe(OUTCOME.PROVIDER)
  })

  it('o log leva FORMA, nunca o texto da captura', async () => {
    const logs = []
    const provider = createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl: async () => respostaGemini(CRIAR_OK) })
    await interpretTurn({ body: ENTRADA, provider, log: (e) => logs.push(e) })
    const linha = JSON.stringify(logs[0])
    expect(linha).not.toContain('gerentes')          // o texto não vai para o log
    expect(linha).not.toContain('Reunião com os')    // nem os valores do patch
    expect(logs[0].text_len).toBeGreaterThan(0)      // o tamanho, sim
    expect(logs[0].patch_fields).toContain('start_time')
    expect(logs[0].model).toBe(MODEL_DEFAULTS.gemini)
    expect(logs[0].outcome).toBe(OUTCOME.OK)
  })

  it('o texto é limitado antes de sair daqui', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    const provider = createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl })
    await interpretTurn({ body: { ...ENTRADA, input: { text: 'a'.repeat(50000) } }, provider })
    const enviado = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).input)
    expect(enviado.mensagem.length).toBe(MAX_TEXT)
  })

  it('o histórico é cortado no servidor, não só no cliente', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    const provider = createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl })
    await interpretTurn({
      body: { ...ENTRADA, history: Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: `t${i}` })) },
      provider,
    })
    const enviado = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).input)
    expect(enviado.historico).toHaveLength(6)
  })
})

describe('o esquema diz o que cada campo é (CP6.3.5)', () => {
  // O QA real devolveu `patch: { title, url: "America/Fortaleza" }` — o fuso do
  // contexto num campo de endereco web, com `rejected` vazio, porque `url` e um
  // campo legitimo tipado so como string. A fronteira nao podia recusar aquilo.
  // O que faltava era mais cedo: o esquema nao dizia o que os campos SAO.
  //
  // Estes testes guardam a FORMA do pedido. Nenhum deles afirma que o modelo
  // passara a extrair "09:00" e 30 — isso so o QA real diz.
  const schema = buildResponseSchema()
  const patch = schema.properties.patch.properties

  it('nenhum campo do patch fica sem descrição', () => {
    for (const [nome, def] of Object.entries(patch)) {
      expect(typeof def.description, `patch.${nome} sem description`).toBe('string')
      expect(def.description.length, `patch.${nome} com description vazia`).toBeGreaterThan(20)
    }
  })

  it('os campos do topo também são descritos', () => {
    for (const [nome, def] of Object.entries(schema.properties)) {
      expect(typeof def.description, `${nome} sem description`).toBe('string')
      expect(def.description.length).toBeGreaterThan(20)
    }
  })

  it('os campos que o QA confundiu dizem explicitamente o que NÃO são', () => {
    // Nao e superstição: o valor que vazou veio de `now.timezone`, e o unico
    // lugar onde isso pode ser dito ao decodificador e aqui.
    expect(patch.url.description).toMatch(/timezone|fuso/i)
    expect(patch.link.description).toMatch(/timezone|fuso/i)
    expect(patch.start_time.description).toContain('HH:MM')
    expect(patch.end_time.description).toContain('HH:MM')
    expect(patch.alert_at_time.description).toContain('HH:MM')
    expect(patch.date.description).toContain('YYYY-MM-DD')
    expect(patch.alert_minutes_before.description).toMatch(/30/)
    expect(patch.title.description).toMatch(/NAO inclua|nao inclua/i)
  })

  it('o esquema e o contrato têm exatamente os mesmos campos', () => {
    // Paridade nos dois sentidos: campo no contrato sem slot no esquema nunca
    // seria gerado; slot no esquema sem campo no contrato seria descartado na
    // fronteira depois de ter custado tokens.
    expect(Object.keys(patch).sort()).toEqual([...PATCH_FIELD_NAMES].sort())
  })

  it('a ordem de declaração espelha a ordem do system prompt', () => {
    // A documentacao pede que prompt e esquema apresentem os campos na mesma
    // ordem; hoje isso e verdade, e sem este teste continuaria verdade por
    // acaso. Vale como reforco de ordenacao — NAO resolve semantica.
    const prompt = buildSystemPrompt()
    const lista = prompt.slice(prompt.indexOf('patch — apenas estes campos'), prompt.indexOf('REGRAS:'))
    const posicoes = Object.keys(patch).map((n) => {
      const i = lista.search(new RegExp(`\\b${n}\\b`))
      expect(i, `${n} não aparece na lista de campos do prompt`).toBeGreaterThan(-1)
      return i
    })
    expect(posicoes).toEqual([...posicoes].sort((x, y) => x - y))
  })

  it('não viajam palavras-chave OpenAPI não verificadas nesta rota', () => {
    // `format` e `propertyOrdering` sao do tipo `Schema` (caminho
    // generateContent). Aqui e o JSON Schema do response_format da Interactions,
    // e ja carregamos UM keyword nao verificado — `nullable`, mantido porque e
    // o que permite apagar campo numa revisao. Somar mais tornaria um eventual
    // 400 indistinguivel entre suspeitos.
    const texto = JSON.stringify(schema)
    expect(texto).not.toContain('propertyOrdering')
    expect(texto).not.toContain('"format"')
  })

  it('as descrições chegam de fato no corpo enviado ao Gemini', async () => {
    const fetchImpl = vi.fn(async () => respostaGemini(CRIAR_OK))
    await createGeminiAdapter({ env: ENV({ GEMINI_API_KEY: 'k' }), fetchImpl }).interpret(ENTRADA)
    const enviado = JSON.parse(fetchImpl.mock.calls[0][1].body).response_format.schema
    expect(enviado.properties.patch.properties.url.description).toMatch(/timezone|fuso/i)
    expect(enviado.properties.patch.properties.start_time.description).toContain('HH:MM')
  })
})
