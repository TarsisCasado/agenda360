// ===========================================================================
// Edge Function: ai-interpret — v2 (CP6.2)
// ---------------------------------------------------------------------------
// Interpreta uma captura em linguagem natural e devolve UM objeto no contrato
// canonico do CP6.1. Nao executa nada, nao toca no banco, nao conhece services
// de escrita: devolve uma leitura, e quem decide o que fazer com ela e o
// aplicativo — depois de validar de novo e de pedir confirmacao a pessoa.
//
// HANDLER FINO DE PROPOSITO. Autentica, limita, delega. Toda a logica vive em
// `_shared/interpretTurn.js` (pura, testavel em Node sem rede e sem Deno), e os
// adaptadores de provider em `_shared/providers.js`. Foi assim que os testes
// deste checkpoint couberam na suite normal.
//
// O CONTRATO NAO E COPIA. `_shared/contract.js` e o MESMO arquivo que o front
// importa — uma definicao so, dois runtimes. Ver o cabecalho de la.
//
// -------------------- SEGURANCA --------------------------------------------
//   . JWT do usuario validado a cada chamada (401 sem ele);
//   . ANON key, NUNCA service role — esta funcao nao precisa passar por RLS;
//   . allowlist estrita de intents e schema estrito (contract.js);
//   . chaves de provider so no ambiente do servidor, nunca no bundle;
//   . o texto do usuario e DADO: nao vira instrucao, nao vira acao, nao vira
//     SQL. O pior que um texto hostil consegue e virar o titulo de uma proposta
//     que a pessoa vai ver e recusar;
//   . o erro devolvido ao cliente NAO carrega mensagem interna — so a causa
//     classificada. O detalhe fica no log do servidor.
//
// -------------------- ENV (apenas NOMES) -----------------------------------
//   AI_PROVIDER            gemini | openai | anthropic   (default: gemini)
//   GEMINI_API_KEY         quando AI_PROVIDER=gemini
//   OPENAI_API_KEY         quando AI_PROVIDER=openai
//   ANTHROPIC_API_KEY      quando AI_PROVIDER=anthropic
//   GEMINI_MODEL / OPENAI_MODEL / ANTHROPIC_MODEL   (opcionais; ver providers.js)
//   SUPABASE_URL, SUPABASE_ANON_KEY                 (injetados pela plataforma)
// NENHUM valor e commitado. Ver README.md.
//
// NAO ESTA DEPLOYADA e `ai.remote` continua desligada (CP6.2 e so codigo).
// Deploy: supabase functions deploy ai-interpret
// ===========================================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { interpretTurn, OUTCOME } from '../_shared/interpretTurn.js'
import { pickProvider, ProviderError } from '../_shared/providers.js'

const MAX_BODY_BYTES = 16_000

// Rate limit best-effort, em memoria.
//
// LIMITACAO CONHECIDA E DECLARADA: cada instancia tem o seu contador e ele
// zera no cold start, entao isto NAO e rate limit distribuido — e uma primeira
// linha contra repeticao acidental e contra um loop no cliente, nao contra um
// atacante determinado. O limite real seria uma tabela com contagem por
// janela, e isso e uma migration; o CP6.2 nao cria banco. Fica escrito aqui e
// no README em vez de parecer resolvido.
const RATE = { windowMs: 60_000, max: 20 }
const hits = new Map<string, number[]>()
function rateLimited(userId: string): boolean {
  const now = Date.now()
  const arr = (hits.get(userId) || []).filter((t) => now - t < RATE.windowMs)
  arr.push(now)
  hits.set(userId, arr)
  return arr.length > RATE.max
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Content-type e tamanho ANTES de ler o corpo: nao se gasta memoria com o que
  // ja se sabe que sera recusado.
  const ct = req.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return json({ error: 'unsupported_media_type' }, 415)
  const declarado = Number(req.headers.get('content-length') || 0)
  if (declarado > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)

  try {
    // 1) Autenticacao — JWT do usuario, com a ANON key. Sem service role.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return json({ error: 'unauthorized' }, 401)

    // 2) Rate limit (ver limitacao acima).
    if (rateLimited(userData.user.id)) return json({ error: 'rate_limited' }, 429)

    // 3) Corpo.
    const texto = await req.text()
    if (texto.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
    let body: unknown
    try {
      body = JSON.parse(texto)
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    // 4) Provider (escolhido server-side) e interpretacao.
    const provider = pickProvider(Deno.env)
    const { status, payload } = await interpretTurn({
      body,
      provider,
      // Uma linha por chamada, so com FORMA — nunca o texto da captura, nunca
      // dado pessoal, nunca chave.
      log: (entry) => console.log(JSON.stringify({ fn: 'ai-interpret', ...entry })),
    })
    return json(payload, status)
  } catch (err) {
    const cause = err instanceof ProviderError ? err.cause : 'unexpected'
    console.log(JSON.stringify({
      fn: 'ai-interpret',
      outcome: cause === 'not_configured' ? OUTCOME.NOT_CONFIGURED : OUTCOME.PROVIDER,
      cause,
      detail: String((err as Error)?.message || err).slice(0, 200),
    }))
    // O cliente recebe a CAUSA, nunca a mensagem: `err.message` pode conter
    // nome de env, URL de provider ou status interno.
    return json({ error: 'interpret_failed', outcome: OUTCOME.PROVIDER }, 502)
  }
})
