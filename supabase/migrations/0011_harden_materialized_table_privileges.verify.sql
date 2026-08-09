-- ===========================================================================
-- VERIFICACAO da migration 0011 (rode apos aplicar) — 8 checks
-- ---------------------------------------------------------------------------
-- Todos os checks se auto-avaliam (OK / FALHOU). Onde o estado desejado e a
-- AUSENCIA de algo (privilegio, policy), a matriz parte de uma lista fixa em
-- VALUES + LEFT JOIN, para que a ausencia apareca explicitamente como 'OK' e
-- nunca como linha faltando — que seria indistinguivel de uma query errada.
-- ===========================================================================

-- 1) MATRIZ EXATA DE GRANTS — sempre 10 linhas (5 tabelas x anon/authenticated).
--    Esperado: TODAS com veredito 'OK'.
with esperado(tabela, papel, privilegios_ok) as (
  values
    ('reminders',     'authenticated', 'DELETE,INSERT,SELECT,UPDATE'),
    ('integrations',  'authenticated', 'INSERT,SELECT,UPDATE'),
    ('notifications', 'authenticated', 'SELECT'),
    ('delegations',   'authenticated', 'INSERT,SELECT'),
    ('activity_logs', 'authenticated', 'INSERT,SELECT'),
    ('reminders',     'anon', ''), ('integrations',  'anon', ''),
    ('notifications', 'anon', ''), ('delegations',   'anon', ''),
    ('activity_logs', 'anon', '')
),
real as (
  select table_name as tabela, grantee as papel,
         string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('reminders','integrations','notifications','delegations','activity_logs')
    and grantee in ('anon','authenticated')
  group by 1, 2
)
select
  e.tabela, e.papel,
  coalesce(r.privs, '(nenhum)') as privilegios_atuais,
  coalesce(nullif(e.privilegios_ok, ''), '(nenhum)') as privilegios_esperados,
  case when coalesce(r.privs, '') = e.privilegios_ok then 'OK' else 'FALHOU' end as veredito
from esperado e
left join real r on r.tabela = e.tabela and r.papel = e.papel
order by e.papel, e.tabela;

-- 2) NENHUM TRUNCATE para anon/authenticated nas 5 tabelas.
--    TRUNCATE nao e filtrado por RLS — e o privilegio mais perigoso aqui.
--    Esperado: 0 + 'OK'.
select
  count(*) as ocorrencias_truncate,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('reminders','integrations','notifications','delegations','activity_logs')
  and grantee in ('anon','authenticated')
  and privilege_type = 'TRUNCATE';

-- 3) NENHUM REFERENCES / TRIGGER / MAINTAIN (nenhuma justificativa funcional).
--    Esperado: 0 + 'OK'.
select
  count(*) as ocorrencias,
  coalesce(string_agg(distinct privilege_type, ', ' order by privilege_type), '(nenhum)') as quais,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('reminders','integrations','notifications','delegations','activity_logs')
  and grantee in ('anon','authenticated')
  and privilege_type in ('REFERENCES','TRIGGER','MAINTAIN');

-- 4) POLICIES FINAIS — sempre 12 linhas (lista fixa do estado planejado).
--    Esperado: TODAS 'OK (existe)'.
--      reminders     : select, insert, update, delete   (intactas da 0002)
--      activity_logs : select, insert                   (intactas da 0002)
--      integrations  : select, insert, update           (criadas pela 0011)
--      notifications : select                           (criada pela 0011)
--      delegations   : select, insert                   (criadas pela 0011)
with esperado(tabela, policy, comando) as (
  values
    ('reminders','reminders_select','SELECT'), ('reminders','reminders_insert','INSERT'),
    ('reminders','reminders_update','UPDATE'), ('reminders','reminders_delete','DELETE'),
    ('activity_logs','activity_logs_select','SELECT'), ('activity_logs','activity_logs_insert','INSERT'),
    ('integrations','integrations_select','SELECT'), ('integrations','integrations_insert','INSERT'),
    ('integrations','integrations_update','UPDATE'),
    ('notifications','notifications_select','SELECT'),
    ('delegations','delegations_select','SELECT'), ('delegations','delegations_insert','INSERT')
)
select
  e.tabela, e.policy, e.comando as comando_esperado,
  coalesce(p.cmd, '(ausente)')  as comando_real,
  case
    when p.policyname is null  then 'FALHOU (policy ausente)'
    when p.cmd <> e.comando    then 'FALHOU (comando divergente)'
    else 'OK (existe)'
  end as veredito
from esperado e
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = e.tabela and p.policyname = e.policy
order by e.tabela, e.comando, e.policy;

-- 5) NENHUMA policy com cmd='ALL' residual nas 5 tabelas.
--    Esperado: 0 + 'OK'.
select
  count(*) as policies_for_all,
  coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename), '(nenhuma)') as quais,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from pg_policies
where schemaname = 'public'
  and tablename in ('reminders','integrations','notifications','delegations','activity_logs')
  and cmd = 'ALL';

-- 6) RLS continua HABILITADA nas 5 tabelas. Esperado: 5 + 'OK'.
select
  count(*) filter (where rowsecurity) as com_rls,
  count(*)                            as total,
  case when count(*) = 5 and count(*) filter (where rowsecurity) = 5
       then 'OK' else 'FALHOU' end    as veredito
from pg_tables
where schemaname = 'public'
  and tablename in ('reminders','integrations','notifications','delegations','activity_logs');

-- 7) ACTIVITY_LOGS continua APPEND-ONLY: nem grant nem policy de UPDATE/DELETE.
--    Esperado: 0 + 0 + 'OK'.
select
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='activity_logs'
      and grantee in ('anon','authenticated')
      and privilege_type in ('UPDATE','DELETE'))            as grants_update_delete,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='activity_logs'
      and cmd in ('UPDATE','DELETE','ALL'))                 as policies_update_delete,
  case when (select count(*) from information_schema.role_table_grants
              where table_schema='public' and table_name='activity_logs'
                and grantee in ('anon','authenticated')
                and privilege_type in ('UPDATE','DELETE')) = 0
        and (select count(*) from pg_policies
              where schemaname='public' and tablename='activity_logs'
                and cmd in ('UPDATE','DELETE','ALL')) = 0
       then 'OK (append-only preservado)' else 'FALHOU' end  as veredito;

-- 8) VEREDITO GLOBAL — consolida grants, policies inesperadas e RLS.
--    Esperado: todas as contagens 0/0/0/0 e veredito 'OK'.
with grants_divergentes as (
  select count(*) as n from (
    with esperado(tabela, papel, privilegios_ok) as (
      values
        ('reminders','authenticated','DELETE,INSERT,SELECT,UPDATE'),
        ('integrations','authenticated','INSERT,SELECT,UPDATE'),
        ('notifications','authenticated','SELECT'),
        ('delegations','authenticated','INSERT,SELECT'),
        ('activity_logs','authenticated','INSERT,SELECT'),
        ('reminders','anon',''), ('integrations','anon',''),
        ('notifications','anon',''), ('delegations','anon',''),
        ('activity_logs','anon','')
    ),
    real as (
      select table_name as tabela, grantee as papel,
             string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
      where table_schema='public'
        and table_name in ('reminders','integrations','notifications','delegations','activity_logs')
        and grantee in ('anon','authenticated')
      group by 1,2
    )
    select 1 from esperado e
    left join real r on r.tabela = e.tabela and r.papel = e.papel
    where coalesce(r.privs, '') <> e.privilegios_ok
  ) x
),
policies_faltando as (
  select count(*) as n from (
    with esperado(tabela, policy) as (
      values ('reminders','reminders_select'),('reminders','reminders_insert'),
             ('reminders','reminders_update'),('reminders','reminders_delete'),
             ('activity_logs','activity_logs_select'),('activity_logs','activity_logs_insert'),
             ('integrations','integrations_select'),('integrations','integrations_insert'),
             ('integrations','integrations_update'),('notifications','notifications_select'),
             ('delegations','delegations_select'),('delegations','delegations_insert')
    )
    select 1 from esperado e
    left join pg_policies p
      on p.schemaname='public' and p.tablename = e.tabela and p.policyname = e.policy
    where p.policyname is null
  ) y
),
policies_residuais as (
  -- Qualquer policy nas 5 tabelas que NAO esteja na lista planejada.
  select count(*) as n
  from pg_policies p
  where p.schemaname='public'
    and p.tablename in ('reminders','integrations','notifications','delegations','activity_logs')
    and p.policyname not in (
      'reminders_select','reminders_insert','reminders_update','reminders_delete',
      'activity_logs_select','activity_logs_insert',
      'integrations_select','integrations_insert','integrations_update',
      'notifications_select','delegations_select','delegations_insert'
    )
),
rls_desabilitada as (
  select count(*) as n from pg_tables
  where schemaname='public'
    and tablename in ('reminders','integrations','notifications','delegations','activity_logs')
    and not rowsecurity
)
select
  g.n as grants_divergentes,
  f.n as policies_faltando,
  r.n as policies_residuais,
  s.n as tabelas_sem_rls,
  case when g.n = 0 and f.n = 0 and r.n = 0 and s.n = 0
       then 'OK' else 'FALHOU' end as veredito_global
from grants_divergentes g, policies_faltando f, policies_residuais r, rls_desabilitada s;
