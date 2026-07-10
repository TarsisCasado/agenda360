-- ===========================================================================
-- PRECHECK da migration 0002 — SOMENTE LEITURA (nao altera nada).
-- Rode ANTES da migration. Objetivo: garantir que aplicar o hardening e seguro.
-- ===========================================================================

-- 1) RLS habilitada nas tabelas afetadas? Esperado: rowsecurity = true (todas).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in
      ('tasks','links','categories','reminders','activity_logs','ai_conversations')
order by tablename;

-- 2) Policies atuais nessas tabelas (esperado hoje: "<tabela>_all").
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in
      ('tasks','links','categories','reminders','activity_logs','ai_conversations')
order by tablename, cmd, policyname;

-- 3) Defaults atuais das colunas de identidade (esperado hoje: NULL/sem default).
select table_name, column_name, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name='tasks'            and column_name='created_by') or
    (table_name='links'            and column_name='created_by') or
    (table_name='categories'       and column_name='created_by') or
    (table_name='reminders'        and column_name='created_by') or
    (table_name='activity_logs'    and column_name='actor_id')   or
    (table_name='ai_conversations' and column_name='user_id')
  )
order by table_name;

-- 4) Registros com identidade NULA por tabela.
--    Nao bloqueiam a migration (WITH CHECK so vale para INSERTs futuros), mas
--    e bom saber. Esperado idealmente: 0 (exceto activity_logs, onde NULL e
--    permitido para eventos de sistema).
select 'tasks'            as tabela, count(*) as identidade_nula from public.tasks            where created_by is null
union all select 'links',            count(*) from public.links            where created_by is null
union all select 'categories',       count(*) from public.categories       where created_by is null
union all select 'reminders',        count(*) from public.reminders        where created_by is null
union all select 'activity_logs',    count(*) from public.activity_logs    where actor_id   is null
union all select 'ai_conversations', count(*) from public.ai_conversations where user_id     is null
order by tabela;

-- 5) Registros cuja AUTORIA nao corresponde a um MEMBRO do workspace.
--    Informativo: a migration NAO altera linhas existentes, entao estes registros
--    continuam validos. Serve para detectar dados inconsistentes/legados.
--    Esperado idealmente: 0 em todas.
select 'tasks' as tabela, count(*) as autoria_fora_do_workspace
from public.tasks t
where t.created_by is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = t.workspace_id and m.user_id = t.created_by)
union all
select 'links', count(*)
from public.links l
where l.created_by is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = l.workspace_id and m.user_id = l.created_by)
union all
select 'categories', count(*)
from public.categories c
where c.created_by is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = c.workspace_id and m.user_id = c.created_by)
union all
select 'reminders', count(*)
from public.reminders r
where r.created_by is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = r.workspace_id and m.user_id = r.created_by)
union all
select 'activity_logs', count(*)
from public.activity_logs a
where a.actor_id is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = a.workspace_id and m.user_id = a.actor_id)
union all
select 'ai_conversations', count(*)
from public.ai_conversations v
where v.user_id is not null
  and not exists (select 1 from public.workspace_members m
                  where m.workspace_id = v.workspace_id and m.user_id = v.user_id)
order by tabela;

-- 6) Existe a funcao de apoio usada pelas policies? Esperado: 1 linha.
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_workspace_member';

-- ===========================================================================
-- INTERPRETACAO:
--   * (1) todas rowsecurity = true.
--   * (3) defaults hoje vazios (a migration vai preenche-los).
--   * (4) e (5): idealmente 0. Se aparecerem numeros, a migration ainda e
--     segura (nao toca linhas antigas), mas investigue a origem antes.
--   * (6) deve retornar is_workspace_member. Se nao, aplique o schema.sql base.
-- Nenhuma linha e alterada por este script.
-- ===========================================================================
