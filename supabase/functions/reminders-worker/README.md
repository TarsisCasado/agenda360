# reminders-worker (Sprint 2 / Etapa 1C — ENQUEUE)

Edge Function que transforma **reminders vencidos** em **notifications** com
`status = 'pending'`. **NAO entrega nada** (WhatsApp/push/email/voz sao etapas
futuras). A entrega vive exclusivamente em `notifications.status`.

- `worker.ts` — logica pura de enqueue (testavel em Node, sem rede/Deno).
- `index.ts` — handler HTTP fino: autentica o agendador, monta o client
  `service_role` e serializa os contadores.
- `worker.test.js` — 27 cenarios (elegibilidade, snapshot, legado, ordem,
  idempotencia 23505, batch, observabilidade), relogio deterministico.

> **Estado da etapa:** o codigo esta versionado, mas a Function **nao foi
> deployada**, os segredos **nao foram configurados** e o agendamento
> (migration 0013) **nao foi criado**. Este README descreve o que sera feito
> na etapa de operacionalizacao — nada aqui deve ser executado automaticamente.

---

## Semantica de `reminders.sent` (decisao aprovada)

`sent = true` significa **"reminder JA foi PROCESSADO/ENFILEIRADO"** — a
notification correspondente ja existe. **Nao** significa entrega ao usuario.

Ordem obrigatoria (nunca inverter):

1. garantir/criar a `notification` (idempotente via `uq_notifications_reminder_channel`);
2. **so entao** marcar `reminder.sent = true`.

Se o processo cair entre 1 e 2, a proxima execucao converge pela UNIQUE
(`23505` tratado como `already_exists`), sem duplicar. O estado
"`sent=true` sem notification" e impossivel por construcao.

## Elegibilidade

Um reminder e processado somente quando:

```
sent = false  AND  cancelled_at IS NULL  AND  remind_at <= now()
```

Ordenados por `remind_at ASC` (mais antigos primeiro), limitados a um lote
(`REMINDERS_WORKER_BATCH`, default 100). Legados sem `recipient_id` sao
`skipped` (observaveis) e **permanecem nao processados** — sem criar
notification destinada a `NULL` e sem inventar destinatario a partir da task.

## Snapshot da notification (herdado DIRETO do reminder)

| notification    | origem              |
| --------------- | ------------------- |
| `reminder_id`   | `reminder.id`       |
| `workspace_id`  | `reminder.workspace_id` |
| `task_id`       | `reminder.task_id` (pode ser NULL) |
| `user_id`       | `reminder.recipient_id` |
| `channel`       | `reminder.type`     |
| `scheduled_for` | `reminder.remind_at`|
| `status`        | `'pending'`         |
| `payload`       | `{}` (minimo, sem dados sensiveis) |

Nada e recalculado a partir da task.

---

## Segredos / variaveis de ambiente (apenas NOMES — nunca valores)

| Nome                        | Onde                       | Uso |
| --------------------------- | -------------------------- | --- |
| `SUPABASE_URL`              | injetado pela plataforma   | endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | secret da Function (backend-only) | client que bypassa RLS para inserir em `notifications` (a role `authenticated` e SELECT-only, migration 0011) |
| `REMINDERS_WORKER_SECRET`   | secret da Function **+ Vault** | segredo dedicado do agendador, **!= service_role** |
| `REMINDERS_WORKER_BATCH`    | secret/env da Function (opcional) | tamanho do lote (default 100) |
| `PUSH_WORKER_SECRET`        | **ja existe** como secret do projeto (usado pelo `push-delivery-worker`) | reaproveitado SOMENTE para o disparo imediato best-effort (ver abaixo); sem ele, o disparo e pulado e o cron do push continua entregando normalmente |
| `PUSH_WORKER_URL`           | secret/env da Function (opcional) | URL do `push-delivery-worker`; default `${SUPABASE_URL}/functions/v1/push-delivery-worker` |

Regras (aprovadas): `service_role` e o segredo **nunca** vao para `src/`,
**nunca** em `VITE_*`, **nunca** commitados, **nunca** logados, **nunca**
retornados na resposta. Configurados apenas como secret da Function / Vault.

Configuracao (executar manualmente na etapa de operacionalizacao — **nao agora**):

```bash
# valores reais NUNCA entram no repositorio
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."   # do painel Supabase
supabase secrets set REMINDERS_WORKER_SECRET="$(openssl rand -hex 32)"
# opcional:
supabase secrets set REMINDERS_WORKER_BATCH="100"
```

## Autenticacao (decisao aprovada — por que `verify_jwt = false`)

Quem invoca e o **agendador** (pg_cron via pg_net), nao um usuario logado —
nao ha JWT de usuario a validar. Alem disso, `verify_jwt = true` so exigiria a
**anon key**, que e **publica** (vai no frontend); portanto `verify_jwt`
sozinho **nao e** um guard de autorizacao real aqui.

Guard efetivo: header **`x-reminders-secret`** com o `REMINDERS_WORKER_SECRET`,
comparado em **tempo constante** (evita timing attack). Sem o segredo -> `401`,
sem tocar o banco. Deploy (manual, depois):

```bash
supabase functions deploy reminders-worker --no-verify-jwt
```

## Contrato HTTP

`POST` (outros metodos -> `405`), header `x-reminders-secret: <segredo>`.
Resposta (somente contadores + ids tecnicos — nunca secrets/payload sensivel):

```json
{ "ok": true, "found": 4, "enqueued": 2, "already_exists": 1, "skipped": 1, "errors": 0, "push_enqueued": 1, "push_delivery_triggered": true }
```

## Disparo imediato do push-delivery-worker (Etapa 1E — latencia)

O cron do `push-delivery-worker` (0016) roda 1/min — ate 60s de latencia entre
a `notification` nascer `pending` e ser entregue. Quando ESTA execucao cria
`notification`(s) de `channel='push'` **novas** (`push_enqueued > 0`, ver
`worker.ts`), o `reminders-worker` chama o `push-delivery-worker`
IMEDIATAMENTE apos o enqueue, via `maybeTriggerPushDelivery`.

Garantias (por construcao, testadas em `trigger.test.js`):

- **best-effort**: qualquer falha (rede, timeout 5s, 401, 5xx) e engolida;
  NUNCA faz o `reminders-worker` retornar erro;
- **nunca marca `notification` como `failed`**: este disparo nao toca em
  `notifications`/`reminders` — quem decide o status da entrega continua
  sendo exclusivamente o claim atomico do `push-delivery-worker`;
- **nao aumenta a frequencia dos crons**: e uma chamada HTTP pontual, nao um
  novo agendamento; o cron de 1/min continua sendo o fallback/retry;
- **no maximo 1 chamada por execucao**, mesmo com N `notification`s de push
  no mesmo lote (o `push-delivery-worker` ja processa em lote).

A protecao contra ENTREGA duplicada (disparo imediato e cron concorrendo no
mesmo minuto) continua sendo o claim atomico do `push-delivery-worker`
(`deliver.ts`), intocado por esta mudanca.

---

## Agendamento — migration 0013 (`0013_reminders_scheduler.*`)

O agendamento e versionado em `supabase/migrations/0013_reminders_scheduler.*`
(precheck / sql / verify / post_activation_verify / rollback). **Precheck de
producao ja executado** (2026-08): `pg_cron` 1.6.4 e `pg_net` 0.20.3
disponiveis; `supabase_vault` 0.3.1 instalado. Arquitetura viavel:

```
cron.job (agenda360-reminders-worker, * * * * *, INATIVO ate ativacao manual)
  -> le URL e segredo do Vault POR NOME (nunca literais no command)
  -> net.http_post(url, headers{ x-reminders-secret }, body '{}')  (fire-and-forget)
    -> Edge Function reminders-worker (verify_jwt=false)
       -> valida x-reminders-secret (tempo constante)
       -> client service_role (nunca sai da Function) -> enqueue
```

### Desenho em duas fases (o job NASCE INATIVO)

A 0013 **cria o job desativado** (`active=false`). A ativacao e uma acao
**manual e deliberada**, feita so depois que a Function existe e responde. Isso
impede um job ativo apontando para uma Function ainda nao publicada/sem segredo.

- **Fase A** (logo apos aplicar a 0013): `verify.sql` exige o job existindo,
  correto e **INATIVO**. Um job ativo aqui e FALHA.
- **Fase B** (apos ativacao manual): `post_activation_verify.sql` exige o job
  **ATIVO**. Um job inativo aqui e FALHA. Os dois nunca aceitam ambos os
  estados como validos.

### Segredos no Vault (valores NUNCA vao para o Git)

Dois segredos, **configurados manualmente em producao** e referenciados **so
por nome** no command do cron:

| Nome no Vault              | Valor (so em producao)                                         |
| -------------------------- | ------------------------------------------------------------- |
| `reminders_worker_url`     | `https://<project-ref>.supabase.co/functions/v1/reminders-worker` |
| `reminders_worker_secret`  | segredo dedicado (== env `REMINDERS_WORKER_SECRET` da Function) |

Guardar a URL no Vault e o padrao oficialmente mostrado pelo Supabase para
agendar Functions: nao ha GUC nativo confiavel com o project-ref, e assim a
**mesma migration roda em qualquer ambiente** (cada Vault carrega seus valores)
sem project-ref hardcoded no repositorio.

### Contexto de execucao × Vault

O job roda com o papel que o **agendou** (aplique a 0013 como `postgres`).
`postgres` ja tem `SELECT` em `vault.decrypted_secrets` (a view e restrita;
`anon`/`authenticated` nao leem). O command le o segredo em tempo de execucao
com esse privilegio — **sem grants novos e sem ampliar exposicao do Vault**. O
precheck confirma `has_table_privilege(current_user, 'vault.decrypted_secrets',
'SELECT')` e o verify confirma o dono do job.

### Configuracao manual em producao (fora do Git) — nomes, nunca valores

```sql
-- 1) segredos no Vault (SUBSTITUA os valores; nao commitar):
select vault.create_secret('<URL_DA_FUNCTION>',    'reminders_worker_url',    'URL da Edge Function reminders-worker');
select vault.create_secret('<SEGREDO_DEDICADO>',   'reminders_worker_secret', 'Segredo do header x-reminders-secret');
-- se ja existirem, use vault.update_secret(id, '<valor>', nome, descricao).
```

```bash
# 2) secrets/env da Function (valores reais, nunca no Git):
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
supabase secrets set REMINDERS_WORKER_SECRET="<mesmo segredo do Vault>"
# opcional:
supabase secrets set REMINDERS_WORKER_BATCH="100"

# 3) deploy (verify_jwt desligado — auth e o segredo dedicado):
supabase functions deploy reminders-worker --no-verify-jwt
```

### Ordem segura de implantacao

1. criar os 2 segredos no Vault (passo 1 acima);
2. configurar os secrets/env da Function (passo 2);
3. `supabase functions deploy reminders-worker --no-verify-jwt`;
4. smoke test: `POST` com header correto -> `200 {ok:true,...}`; header errado -> `401`;
5. aplicar `0013_reminders_scheduler.precheck.sql` e conferir os vereditos;
6. aplicar `0013_reminders_scheduler.sql` (cria o job INATIVO);
7. aplicar `0013_reminders_scheduler.verify.sql` (fase A: exige INATIVO + OK);
8. **ativar manualmente** o job:
   ```sql
   select cron.alter_job(
     (select jobid from cron.job where jobname = 'agenda360-reminders-worker'),
     active := true
   );
   ```
9. aplicar `0013_reminders_scheduler.post_activation_verify.sql` (fase B: exige ATIVO + OK);
10. observar `cron.job_run_details` e `net._http_response`; confirmar enqueue real.

### Frequencia — 1/min (`* * * * *`)

Latencia maxima ~60 s (aceitavel); batch default 100 drena o volume tipico e o
excedente cai no minuto seguinte (elegibilidade e `remind_at <= now()`, nao uma
janela — nada se perde se um tick atrasar). `net.http_post` e fire-and-forget:
o command retorna em ms, entao sobreposicao de ticks e improvavel; mesmo que
duas invocacoes coincidam, a UNIQUE `uq_notifications_reminder_channel` + o
`.eq('sent', false)` garantem idempotencia sem lock.

### Rollback

`0013_reminders_scheduler.rollback.sql` remove **apenas** o job
`agenda360-reminders-worker`. **Nao** faz `DROP EXTENSION`, **nao** remove
segredos do Vault, **nao** toca reminders/notifications/dados.
