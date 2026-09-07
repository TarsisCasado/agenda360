# ai-interpret — v2

Interpreta uma captura em linguagem natural e devolve **uma leitura estruturada**
no contrato canônico do CP6.1. Não executa nada, não toca no banco, não conhece
services de escrita.

> **Estado: NÃO deployada, e `ai.remote` desligada.** O CP6.2 entregou o código
> e o CP6.3 a compatibilidade com Gemini 3.8 Flash. Nada aqui roda em produção
> nem em Preview até um checkpoint que o autorize explicitamente.

---

## Arquitetura

```
POST /functions/v1/ai-interpret
  │
  ├─ index.ts              handler fino: JWT · rate limit · content-type · tamanho
  │
  ├─ _shared/providers.js  adaptadores HTTP (gemini | openai | anthropic)
  │     └─ _shared/prompt.js   system prompt + response schema + user prompt
  │
  ├─ _shared/interpretTurn.js  miolo puro: sanitiza · chama · valida · loga
  │
  └─ _shared/contract.js   ← a MESMA definição que o front importa
```

**O contrato não é cópia.** `_shared/contract.js` é importado pelo Vite (via
`src/agent/contracts/interpretation.js`, que só reexporta) e pelo Deno. Uma
definição, dois runtimes. O arquivo não tem import nenhum — é o que o torna
resolvível pelos dois sem negociar com bundler. O preço são duas listas
literais (prioridades e status) espelhando `src/lib/constants.js`, vigiadas por
`src/agent/contracts/contract.compat.test.js`: se o domínio mudar e o contrato
não, a suíte fica vermelha.

O miolo é **puro JS testável em Node** — por isso os 27 testes desta Function
rodam na suíte normal, sem rede, sem chave e sem Deno.

## Providers

| | structured output | notas |
|---|---|---|
| **gemini** (default) | ✅ `responseSchema` nativo | menor latência e custo; áudio nativo no futuro |
| **openai** | ✅ `response_format: json_object` | |
| **anthropic** | ⚠️ só via prompt | registrado, não escondido |

Escolha **server-side** por `AI_PROVIDER`. Nunca pelo cliente — quem escolhe o
provider escolhe onde o texto vai parar.

### Modelo

Um lugar só: `MODEL_DEFAULTS` em `_shared/providers.js`, sobrescrevível por env.
Nome de modelo espalhado pelo código é nome que ninguém troca.

| provider | default | env |
|---|---|---|
| gemini | `gemini-3.8-flash` | `GEMINI_MODEL` |
| openai | `gpt-4o-mini` | `OPENAI_MODEL` |
| anthropic | `claude-haiku-4-5-20251001` | `ANTHROPIC_MODEL` |

Os nomes de Gemini Flash mudam com frequência — **e mudaram**: o CP6.2 nasceu com
`gemini-2.0-flash`, que já não é o Flash corrente. O default subiu no CP6.3
porque um default obsoleto é pior que nenhum: se o env falhar, o fallback
silencioso apontaria para um modelo que pode nem responder.

### Raciocínio (`thinkingLevel`)

A família Gemini 3 **ignora** `temperature`, `top_p` e `top_k` — não dá erro,
simplesmente não faz nada. Um parâmetro morto no corpo é pior que ausente:
parece que a determinação está configurada quando não está. Por isso o adaptador
não os envia.

Quem controla isso agora é `generationConfig.thinkingConfig.thinkingLevel`.

| | |
|---|---|
| default | `low` — extrair campos de uma frase curta não é raciocinar sobre um problema; nível alto custa latência dentro do timeout de 8s e dinheiro, sem ler melhor |
| env | `GEMINI_THINKING_LEVEL` |
| valores | `low` · `medium` · `high`. **`minimal` não existe no 3.8** e devolve erro de validação |

OpenAI e Anthropic **mantêm** `temperature: 0` — a depreciação é só da família
Gemini 3.

## Variáveis de ambiente (server-side; **nenhum valor neste repositório**)

| nome | quando |
|---|---|
| `AI_PROVIDER` | opcional — `gemini` (default) · `openai` · `anthropic` |
| `GEMINI_API_KEY` | se `AI_PROVIDER=gemini` |
| `OPENAI_API_KEY` | se `AI_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | se `AI_PROVIDER=anthropic` |
| `GEMINI_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL` | opcionais |
| `GEMINI_THINKING_LEVEL` | opcional — `low` (default) · `medium` · `high` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | injetados pela plataforma |

**Nenhuma variável `VITE_*`.** `VITE_*` é compilada no bundle e vai para o
browser — é exatamente o oposto do que uma chave de API precisa. O CP6.3 removeu
do `.env.example` as entradas mortas `VITE_AI_PROVIDER` e `VITE_AI_API_KEY`:
nenhuma linha do código as lia, mas o arquivo é o primeiro lugar onde alguém
procura o que configurar, e um campo chamado `VITE_AI_API_KEY` convida a colar
uma chave que ficaria pública.

## Contrato

**Entrada** (CP6.1, `contracts/input.js`):

```jsonc
{ "input": { "kind": "text", "text": "...", "media": null },
  "now": { "today", "time", "timezone" },
  "draft": { "intent", "phase", "data": {…} },
  "awaiting": null,
  "categories": ["Reuniao"],        // NOMES, sem ids
  "history": [ …até 6 turnos… ] }
```

Sem dump de tarefas, sem `user_id`, sem ids de categoria. O corte é aplicado
**de novo no servidor** — o cliente pode mentir.

**Saída** (`_shared/contract.js`):

```jsonc
{ "version": 1, "provider": "gemini",
  "turn_kind": "create|revise|confirm|cancel|query|unknown",
  "refers_to_draft": false, "intent": null, "confidence": 0.0,
  "patch": {}, "needs_clarification": false, "clarification": null,
  "ambiguities": [], "rejected": [] }
```

## Segurança

- **JWT do usuário** validado a cada chamada (401 sem ele)
- **ANON key, nunca service role** — esta Function não precisa passar por RLS
- Chaves só no ambiente do servidor; este código nunca vai ao bundle
- Allowlist estrita de intents + schema estrito; campo desconhecido é descartado
  e registrado
- **O texto do usuário é dado, nunca instrução.** O pior que um texto hostil
  consegue é virar o título de uma proposta que a pessoa vê e recusa
- **Erro não carrega mensagem interna** — o cliente recebe só a causa
  classificada; `err.message` pode conter nome de env, URL de provider ou status
  interno
- `AbortController` de 8s; sem ele a Function ficava presa até o limite da
  plataforma

## Rate limit — limitação conhecida

20 req/min por usuário, **em memória**. Cada instância tem o seu contador e ele
**zera no cold start**: isto **não é rate limit distribuído**. É primeira linha
contra repetição acidental e loop no cliente, não contra atacante determinado.

O limite real exigiria contagem persistente por janela — uma migration, que
nenhum destes checkpoints faz. Fica escrito aqui em vez de parecer resolvido.

## Observabilidade

Uma linha JSON por chamada, com **forma, nunca conteúdo**:

```jsonc
{ "fn": "ai-interpret", "outcome": "remote_ok", "provider": "gemini",
  "model": "gemini-3.8-flash", "ms": 812, "text_len": 74, "had_draft": true,
  "turn_kind": "revise", "refers_to_draft": true, "intent": "create_task",
  "patch_fields": ["start_time"], "rejected": [] }
```

`text_len` em vez de `text` é a decisão inteira em miniatura: serve para
diagnosticar, não serve para ler a vida de ninguém. Nunca vão para o log: o
texto da captura, os valores do patch, chaves, nem dado pessoal.

**Outcomes:** `remote_ok` · `remote_invalid` (respondeu, nada útil sobrou) ·
`timeout` · `provider_failure` · `not_configured` · `bad_request`.

## Testar localmente

```bash
npx vitest run supabase/functions/ai-interpret/interpret.test.js
```

27 testes, **sem internet e sem chave** — todo HTTP é mockado. Provam o que
pedimos ao provider e como recebemos cada forma de resposta ruim.

Contra a API real (exige chave, **não faça em CI**):

```bash
supabase functions serve ai-interpret --env-file ./supabase/.env.local
curl -X POST http://localhost:54321/functions/v1/ai-interpret \
  -H "Authorization: Bearer <JWT_DE_USUARIO>" \
  -H "Content-Type: application/json" \
  -d '{"input":{"kind":"text","text":"reuniao amanha as 9h"},
       "now":{"today":"2026-09-08","time":"10:00","timezone":"America/Fortaleza"}}'
```

`supabase/.env.local` não é versionado (`.gitignore`: `.env*`).

## Deploy futuro — **não executado**

Quando um checkpoint autorizar:

```bash
supabase secrets set GEMINI_API_KEY=<valor> --project-ref <ref>
supabase functions deploy ai-interpret --project-ref <ref>
```

⚠️ Deploy **nomeado**: `supabase functions deploy` sem nome pode redeployar
todas. E `secrets set` explícito, **nunca `--env-file`**, que pode substituir a
lista inteira.

Deployar sozinho **não muda nada** no produto: `ai.remote` continua `false` e o
front nunca chama a Function.

## Rollback

```bash
supabase functions delete ai-interpret --project-ref <ref>
supabase secrets unset GEMINI_API_KEY --project-ref <ref>
```

E antes disso, o rollback barato: pôr `ai.remote` em `false`. O
`providerManager` cai no interpretador local, e a captura **nunca se perde** —
ela já está no cofre (CP5.6) antes de qualquer interpretação.
