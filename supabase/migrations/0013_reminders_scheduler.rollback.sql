-- ===========================================================================
-- ROLLBACK da migration 0013 (agendador do worker de lembretes)
-- ---------------------------------------------------------------------------
-- Remove SOMENTE o job criado pela 0013. NAO desfaz nada mais.
--
-- O QUE ESTE ROLLBACK FAZ
--   * cron.unschedule do(s) job(s) 'agenda360-reminders-worker' (loop
--     defensivo, cobrindo eventuais duplicados por nome).
--
-- O QUE ESTE ROLLBACK **NAO** FAZ (deliberado)
--   * NAO faz DROP EXTENSION pg_cron / pg_net — derrubaria qualquer outro job
--     ou uso de HTTP no banco; extensoes permanecem instaladas;
--   * NAO remove segredos do Vault (reminders_worker_url / _secret);
--   * NAO toca reminders, notifications, profiles ou qualquer dado de usuario;
--   * NAO altera grants, policies, RLS ou schema.
--
-- Idempotente: se o job nao existir, o loop simplesmente nao itera.
-- ===========================================================================

do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron nao instalado; nada a remover.';
    return;
  end if;

  for j in select jobid from cron.job where jobname = 'agenda360-reminders-worker' loop
    perform cron.unschedule(j.jobid);
    raise notice 'job % (agenda360-reminders-worker) removido.', j.jobid;
  end loop;
end $$;

-- Conferencia pos-rollback (opcional). Esperado: 0 + 'OK'.
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') end as jobs_restantes,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ausente)'
    when (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') = 0 then 'OK'
    else 'FALHOU (job ainda presente)'
  end as veredito;
