-- ===========================================================================
-- MIGRATION 0013 — AGENDADOR do worker de lembretes (Sprint 2 / Etapa 1C)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, rode o .precheck.sql, depois aplique
-- no SQL Editor do Supabase COMO postgres (o papel que agenda vira o dono do
-- job e precisa de SELECT em vault.decrypted_secrets).
--
-- OBJETIVO
--   Versionar a infraestrutura de agendamento:
--     pg_cron (tick 1/min) -> pg_net (HTTP POST) -> Edge Function reminders-worker
--   O worker (Etapa 1C) converte reminders vencidos em notifications 'pending'.
--
-- O QUE ESTA MIGRATION FAZ
--   1. create extension if not exists pg_cron   (schema cron)
--   2. create extension if not exists pg_net    (schema net)
--   3. (re)cria 1 job de nome ESTAVEL 'agenda360-reminders-worker', schedule
--      '* * * * *', cujo COMMAND faz net.http_post lendo URL e segredo do Vault
--      POR NOME (nunca valores literais no command);
--   4. cria o job JA INATIVO (active=false). A ativacao e MANUAL e deliberada,
--      so depois de: segredos no Vault + secrets/deploy da Function + testes.
--
-- O QUE ESTA MIGRATION **NAO** FAZ
--   * NAO cria/atualiza segredos no Vault (valores sao config manual em prod);
--   * NAO grava URL nem segredo LITERAL no command (so lookups por nome);
--   * NAO ATIVA o job (nasce inativo; ver README, secao ATIVACAO);
--   * NAO faz deploy da Function, nem toca reminders/notifications/dados;
--   * NAO cria grants novos no Vault (postgres ja le decrypted_secrets).
--
-- SEGURANCA DO SEGREDO
--   O command guarda apenas a CONSULTA ao Vault:
--     (select decrypted_secret from vault.decrypted_secrets where name = ...)
--   O valor e resolvido em TEMPO DE EXECUCAO, com o privilegio do dono do job
--   (postgres). O texto do command — visivel em cron.job — nunca contem o
--   segredo nem a URL de producao.
--
-- IDEMPOTENCIA
--   Nome estavel + limpeza defensiva: antes de agendar, removemos qualquer job
--   pre-existente com o mesmo nome (cobre o caso, documentado no pg_cron, de
--   nomes duplicados criados fora do cron.schedule). Reaplicar => exatamente 1.
-- ===========================================================================

-- 1) e 2) Extensoes (idempotente). No Supabase as libs ja estao no
-- shared_preload_libraries da plataforma, entao create extension funciona.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) e 4) (Re)criacao ATOMICA do job, ja inativo. Bloco unico => a transacao
-- garante que o lancador do pg_cron nunca enxergue o job momentaneamente ativo.
do $$
declare
  v_jobid bigint;
  j       record;
begin
  -- Limpeza defensiva: remove todo job com este nome (inclui duplicados).
  for j in select jobid from cron.job where jobname = 'agenda360-reminders-worker' loop
    perform cron.unschedule(j.jobid);
  end loop;

  -- Agenda (nasce active=true por padrao do pg_cron; desativamos abaixo, ainda
  -- dentro da mesma transacao). COMMAND sem literais de URL/segredo.
  v_jobid := cron.schedule(
    'agenda360-reminders-worker',
    '* * * * *',
    $CMD$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                where name = 'reminders_worker_url'),
        headers := jsonb_build_object(
          'Content-Type',      'application/json',
          'x-reminders-secret',(select decrypted_secret from vault.decrypted_secrets
                                where name = 'reminders_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $CMD$
  );

  -- Nasce INATIVO. Ativacao = passo manual (README, secao ATIVACAO).
  perform cron.alter_job(v_jobid, active := false);
end $$;
