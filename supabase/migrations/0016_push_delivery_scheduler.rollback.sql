-- ===========================================================================
-- ROLLBACK da migration 0016 (agendador do push-delivery-worker)
-- ---------------------------------------------------------------------------
-- Remove SOMENTE o job 'agenda360-push-delivery-worker'. NAO desfaz nada
-- mais — em particular, NAO toca no job 'agenda360-reminders-worker' (0013).
--
-- NAO faz DROP EXTENSION, NAO remove segredos do Vault, NAO toca
-- notifications/push_subscriptions/dados. Idempotente.
-- ===========================================================================

do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron nao instalado; nada a remover.';
    return;
  end if;

  for j in select jobid from cron.job where jobname = 'agenda360-push-delivery-worker' loop
    perform cron.unschedule(j.jobid);
    raise notice 'job % (agenda360-push-delivery-worker) removido.', j.jobid;
  end loop;
end $$;

-- Conferencia pos-rollback (opcional). Esperado: 0 + 'OK'.
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') end as jobs_restantes,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ausente)'
    when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') = 0 then 'OK'
    else 'FALHOU (job ainda presente)'
  end as veredito;
