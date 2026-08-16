-- ===========================================================================
-- PRECHECK da migration 0013 (rode ANTES; nao altera nada) — 8 checks
-- ---------------------------------------------------------------------------
-- Agendamento do worker de lembretes: pg_cron -> pg_net -> Edge Function
-- reminders-worker. Este precheck prova, com o banco REAL, que a 0013 pode ser
-- aplicada com seguranca. TODOS os checks sao defensivos: como pg_cron/pg_net
-- ainda NAO estao instalados, usamos to_regclass/to_regprocedure para nao
-- quebrar quando os objetos ainda nao existem.
--
-- NUNCA revela segredos: consultamos apenas NOMES em vault.secrets e a
-- PERMISSAO de leitura (has_table_privilege), jamais vault.decrypted_secrets.
--
-- Somente leitura. Guarde o resultado: e a referencia para verify/rollback.
-- ===========================================================================

-- 1) EXTENSOES — disponibilidade x estado instalado. Sempre 3 linhas.
--    Esperado nesta fase: pg_cron e pg_net DISPONIVEIS e (tipicamente) NAO
--    instalados; supabase_vault INSTALADO.
with alvo(ext) as (values ('pg_cron'), ('pg_net'), ('supabase_vault'))
select
  a.ext,
  coalesce(av.default_version, '(indisponivel)') as versao_disponivel,
  coalesce(ie.extversion, '(nao instalada)')     as versao_instalada,
  case
    when av.name is null and ie.extversion is null then 'FALHOU (indisponivel)'
    when ie.extversion is not null                 then 'OK (instalada)'
    else 'OK (disponivel, sera instalada pela 0013)'
  end as situacao
from alvo a
left join pg_available_extensions av on av.name = a.ext
left join pg_extension ie            on ie.extname = a.ext
order by a.ext;

-- 2) BANCO do pg_cron. O pg_cron so opera no banco de cron.database_name.
--    Se a extensao ainda nao existe o GUC pode nao existir: current_setting
--    com missing_ok=true evita erro. Esperado: alvo = banco atual (ou GUC
--    ausente ainda, o que e OK antes da instalacao).
select
  current_database()                                   as banco_atual,
  coalesce(current_setting('cron.database_name', true), '(GUC ausente)') as cron_database,
  case
    when current_setting('cron.database_name', true) is null then 'OK (pg_cron ainda nao instalado)'
    when current_setting('cron.database_name', true) = current_database() then 'OK'
    else 'ATENCAO (pg_cron aponta para outro banco)'
  end as veredito;

-- 3) CONTEXTO DE EXECUCAO. O job herda o papel que o AGENDA (current_user na
--    aplicacao da 0013). Esse papel precisa ler vault.decrypted_secrets.
--    Esperado: current_user com privilegio SELECT (ex.: postgres). NAO expoe
--    valor algum — so o booleano de privilegio.
select
  current_user as papel_que_agendara,
  case
    when to_regclass('vault.decrypted_secrets') is null then 'FALHOU (vault ausente)'
    when has_table_privilege(current_user, 'vault.decrypted_secrets', 'SELECT') then 'OK'
    else 'FALHOU (papel sem SELECT em vault.decrypted_secrets)'
  end as veredito;

-- 4) APIS necessarias existem (apos instalar extensoes). Sempre 4 linhas.
--    Antes da 0013, cron.*/net.* aparecem como ausentes — o que e esperado;
--    a 0013 as cria ao instalar as extensoes. vault.decrypted_secrets deve
--    JA existir. Esperado: vault presente; demais 'ausente (vem com a extensao)'.
with alvo(api, tipo) as (
  values
    ('cron.schedule(text,text,text)', 'proc'),
    ('cron.alter_job',                'proc_name'),
    ('net.http_post',                 'proc_name'),
    ('vault.decrypted_secrets',       'view')
)
select
  a.api,
  case a.tipo
    when 'proc'      then case when to_regprocedure('cron.schedule(text,text,text)') is null
                               then 'ausente (vem com pg_cron)' else 'OK (presente)' end
    when 'proc_name' then case when exists (
                                 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                 where n.nspname||'.'||p.proname = a.api)
                               then 'OK (presente)' else 'ausente (vem com a extensao)' end
    when 'view'      then case when to_regclass('vault.decrypted_secrets') is null
                               then 'FALHOU (vault ausente)' else 'OK (presente)' end
  end as situacao
from alvo a
order by a.api;

-- 5) JOBS pre-existentes com o nome-alvo. Idempotencia: a 0013 remove antes de
--    recriar. Esperado: 0 na 1a aplicacao. Guardado por to_regclass('cron.job').
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') end as jobs_com_o_nome,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ainda nao instalado)'
    when (select count(*) from cron.job where jobname = 'agenda360-reminders-worker') = 0 then 'OK (nenhum)'
    else 'ATENCAO (ja existe; a 0013 fara upsert/limpeza defensiva)'
  end as veredito;

-- 6) OUTROS jobs que chamam a Function (higiene). Esperado: 0. Nao removemos
--    nada aqui; so alertamos para evitar duplicidade acidental de scheduler.
select
  case when to_regclass('cron.job') is null then 0
       else (select count(*) from cron.job
             where command ilike '%reminders-worker%' and jobname <> 'agenda360-reminders-worker') end as outros_schedulers,
  case
    when to_regclass('cron.job') is null then 'OK (pg_cron ainda nao instalado)'
    when (select count(*) from cron.job
          where command ilike '%reminders-worker%' and jobname <> 'agenda360-reminders-worker') = 0 then 'OK'
    else 'ATENCAO (existe outro job chamando o worker)'
  end as veredito;

-- 7) SEGREDOS DO VAULT — presenca por NOME (nunca o valor). A 0013 NAO cria os
--    segredos; eles sao configurados manualmente ANTES da ATIVACAO (fase B).
--    Nesta fase podem ainda NAO existir — apenas registramos. Sempre 2 linhas.
with alvo(nome) as (values ('reminders_worker_url'), ('reminders_worker_secret'))
select
  a.nome,
  case
    when to_regclass('vault.secrets') is null then 'FALHOU (vault ausente)'
    when exists (select 1 from vault.secrets s where s.name = a.nome) then 'presente'
    else 'ausente (configurar no Vault antes de ATIVAR)'
  end as situacao
from alvo a
order by a.nome;

-- 8) TABELAS DO MOTOR intactas (a 0013 nao toca dados). Esperado: 2 + 'OK'.
select
  count(*) as tabelas_motor_presentes,
  case when count(*) = 2 then 'OK' else 'FALHOU (schema do motor inesperado)' end as veredito
from information_schema.tables
where table_schema = 'public' and table_name in ('reminders','notifications');
