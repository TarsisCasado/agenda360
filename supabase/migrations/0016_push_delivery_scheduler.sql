-- ===========================================================================
-- MIGRATION 0016 — AGENDADOR do push-delivery-worker (Sprint 2 / Etapa 1D)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, rode o .precheck.sql, depois aplique
-- no SQL Editor do Supabase COMO postgres (mesmo papel/motivo da 0013).
--
-- OBJETIVO
--   Versionar a infraestrutura de agendamento:
--     pg_cron (tick 1/min) -> pg_net (HTTP POST) -> Edge Function push-delivery-worker
--   O worker (Etapa 1D) entrega notifications(channel='push', pending) como
--   Web Push nativo. Espelha EXATAMENTE o padrao da 0013 (reminders-worker),
--   com nome/segredos/job PROPRIOS — os dois jobs sao independentes.
--
-- O QUE ESTA MIGRATION FAZ
--   1. create extension if not exists pg_cron / pg_net (idempotente; ja
--      instaladas pela 0013 se aplicada antes — no-op nesse caso);
--   2. (re)cria 1 job de nome ESTAVEL 'agenda360-push-delivery-worker',
--      schedule '* * * * *', cujo COMMAND faz net.http_post lendo URL e
--      segredo do Vault POR NOME (nunca valores literais no command);
--   3. cria o job JA INATIVO (active=false). Ativacao MANUAL e deliberada.
--
-- O QUE ESTA MIGRATION **NAO** FAZ
--   * NAO cria/atualiza segredos no Vault (config manual em prod);
--   * NAO grava URL nem segredo LITERAL no command;
--   * NAO ATIVA o job;
--   * NAO faz deploy da Function, nem toca reminders/notifications/dados;
--   * NAO altera o job 'agenda360-reminders-worker' (0013) de forma alguma —
--     os dois jobs coexistem, cada um com seu proprio nome/segredos/Function.
--
-- IDEMPOTENCIA: nome estavel + limpeza defensiva (mesmo padrao da 0013).
--
-- Depende de: 0014 (push_subscriptions) + 0015 (notifications.claimed_at).
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_jobid bigint;
  j       record;
begin
  for j in select jobid from cron.job where jobname = 'agenda360-push-delivery-worker' loop
    perform cron.unschedule(j.jobid);
  end loop;

  v_jobid := cron.schedule(
    'agenda360-push-delivery-worker',
    '* * * * *',
    $CMD$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                where name = 'push_worker_url'),
        headers := jsonb_build_object(
          'Content-Type',         'application/json',
          'x-push-worker-secret', (select decrypted_secret from vault.decrypted_secrets
                                    where name = 'push_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $CMD$
  );

  perform cron.alter_job(v_jobid, active := false);
end $$;
