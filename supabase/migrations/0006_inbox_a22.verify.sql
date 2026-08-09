-- ===========================================================================
-- VERIFICACAO da migration 0006 (rode apos aplicar) — 8 checks
-- ---------------------------------------------------------------------------
-- Os checks 7 e 8 (grants) se auto-avaliam e devolvem veredito OK|FALHOU:
-- conferir listas de privilegios a olho foi exatamente o que deixou passar os
-- privilegios herdados das default privileges (UPDATE/DELETE/TRUNCATE).
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

-- 7) Grants de `authenticated`: EXATAMENTE SELECT, INSERT (sem UPDATE, DELETE
--    nem TRUNCATE — tabela append-only). Esperado: veredito = 'OK'.
select
  coalesce(string_agg(privilege_type, ',' order by privilege_type), '(nenhum)') as privilegios,
  case
    when coalesce(string_agg(privilege_type, ',' order by privilege_type), '') = 'INSERT,SELECT'
    then 'OK' else 'FALHOU'
  end as veredito
from information_schema.role_table_grants
where table_schema='public' and table_name='inbox_events' and grantee='authenticated';

-- 8) `anon` NAO pode ter privilegio nenhum nesta tabela.
--    Esperado: veredito = 'OK' (privilegios_anon = 0).
select
  count(*) as privilegios_anon,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from information_schema.role_table_grants
where table_schema='public' and table_name='inbox_events' and grantee='anon';
