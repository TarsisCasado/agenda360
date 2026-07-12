-- ===========================================================================
-- VERIFICACAO da migration 0006 (rode apos aplicar)
-- ===========================================================================

-- 1) Coluna origin presente com default 'manual'? Esperado: 1 linha.
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='inbox_items' and column_name='origin';

-- 2) Tabela inbox_events criada? Esperado: nao-nulo.
select to_regclass('public.inbox_events') as inbox_events_regclass;

-- 3) actor_id com DEFAULT auth.uid()? Esperado: default contendo 'auth.uid()'.
select column_default
from information_schema.columns
where table_schema='public' and table_name='inbox_events' and column_name='actor_id';

-- 4) RLS habilitada? Esperado: true.
select rowsecurity from pg_tables
where schemaname='public' and tablename='inbox_events';

-- 5) Policies: apenas select e insert (imutavel — SEM update/delete).
--    Esperado: 2 linhas (select, insert).
select policyname, cmd
from pg_policies
where schemaname='public' and tablename='inbox_events'
order by cmd, policyname;

-- 6) Indices presentes? Esperado: idx_inbox_events_item e _created_brin.
select indexname from pg_indexes
where schemaname='public' and tablename='inbox_events';
