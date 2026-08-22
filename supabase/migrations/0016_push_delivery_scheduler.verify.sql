-- ===========================================================================
-- VERIFICACAO — FASE A da migration 0016 (rode LOGO APOS aplicar) — 8 checks
-- Prova a infraestrutura versionada com o job AINDA INATIVO. Um job ATIVO
-- aqui e FALHA (ativacao e a fase B, manual). Espelha 0013_..._verify.sql.
--
-- Par: 0016_push_delivery_scheduler.post_activation_verify.sql (fase B).
-- ===========================================================================

-- 1) EXTENSOES instaladas. Sempre 3 linhas. Esperado: TODAS 'OK'.
with alvo(ext) as (values ('pg_cron'), ('pg_net'), ('supabase_vault'))
select
  a.ext,
  coalesce(e.extversion, '(nao instalada)') as versao,
  case when e.extversion is null then 'FALHOU (ausente)' else 'OK' end as veredito
from alvo a
left join pg_extension e on e.extname = a.ext
order by a.ext;

-- 2) EXATAMENTE 1 job com o nome-alvo. Esperado: 1 + 'OK'.
select
  coalesce((select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker'), 0) as qtd,
  case when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') = 1
       then 'OK' else 'FALHOU (esperado exatamente 1)' end as veredito;

-- 3) SCHEDULE correto (* * * * *). Esperado: OK.
select
  coalesce((select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1), '(sem job)') as schedule,
  case when (select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) = '* * * * *'
       then 'OK' else 'FALHOU (schedule divergente)' end as veredito;

-- 4) FASE A: job INATIVO. Esperado: active=false + 'OK'.
select
  coalesce((select active::text from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1), '(sem job)') as active,
  case
    when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') <> 1 then 'FALHOU (job ausente/duplicado)'
    when (select active from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) = false then 'OK (inativo, como esperado na fase A)'
    else 'FALHOU (job ATIVO na fase A — ativacao e manual, fase B)'
  end as veredito;

-- 5) COMMAND usa net.http_post E le do Vault. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%net.http_post%'
     and (select c from cmd) ilike '%vault.decrypted_secrets%' then 'OK'
    else 'FALHOU (command nao usa pg_net + Vault)'
  end as veredito;

-- 6) NENHUM literal de URL/segredo materializado no command. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%http://%'  then 'FALHOU (URL literal no command)'
    when (select c from cmd) ilike '%https://%' then 'FALHOU (URL literal no command)'
    else 'OK (sem URL/segredo literal; apenas lookups no Vault)'
  end as veredito;

-- 7) DONO do job pode ler o Vault em runtime. Esperado: OK.
with j as (
  select username from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1
)
select
  coalesce((select username from j), '(sem job)') as dono_do_job,
  case
    when (select username from j) is null then 'FALHOU (sem job)'
    when has_table_privilege((select username from j), 'vault.decrypted_secrets', 'SELECT') then 'OK'
    else 'FALHOU (dono do job sem SELECT em vault.decrypted_secrets)'
  end as veredito;

-- 8) VEREDITO GLOBAL — FASE A. Inclui a prova de que 'agenda360-reminders-worker'
--    (0013) NAO foi afetado (independencia entre os dois jobs).
with x as (
  select
    (select count(*) from pg_extension where extname in ('pg_cron','pg_net','supabase_vault')) as ext_ok,
    (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker')           as n_job,
    (select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1)    as sched,
    (select active   from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1)    as active,
    (select command  from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1)    as cmd,
    (select count(*) from cron.job where jobname = 'agenda360-reminders-worker')                as reminders_intacto
)
select
  ext_ok, n_job, sched, active, reminders_intacto,
  case when
       ext_ok = 3
   and n_job  = 1
   and sched  = '* * * * *'
   and active = false
   and cmd ilike '%net.http_post%'
   and cmd ilike '%vault.decrypted_secrets%'
   and cmd not ilike '%http://%'
   and cmd not ilike '%https://%'
       then 'OK' else 'FALHOU' end as veredito_global_fase_a
from x;
