# push-delivery-worker (Sprint 2 / Etapa 1D — DELIVERY)

Edge Function que entrega `notifications` com `channel = 'push'` e
`status = 'pending'` como **notificacoes nativas do navegador/SO**, via Web
Push (RFC 8030) cifrado (RFC 8291, `aes128gcm`) e assinado com VAPID
(RFC 8292). **NAO cria** reminders nem notifications — isso continua sendo
responsabilidade exclusiva do `reminders-worker` (funcao separada, intacta).

- `webPush.ts` — protocolo Web Push puro (VAPID + cifra do payload), so com
  Web Crypto API nativa (`crypto.subtle`), sem nenhuma lib externa (esm.sh ou
  npm): mesmo codigo roda em Deno (producao) e em Node (testes).
- `deliver.ts` — logica pura de entrega (claim idempotente, envio, retry,
  desativacao de subscription expirada). Testavel em Node, sem rede/Deno.
- `index.ts` — handler HTTP fino: autentica o agendador, monta o client
  `service_role` e os secrets do VAPID, serializa os contadores.
- `webPush.test.js` / `deliver.test.js` — testes deterministicos (relogio
  fixo, `fetch`/`db` fake).

> **Estado da etapa:** o codigo esta versionado, mas a Function **nao foi
> deployada**, os segredos **nao foram configurados** e o agendamento
> (migration 0016) **nao foi criado**. Este README descreve o que sera feito
> na etapa de operacionalizacao.

---

## Elegibilidade

```
channel = 'push' AND scheduled_for <= now() AND (
  status = 'pending'
  OR (status = 'processing' AND claimed_at < now() - PUSH_WORKER_STALE_MINUTES)
)
```

A segunda condicao recupera notifications cujo processamento anterior morreu
no meio (timeout/crash da Function) sem chegar a `sent`/`failed`/`pending`.
Ordenadas por `scheduled_for ASC`, limitadas a um lote
(`PUSH_WORKER_BATCH`, default 50).

## Ordem de entrega (evita envio duplicado)

1. **CLAIM atomico**: `UPDATE notifications SET status='processing',
   claimed_at=now(), attempts=attempts+1 WHERE id=:id AND attempts=:attempts_lido
   AND (pending OU processing-estagnado)`. So quem ganha a corrida do UPDATE
   processa; a outra execucao concorrente recebe 0 linhas afetadas e pula
   (`skipped`, observavel). Guarda otimista dupla: condicao de estado +
   `attempts` lido no mesmo request.
2. **SO ENTAO** enviamos o push — e o unico passo com efeito colateral
   irreversivel (não pode ser refeito "de graça").
3. Uma `notification` pode ter **N subscriptions** (multi-dispositivo). Sucesso
   em **pelo menos uma** marca a notification inteira como `sent`. Uma
   subscription que responde `404`/`410` e **desativada** (`disabled_at`)
   independente do resultado das demais.
4. Sem sucesso em nenhuma: `attempts < PUSH_WORKER_MAX_ATTEMPTS` volta para
   `pending` (proxima execucao tenta de novo); atingiu o maximo -> `failed`
   com `last_error` preenchido (nunca payload sensivel).

## Payload entregue ao navegador (antes de cifrar)

```json
{
  "title": "Agenda 360",
  "body": "<task.title>\n<HH:MM> • <categoria>",
  "icon": "/favicon.svg",
  "badge": "/favicon.svg",
  "tag": "agenda360-notification-<notification.id>",
  "data": { "url": "/dia?date=...&task=...", "taskId": "...", "notificationId": "..." }
}
```

Sempre com dados REAIS da task (join em `tasks`/`categories`, service_role).
`data.url` e usado pelo `notificationclick` no Service Worker do frontend
para abrir/focar a atividade correspondente.

---

## Segredos / variaveis de ambiente (apenas NOMES — nunca valores)

| Nome                        | Onde                       | Uso |
| --------------------------- | -------------------------- | --- |
| `SUPABASE_URL`               | injetado pela plataforma   | endpoint |
| `SUPABASE_SERVICE_ROLE_KEY`  | secret da Function (backend-only) | client que bypassa RLS (le/atualiza notifications, tasks, push_subscriptions de qualquer usuario) |
| `PUSH_WORKER_SECRET`         | secret da Function **+ Vault** | segredo dedicado do agendador, **!= service_role e != REMINDERS_WORKER_SECRET** |
| `VAPID_PUBLIC_KEY`           | secret da Function | chave publica VAPID (nao secreta em si, mas mantida como secret por simetria; a MESMA string vai para o frontend como `VITE_VAPID_PUBLIC_KEY`) |
| `VAPID_PRIVATE_KEY`          | secret da Function | chave privada VAPID — **NUNCA** sai do backend, **NUNCA** em `VITE_*` |
| `VAPID_SUBJECT`              | secret/env da Function | contato do operador (`mailto:...` ou `https://...`), exigido pela RFC 8292 |
| `PUSH_WORKER_BATCH`          | secret/env da Function (opcional) | tamanho do lote (default 50) |
| `PUSH_WORKER_MAX_ATTEMPTS`   | secret/env da Function (opcional) | tentativas antes de `failed` (default 5) |

Regras (mesmas do `reminders-worker`): `service_role` e os segredos **nunca**
vao para `src/`, **nunca** em `VITE_*` (exceto a chave PUBLICA do VAPID, que
e feita para ser publica), **nunca** commitados, **nunca** logados, **nunca**
retornados na resposta.

## Geracao das chaves VAPID (uma vez, na operacionalizacao)

```ts
// executar localmente (Deno ou Node 19+, nao entra no repo):
import { generateVapidKeys } from './webPush.ts'
const { publicKey, privateKey } = await generateVapidKeys()
// publicKey  -> VITE_VAPID_PUBLIC_KEY (Vercel) + VAPID_PUBLIC_KEY (Function secret)
// privateKey -> VAPID_PRIVATE_KEY (Function secret) — NUNCA imprimir/commitar
```

## Autenticacao (mesmo padrao aprovado do reminders-worker)

Guard efetivo: header **`x-push-worker-secret`** com o `PUSH_WORKER_SECRET`,
comparado em **tempo constante**. Sem o segredo -> `401`, sem tocar o banco.
Deploy:

```bash
supabase functions deploy push-delivery-worker --no-verify-jwt
```

## Contrato HTTP

`POST` (outros metodos -> `405`), header `x-push-worker-secret: <segredo>`.
Resposta (somente contadores — nunca secrets/payload sensivel):

```json
{ "ok": true, "found": 3, "sent": 2, "retried": 0, "failed": 0, "skipped": 1, "disabled_subscriptions": 1, "errors": 0 }
```

---

## Agendamento — migration 0016 (`0016_push_delivery_scheduler.*`)

Mesmo padrao **two-phase** do `reminders-worker` (0013): o job
`agenda360-push-delivery-worker` **nasce INATIVO**; ativacao e passo manual e
deliberado, so depois que a Function existe, responde e os segredos do Vault
estao configurados. Frequencia `* * * * *` (1/min) — mesma cadencia do
`reminders-worker`; latencia maxima ~60s, aceitavel para lembretes.

### Configuracao manual em producao (fora do Git) — nomes, nunca valores

```sql
select vault.create_secret('<URL_DA_FUNCTION>',  'push_worker_url',    'URL da Edge Function push-delivery-worker');
select vault.create_secret('<SEGREDO_DEDICADO>', 'push_worker_secret', 'Segredo do header x-push-worker-secret');
```

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
supabase secrets set PUSH_WORKER_SECRET="<mesmo segredo do Vault>"
supabase secrets set VAPID_PUBLIC_KEY="..."
supabase secrets set VAPID_PRIVATE_KEY="..."
supabase secrets set VAPID_SUBJECT="mailto:..."
supabase functions deploy push-delivery-worker --no-verify-jwt
```

### Ordem segura de implantacao

1. gerar as chaves VAPID (uma vez; NUNCA logar a privada);
2. configurar os secrets da Function (passo acima);
3. `supabase functions deploy push-delivery-worker --no-verify-jwt`;
4. smoke test: `POST` com header correto -> `200 {ok:true,...}`; header errado -> `401`;
5. aplicar `0015_notifications_claim_tracking.*` (coluna `claimed_at`) e
   `0016_push_delivery_scheduler.precheck.sql`;
6. aplicar `0016_push_delivery_scheduler.sql` (cria o job INATIVO);
7. aplicar `0016_push_delivery_scheduler.verify.sql` (fase A: INATIVO + OK);
8. **ativar manualmente**:
   ```sql
   select cron.alter_job(
     (select jobid from cron.job where jobname = 'agenda360-push-delivery-worker'),
     active := true
   );
   ```
9. aplicar `0016_push_delivery_scheduler.post_activation_verify.sql` (fase B: ATIVO + OK);
10. observar `cron.job_run_details` e confirmar entregas reais.

### Rollback

`0016_push_delivery_scheduler.rollback.sql` remove **apenas** o job
`agenda360-push-delivery-worker`. Nao toca no Vault, em notifications,
push_subscriptions ou no `reminders-worker`.
