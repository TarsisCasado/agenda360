-- ===========================================================================
-- VERIFICACAO da migration 0005 (rode apos aplicar)
-- ===========================================================================

-- 1) type/status/seen presentes e archived removido?
--    Esperado: type, status, seen presentes; archived AUSENTE.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
  and column_name in ('type', 'status', 'seen', 'archived')
order by column_name;

-- 2) Novo indice por status? Esperado: idx_inbox_items_ws_status.
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'inbox_items';

-- 3) Tabela de checklist criada? Esperado: nao-nulo.
select to_regclass('public.inbox_checklist_items') as checklist_regclass;

-- 4) RLS habilitada na tabela de checklist? Esperado: true.
select rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'inbox_checklist_items';

-- 5) Policies por-comando da checklist? Esperado: select/insert/update/delete.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'inbox_checklist_items'
order by cmd, policyname;
