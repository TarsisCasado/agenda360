-- ===========================================================================
-- VERIFICACAO — FASE B (POS-ATIVACAO) da migration 0013 — 8 checks
-- ---------------------------------------------------------------------------
-- Rode SOMENTE depois da ATIVACAO MANUAL do job, que por sua vez so ocorre
-- apos: (1) segredos configurados no Vault; (2) secrets da Edge Function;
-- (3) deploy da reminders-worker; (4) teste de auth correta/incorreta;
-- (5) confirmacao de que a Function responde.
--
-- Aqui o alvo e OPOSTO ao da fase A: o job DEVE estar ATIVO. Um job inativo
-- neste verify e FALHA. Assim e impossivel interpretar um job inativo como
-- "producao totalmente ativa".
--
-- Somente leitura. Auto-avaliado (OK / FALHOU).
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
  coalesce((select count(*) from cron.job where jobname = 'agenda360-reminders-worker'), 0) as qtd,
  case when (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') = 1
       then 'OK' else 'FALHOU (esperado exatamente 1)' end as veredito;

-- 3) SCHEDULE correto (* * * * *). Esperado: OK.
select
  coalesce((select schedule from cron.job where jobname = 'agenda360-reminders-worker' limit 1), '(sem job)') as schedule,
  case when (select schedule from cron.job where jobname = 'agenda360-reminders-worker' limit 1) = '* * * * *'
       then 'OK' else 'FALHOU (schedule divergente)' end as veredito;

-- 4) FASE B: job ATIVO. Esperado: active=true + 'OK'. INATIVO aqui = FALHA.
select
  coalesce((select active::text from cron.job where jobname = 'agenda360-reminders-worker' limit 1), '(sem job)') as active,
  case
    when (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') <> 1 then 'FALHOU (job ausente/duplicado)'
    when (select active from cron.job where jobname = 'agenda360-reminders-worker' limit 1) = true then 'OK (ativo)'
    else 'FALHOU (job INATIVO — ative-o para operar em producao)'
  end as veredito;

-- 5) CONFIGURACAO ESTRUTURAL intacta: command usa pg_net + Vault. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-reminders-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%net.http_post%'
     and (select c from cmd) ilike '%vault.decrypted_secrets%' then 'OK'
    else 'FALHOU (command alterado; nao usa pg_net + Vault)'
  end as veredito;

-- 6) NENHUM secret/URL literal exposto no command. Esperado: OK.
with cmd as (
  select command as c from cron.job where jobname = 'agenda360-reminders-worker' limit 1
)
select
  case
    when (select c from cmd) is null then 'FALHOU (sem job)'
    when (select c from cmd) ilike '%http://%'  then 'FALHOU (URL literal no command)'
    when (select c from cmd) ilike '%https://%' then 'FALHOU (URL literal no command)'
    else 'OK (sem URL/segredo literal)'
  end as veredito;

-- 7) SEGREDOS necessarios existem no Vault (por NOME; nunca o valor).
--    A ativacao pressupoe os dois configurados. Sempre 2 linhas. Esperado: OK.
with alvo(nome) as (values ('reminders_worker_url'), ('reminders_worker_secret'))
select
  a.nome,
  case
    when exists (select 1 from vault.secrets s where s.name = a.nome) then 'OK (presente)'
    else 'FALHOU (segredo ausente no Vault)'
  end as veredito
from alvo a
order by a.nome;

-- 8) VEREDITO FINAL — FASE B (producao ATIVA). Esperado: OK.
with x as (
  select
    (select count(*) from pg_extension where extname in ('pg_cron','pg_net','supabase_vault')) as ext_ok,
    (select count(*) from cron.job where jobname = 'agenda360-reminders-worker')               as n_job,
    (select schedule from cron.job where jobname = 'agenda360-reminders-worker' limit 1)        as sched,
    (select active   from cron.job where jobname = 'agenda360-reminders-worker' limit 1)        as active,
    (select command  from cron.job where jobname = 'agenda360-reminders-worker' limit 1)        as cmd,
    (select count(*) from cron.job
       where command ilike '%reminders-worker%' and jobname <> 'agenda360-reminders-worker')    as dup,
    (select count(*) from vault.secrets
       where name in ('reminders_worker_url','reminders_worker_secret'))                        as segredos
)
select
  ext_ok, n_job, sched, active, dup, segredos,
  case when
       ext_ok   = 3
   and n_job    = 1
   and sched    = '* * * * *'
   and active   = true
   and cmd ilike '%net.http_post%'
   and cmd ilike '%vault.decrypted_secrets%'
   and cmd not ilike '%http://%'
   and cmd not ilike '%https://%'
   and dup      = 0
   and segredos = 2
       then 'OK' else 'FALHOU' end as veredito_final_fase_b
from x;
