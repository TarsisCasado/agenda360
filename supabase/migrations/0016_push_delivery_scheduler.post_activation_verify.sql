-- ===========================================================================
-- VERIFICACAO — FASE B (POS-ATIVACAO) da migration 0016 — 7 checks
-- ---------------------------------------------------------------------------
-- Rode SOMENTE depois da ATIVACAO MANUAL do job, que por sua vez so ocorre
-- apos: (1) chaves VAPID geradas; (2) segredos no Vault; (3) secrets da Edge
-- Function; (4) deploy da push-delivery-worker; (5) smoke test OK.
--
-- Aqui o job DEVE estar ATIVO. Inativo aqui = FALHA.
-- ===========================================================================

-- 1) EXATAMENTE 1 job. Esperado: 1 + 'OK'.
select
  coalesce((select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker'), 0) as qtd,
  case when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') = 1
       then 'OK' else 'FALHOU (esperado exatamente 1)' end as veredito;

-- 2) SCHEDULE correto. Esperado: OK.
select
  coalesce((select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1), '(sem job)') as schedule,
  case when (select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) = '* * * * *'
       then 'OK' else 'FALHOU (schedule divergente)' end as veredito;

-- 3) FASE B: job ATIVO. Esperado: active=true + 'OK'.
select
  coalesce((select active::text from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1), '(sem job)') as active,
  case
    when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') <> 1 then 'FALHOU (job ausente/duplicado)'
    when (select active from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) = true then 'OK (ativo)'
    else 'FALHOU (job INATIVO — ative-o para operar em producao)'
  end as veredito;

-- 4) CONFIGURACAO ESTRUTURAL intacta. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%net.http_post%'
     and (select c from cmd) ilike '%vault.decrypted_secrets%' then 'OK'
    else 'FALHOU (command alterado; nao usa pg_net + Vault)'
  end as veredito;

-- 5) NENHUM secret/URL literal exposto no command. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%http://%'  then 'FALHOU (URL literal no command)'
    when (select c from cmd) ilike '%https://%' then 'FALHOU (URL literal no command)'
    else 'OK (sem URL/segredo literal)'
  end as veredito;

-- 6) SEGREDOS necessarios existem no Vault (por NOME). Sempre 2 linhas.
with alvo(nome) as (values ('push_worker_url'), ('push_worker_secret'))
select
  a.nome,
  case
    when exists (select 1 from vault.secrets s where s.name = a.nome) then 'OK (presente)'
    else 'FALHOU (segredo ausente no Vault)'
  end as veredito
from alvo a
order by a.nome;

-- 7) VEREDITO FINAL — FASE B (producao ATIVA).
with x as (
  select
    (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker')        as n_job,
    (select schedule from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) as sched,
    (select active   from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) as active,
    (select command  from cron.job where jobname = 'agenda360-push-delivery-worker' limit 1) as cmd,
    (select count(*) from vault.secrets
       where name in ('push_worker_url','push_worker_secret'))                               as segredos
)
select
  n_job, sched, active, segredos,
  case when
       n_job    = 1
   and sched    = '* * * * *'
   and active   = true
   and cmd ilike '%net.http_post%'
   and cmd ilike '%vault.decrypted_secrets%'
   and cmd not ilike '%http://%'
   and cmd not ilike '%https://%'
   and segredos = 2
       then 'OK' else 'FALHOU' end as veredito_final_fase_b
from x;
