-- ===========================================================================
-- VERIFICACAO da migration 0003 (rode no SQL Editor apos aplicar)
-- ===========================================================================

-- 1) Tabela criada com as colunas minimas? Esperado: 6 colunas.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
order by ordinal_position;

-- 2) DEFAULT auth.uid() em created_by? Esperado: column_default com "auth.uid()".
select column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
  and column_name = 'created_by';

-- 3) RLS habilitada? Esperado: rowsecurity = true.
select rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'inbox_items';

-- 4) Policies por-comando criadas? Esperado: select/insert/update/delete.
--    O with_check do _insert deve mencionar "auth.uid()".
select policyname, cmd, with_check
from pg_policies
where schemaname = 'public' and tablename = 'inbox_items'
order by cmd, policyname;

-- 5) Indice de listagem presente? Esperado: idx_inbox_items_ws.
select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'inbox_items';

-- 6) Trigger updated_at presente? Esperado: trg_inbox_items_updated.
select tgname
from pg_trigger
where tgrelid = 'public.inbox_items'::regclass and not tgisinternal;
