# ai-interpret — v2

Interpreta uma captura em linguagem natural e devolve **uma leitura estruturada**
no contrato canônico do CP6.1. Não executa nada, não toca no banco, não conhece
services de escrita.

> **Estado: deployada em Preview (CP6.3), `ai.remote` ainda `false`.** O CP6.2
> entregou o código, o CP6.3 a compatibilidade com Gemini 3.8 Flash, o CP6.3.1 o
> timeout medido e o CP6.3.3 a migração para a Interactions API. Deployada ela
> não muda nada no produto: o front não a chama enquanto a flag estiver
> desligada, e ligá-la exige um checkpoint próprio. **O código desta migração
> ainda não foi deployado.**

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

O miolo é **puro JS testável em Node** — por isso os 36 testes desta Function
rodam na suíte normal, sem rede, sem chave e sem Deno.

## Providers

| | structured output | notas |
|---|---|---|
| **gemini** (default) | ✅ `response_format.schema` nativo | **Interactions API** — ver abaixo |
| **openai** | ✅ `response_format: json_object` | |
| **anthropic** | ⚠️ só via prompt | registrado, não escondido |

Escolha **server-side** por `AI_PROVIDER`. Nunca pelo cliente — quem escolhe o
provider escolhe onde o texto vai parar.

### Rota: Interactions API, não `generateContent` (CP6.3.3)

O adaptador Gemini fala com **`POST /v1beta/interactions`**, e o modelo vai no
**corpo**, não na URL.

**A razão é factual, medida em 07/09/2026 com a mesma chave e o mesmo modelo:**

| chamada | resultado |
|---|---|
| `GET /v1beta/models/gemini-3.8-flash` | **200** em 1,26s |
| `POST /v1beta/models/…:generateContent` (mínimo, sem schema nem thinking) | **404**, três vezes (~0,5–1,0s) |
| idem, com `?key=` em vez do header | **404** — não era a forma de autenticar |
| `POST /v1beta/interactions` (mínimo) | **200** em 8,26s |

A chave funciona e o modelo existe: o que não respondia era a rota.

**Isto não prova que `generateContent` está quebrado globalmente** — a
documentação oficial diz que ele **continua suportado**. É uma decisão de
compatibilidade com o que este projeto/chave de fato atende, e de usar a API
que o Google recomenda para projetos novos desde jun/2026.

De quebra, o 8,26s de uma chamada *mínima* explica o CP6.3.1 em retrospecto:
8s de timeout nunca teriam bastado nem para "responda ok" — e nem os 15s, como o
QA seguinte mostrou. Ver **Timeout** abaixo.

**Versão REST: `/v1beta/interactions`.** É a que a documentação atual descreve e
a que respondeu 200 no teste real. Não há `/v1beta2/interactions` na
documentação consultada.

**Sem header `Api-Revision`.** Ele existia para pilotar a virada de schema de
maio/2026 — `steps` virou padrão em 26/05 e o antigo `outputs` foi **removido**
em 08/06. Hoje só existe o novo: mandar a revisão antiga não volta atrás, e
fixar a nova é repetir o padrão.

**Stateless: `store: false` explícito.** O default do servidor é *armazenar*, e
silêncio aqui seria consentimento. Rascunho e histórico continuam viajando no
**nosso** contrato de entrada; não usamos `previous_interaction_id`.

> ⚠️ **Verificado por documentação, ainda não por chamada real.** O ambiente de
> desenvolvimento tem `ai.google.dev` bloqueado por política de egresso, então
> o formato foi montado a partir da documentação pesquisada, não de páginas
> abertas.
>
> **Confirmado por chamada real em 07/09/2026 (CP6.3.3.1): HTTP 200.** A resposta
> veio em `steps[] → model_output → content[] → text`, exatamente como o parser
> espera. Ficam validados na prática: a rota, `response_format` como **objeto**
> (não array), `system_instruction` como string, `thinking_level: low`,
> `max_output_tokens: 1024` e o structured output.

### Teto de saída

`max_output_tokens` = **1024** (`DEFAULT_MAX_OUTPUT_TOKENS`, env
`GEMINI_MAX_OUTPUT_TOKENS`). Nosso JSON inteiro cabe em ~300 tokens; o modelo
tem 64k disponíveis, e 64k de corda é o que transforma uma geração ruim num
timeout indistinguível de queda. Antes do CP6.3.3 não havia teto nenhum.

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

Quem controla isso agora é `generation_config.thinking_level`.

| | |
|---|---|
| default | `low` — extrair campos de uma frase curta não é raciocinar sobre um problema; nível alto custa latência dentro do timeout e dinheiro, sem ler melhor |
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
| `GEMINI_MAX_OUTPUT_TOKENS` | opcional — inteiro; default 1024 |
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

A resposta da Interactions API é uma **linha do tempo de passos**, não um
`candidates[0]`: pensamento, chamadas de ferramenta e, no fim, o `model_output`.
`extrairModelOutput()` pega exatamente esse passo e o texto dentro dele; sem ele,
é falha de provider — não se inventa resposta. Daí o JSON segue pelo **mesmo**
`parseInterpretation` de sempre.

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
- Nada da captura fica no provider: `store: false` explícito
- `AbortController` de 30s (`DEFAULT_TIMEOUT_MS`); sem ele a Function ficava
  presa até o limite da plataforma

## Timeout — 30s, e é um curativo

Um só lugar: `DEFAULT_TIMEOUT_MS` em `_shared/providers.js`, herdado pelos três
adaptadores. Cada valor que ele teve saiu de uma medida, e cada medida derrubou
a estimativa anterior:

| | valor | por quê |
|---|---|---|
| CP6.2 | 8s | estimativa pura — "o dobro de uma resposta de Flash", escrita antes de existir qualquer medida |
| CP6.3.1 | 15s | o QA real cortou **2 de 3** chamadas no nosso próprio limite (~9,1s e ~8,4s). Só depois se descobriu que aquelas chamadas iam para `:generateContent`, que respondia **404** a esta chave |
| CP6.3.3.1 | **30s** | o QA real da rota **certa** devolveu **200 válido em 23,88s** |

O dado que importa dessa última medida não é o tempo: é o que veio junto.
**`total_thought_tokens: 0`** e **`total_output_tokens: 26`** — quase 24 segundos
para produzir 26 tokens sem pensar nada. A lentidão não está no tamanho do nosso
pedido, nem no esquema, nem no esforço do modelo.

**30s é teto de segurança, não solução de performance.** Existe para não cortar
uma resposta que estava chegando, e nada além disso. Não é um alvo aceitável:
24 segundos de espera não cabem numa captura de agenda. O que fazer a respeito —
fallback local, resposta otimista, streaming, outro modelo, outra região — é
assunto de um checkpoint próprio, com amostra de várias chamadas em vez de uma.
Até lá, o número é curativo, e está escrito aqui que é.

**Sem retry.** Repetir uma chamada de 24s dobra a espera para tentar consertar o
que não é falha transitória.

30s segue abaixo do limite de execução da plataforma, então o `AbortController`
continua fazendo o que importa: a Function termina por decisão nossa, com
`outcome=timeout` no log, em vez de ficar presa.

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

36 testes, **sem internet e sem chave** — todo HTTP é mockado. Provam o que
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
