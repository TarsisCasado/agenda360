-- ===========================================================================
-- PRECHECK da migration 0016 (rode ANTES; nao altera nada) — 7 checks
-- Espelha o precheck da 0013 para o job 'agenda360-push-delivery-worker'.
-- Somente leitura; nunca revela valores de segredo.
-- ===========================================================================

-- 1) EXTENSOES — disponibilidade x estado instalado. Sempre 3 linhas.
--    Se a 0013 ja foi aplicada, pg_cron/pg_net devem aparecer JA instaladas.
with alvo(ext) as (values ('pg_cron'), ('pg_net'), ('supabase_vault'))
select
  a.ext,
  coalesce(av.default_version, '(indisponivel)') as versao_disponivel,
  coalesce(ie.extversion, '(nao instalada)')     as versao_instalada,
  case
    when av.name is null and ie.extversion is null then 'FALHOU (indisponivel)'
    when ie.extversion is not null                 then 'OK (instalada)'
    else 'OK (disponivel, sera instalada pela 0016)'
  end as situacao
from alvo a
left join pg_available_extensions av on av.name = a.ext
left join pg_extension ie            on ie.extname = a.ext
order by a.ext;

-- 2) CONTEXTO DE EXECUCAO — papel que vai agendar precisa ler o Vault.
select
  current_user as papel_que_agendara,
  case
    when to_regclass('vault.decrypted_secrets') is null then 'FALHOU (vault ausente)'
    when has_table_privilege(current_user, 'vault.decrypted_secrets', 'SELECT') then 'OK'
    else 'FALHOU (papel sem SELECT em vault.decrypted_secrets)'
  end as veredito;

-- 3) JOBS pre-existentes com o nome-alvo. Esperado: 0 na 1a aplicacao.
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') end as jobs_com_o_nome,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ainda nao instalado)'
    when (select count(*) from cron.job where jobname = 'agenda360-push-delivery-worker') = 0 then 'OK (nenhum)'
    else 'ATENCAO (ja existe; a 0016 fara upsert/limpeza defensiva)'
  end as veredito;

-- 4) OUTROS jobs que chamam esta Function (higiene).
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job
             where command ilike '%push-delivery-worker%' and jobname <> 'agenda360-push-delivery-worker') end as outros_schedulers,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ainda nao instalado)'
    when (select count(*) from cron.job
          where command ilike '%push-delivery-worker%' and jobname <> 'agenda360-push-delivery-worker') = 0 then 'OK'
    else 'ATENCAO (existe outro job chamando o worker)'
  end as veredito;

-- 5) O job 'agenda360-reminders-worker' (0013) permanece INTOCADO por esta
--    migration — apenas informativo, prova que os dois jobs sao independentes.
select
  case when to_regclass('cron.job') is null then '(pg_cron nao instalado)'
       else coalesce((select active::text from cron.job where jobname = 'agenda360-reminders-worker'), '(job 0013 ausente)') end as reminders_worker_active;

-- 6) SEGREDOS DO VAULT — presenca por NOME (nunca o valor). Podem ainda nao
--    existir nesta fase; configurados antes da ATIVACAO (fase B).
with alvo(nome) as (values ('push_worker_url'), ('push_worker_secret'))
select
  a.nome,
  case
    when to_regclass('vault.secrets') is null then 'FALHOU (vault ausente)'
    when exists (select 1 from vault.secrets s where s.name = a.nome) then 'presente'
    else 'ausente (configurar no Vault antes de ATIVAR)'
  end as situacao
from alvo a
order by a.nome;

-- 7) DEPENDENCIAS (0014/0015) ja aplicadas? Esperado: 2 + 'OK'.
select
  count(*) as dependencias_presentes,
  case when count(*) = 2 then 'OK' else 'FALHOU (aplique 0014 e 0015 antes da 0016)' end as veredito
from (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'push_subscriptions'
  union all
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'notifications' and column_name = 'claimed_at'
) deps;
