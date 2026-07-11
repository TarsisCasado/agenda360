// ===========================================================================
// Edge Function: ai-interpret
// Interpreta texto em linguagem natural -> UMA acao proposta (estruturada).
//
// Seguranca:
//   - valida o JWT do usuario (401 se ausente/invalido);
//   - limita o tamanho do texto e sanitiza a entrada;
//   - rate limiting basico por usuario (best-effort, em memoria);
//   - allowlist ESTRITA de intents;
//   - NUNCA executa SQL nem ferramentas; apenas devolve uma proposta;
//   - chaves de IA ficam em variaveis de ambiente do servidor (nunca no front).
//
// NAO ATIVA por padrao: o frontend so chama esta funcao quando a flag
// `ai.remote` estiver ligada. Sem credenciais, retorna 500 e o front cai no mock.
//
// Deploy: supabase functions deploy ai-interpret
// Secrets necessarios (ver README): AI_PROVIDER, OPENAI_API_KEY | ANTHROPIC_API_KEY
// ===========================================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ALLOWED_INTENTS = [
  'create_task', 'update_task', 'reschedule_task', 'complete_task', 'mark_missed',
  'cancel_task', 'delete_task', 'search_tasks', 'create_link', 'list_schedule',
]
const MAX_TEXT = 1000
const RATE_LIMIT = { windowMs: 60_000, max: 20 } // 20 req/min por usuario

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Rate limiting best-effort (reinicia a cada cold start; suficiente como 1a linha).
const hits = new Map<string, number[]>()
function rateLimited(userId: string): boolean {
  const now = Date.now()
  const arr = (hits.get(userId) || []).filter((t) => now - t < RATE_LIMIT.windowMs)
  arr.push(now)
  hits.set(userId, arr)
  return arr.length > RATE_LIMIT.max
}

function sanitize(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, " ") // remove caracteres de controle
    .slice(0, MAX_TEXT)
    .trim()
}

// Sistema: instrui o modelo a devolver SOMENTE JSON valido no contrato.
const SYSTEM_PROMPT = `Voce e um interpretador de comandos de agenda. Devolva SOMENTE um JSON valido, sem texto extra, no formato:
{"intent": string, "confidence": number (0..1), "needs_clarification": boolean, "clarification": string|null, "data": object, "ambiguities": string[]}
intent DEVE ser um de: ${ALLOWED_INTENTS.join(', ')} ou "unknown".
Regras: use o timezone e a data de hoje fornecidos no contexto; "amanha"/"sexta" sao relativos a hoje; NUNCA invente datas ambiguas; horario sem periodo (ex.: "as 8") deve marcar ambiguities:["horario"] e needs_clarification:true; nao proponha acoes em massa; baixa confianca -> needs_clarification:true. Nunca gere SQL nem comandos. data deve conter apenas campos da acao (title, date (YYYY-MM-DD), start_time (HH:MM), priority, category_id, url, query, task_id, notes) conforme o intent.`

async function callOpenAI(text: string, context: unknown): Promise<Record<string, unknown>> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY ausente')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Contexto: ${JSON.stringify(context)}\nComando: ${text}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.choices?.[0]?.message?.content || '{}')
}

async function callAnthropic(text: string, context: unknown): Promise<Record<string, unknown>> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY ausente')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Contexto: ${JSON.stringify(context)}\nComando: ${text}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const json = await res.json()
  const raw = json.content?.[0]?.text || '{}'
  return JSON.parse(raw)
}

// Valida a saida do modelo contra o contrato (defesa contra prompt injection).
function validateResult(r: Record<string, unknown>) {
  const intent = typeof r.intent === 'string' && ALLOWED_INTENTS.includes(r.intent as string)
    ? (r.intent as string)
    : 'unknown'
  const confidence = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.3
  return {
    intent,
    confidence,
    needs_clarification: Boolean(r.needs_clarification) || intent === 'unknown',
    clarification: typeof r.clarification === 'string' ? r.clarification : null,
    data: r.data && typeof r.data === 'object' ? r.data : {},
    ambiguities: Array.isArray(r.ambiguities) ? r.ambiguities : [],
    provider: 'remote',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // 1) Autenticacao — valida JWT do usuario.
    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return json({ error: 'unauthorized' }, 401)

    // 2) Rate limiting.
    if (rateLimited(userData.user.id)) return json({ error: 'rate_limited' }, 429)

    // 3) Entrada.
    const body = await req.json().catch(() => ({}))
    const text = sanitize(String(body.text || ''))
    if (!text) return json({ error: 'empty_text' }, 400)
    const context = body.context && typeof body.context === 'object' ? body.context : {}

    // 4) Provider.
    const provider = Deno.env.get('AI_PROVIDER') || 'openai'
    const raw = provider === 'anthropic'
      ? await callAnthropic(text, context)
      : await callOpenAI(text, context)

    // 5) Valida a saida contra o contrato e devolve APENAS a proposta.
    return json(validateResult(raw))
  } catch (err) {
    // Sem credenciais/erro do provider -> 500; o frontend cai no mock.
    return json({ error: 'interpret_failed', detail: String((err as Error)?.message || err) }, 500)
  }
})
