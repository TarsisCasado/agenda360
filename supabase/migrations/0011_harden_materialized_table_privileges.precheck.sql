-- ===========================================================================
-- PRECHECK da migration 0011 (rode ANTES; nao altera nada) — 4 checks
-- ---------------------------------------------------------------------------
-- Fotografa o estado ATUAL das 5 tabelas no escopo:
--   reminders, integrations, notifications, delegations, activity_logs
-- Somente leitura. Guarde o resultado: e a referencia para o rollback.
-- ===========================================================================

-- 1) GRANTS materializados hoje, por tabela e papel.
--    Esperado ANTES da 0011 (medido em producao): 7 privilegios para anon E
--    authenticated nas 5 tabelas (DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--    TRUNCATE, UPDATE).
select
  table_name as tabela,
  grantee    as papel,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios,
  count(*)   as qtd
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('reminders','integrations','notifications','delegations','activity_logs')
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by tabela, papel;

-- 2) POLICIES atuais, com as expressoes completas.
--    Esperado ANTES da 0011: reminders com 4 por-comando; activity_logs com 2
--    por-comando; integrations/notifications/delegations com 1 `_all` (cmd=ALL).
--    As expressoes abaixo sao as que a 0011 PRESERVA ao trocar FOR ALL por
--    policies por-comando — confira que sao is_workspace_member(workspace_id).
select
  tablename  as tabela,
  policyname as policy,
  cmd        as comando,
  permissive,
  roles      as papeis,
  qual       as using_expr,
  with_check as with_check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('reminders','integrations','notifications','delegations','activity_logs')
order by tabela, cmd, policy;

-- 3) RLS habilitada nas 5? Esperado: 5 linhas, todas true.
select tablename as tabela, rowsecurity as rls_habilitada
from pg_tables
where schemaname = 'public'
  and tablename in ('reminders','integrations','notifications','delegations','activity_logs')
order by tabela;

-- 4) Dependencias relevantes: triggers e FKs das 5 tabelas.
--    A 0011 NAO altera nenhum dos dois — este check existe para provar que o
--    estado antes e depois e identico.
--    Esperado: trg_integrations_updated (BEFORE UPDATE em integrations) e as
--    FKs de workspace/task/profiles. Nada muda apos a migration.
select
  c.relname                as tabela,
  'trigger'                as tipo,
  t.tgname                 as nome,
  null::text               as detalhe
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('reminders','integrations','notifications','delegations','activity_logs')
union all
select
  c.relname,
  'fk',
  con.conname,
  case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                       when 'a' then 'no action' else con.confdeltype::text end
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and con.contype = 'f'
  and c.relname in ('reminders','integrations','notifications','delegations','activity_logs')
order by tabela, tipo, nome;
