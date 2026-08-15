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
{ "ok": true, "found": 4, "enqueued": 2, "already_exists": 1, "skipped": 1, "errors": 0 }
```

---

## Agendamento — PRE-CHECK (somente leitura; NAO cria a 0013 ainda)

A decisao aprovada exige, **antes** de qualquer migration 0013, confirmar
`pg_cron` e `pg_net` no banco de producao. **Rode voce mesmo** as consultas
abaixo (read-only) e me informe os resultados. **Nada aqui altera o banco.**

**1) `pg_cron` esta disponivel/instalado?**

```sql
-- extensao disponivel para instalar?
select name, default_version, installed_version
from pg_available_extensions
where name = 'pg_cron';

-- ja instalada?
select extname, extversion from pg_extension where extname = 'pg_cron';
```

**2) `pg_net` esta disponivel/instalado?**

```sql
select name, default_version, installed_version
from pg_available_extensions
where name = 'pg_net';

select extname, extversion from pg_extension where extname = 'pg_net';
```

**3) Vault disponivel (para guardar o segredo sem plaintext no `cron.job`)?**

```sql
select extname, extversion from pg_extension where extname = 'supabase_vault';
-- se instalado, o segredo referenciado por nome:
-- select name from vault.secrets where name = 'reminders_worker_secret';
```

### Se `pg_cron` **e** `pg_net` estiverem disponiveis

Podera ser proposta a **migration 0013** para versionar o agendamento. A
invocacao nativa e segura seria (esboco — **NAO aplicar agora**; o segredo vem
do Vault, nunca em plaintext no `cron.job`):

```sql
-- ESBOCO da 0013 (nao aplicar): agenda um POST a cada minuto.
select cron.schedule(
  'reminders-worker-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url    := 'https://<PROJECT_REF>.functions.supabase.co/reminders-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets
                             where name = 'reminders_worker_secret')
    ),
    body   := '{}'::jsonb
  );
  $$
);
```

Riscos a considerar antes de aplicar:
- **frequencia x custo/tempo**: `* * * * *` (1/min) mantem latencia baixa; o
  batch limita o trabalho por execucao.
- **segredo no cron.job**: usar Vault (`vault.decrypted_secrets`) para nao
  deixar o segredo em texto plano no catalogo `cron.job`.
- **concorrencia**: se duas execucoes se sobrepuserem, a UNIQUE
  (`uq_notifications_reminder_channel`) e o `.eq('sent', false)` no update
  garantem idempotencia sem lock adicional.
- **project ref / URL**: parametro do ambiente, nunca hardcoded no cliente.

### Se `pg_cron` **ou** `pg_net` **NAO** estiverem disponiveis

**PARAR e reportar.** Nao criar GitHub Actions, cron-job.org, Vercel Cron nem
qualquer cron externo — nenhum fallback externo foi autorizado.
