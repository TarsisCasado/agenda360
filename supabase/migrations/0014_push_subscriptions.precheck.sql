-- ===========================================================================
-- PRECHECK da migration 0014 (rode ANTES; nao altera nada) — 4 checks
-- ---------------------------------------------------------------------------
-- push_subscriptions e tabela NOVA: o risco principal e nome ja em uso por
-- outra coisa. Somente leitura.
-- ===========================================================================

-- 1) A tabela ja existe? Esperado: 0 linhas (1a aplicacao) ou, se reaplicando,
--    confirme que e a MESMA definicao antes de prosseguir.
select table_name, table_type
from information_schema.tables
where table_schema = 'public' and table_name = 'push_subscriptions';

-- 2) Ja existe algum objeto (indice/policy/trigger) com os nomes que a 0014
--    vai criar? Esperado: 0 linhas.
select 'index' as tipo, indexname as nome from pg_indexes
where schemaname = 'public'
  and indexname in ('uq_push_subscriptions_endpoint','idx_push_subscriptions_user_alive')
union all
select 'policy', policyname from pg_policies
where schemaname = 'public' and tablename = 'push_subscriptions';

-- 3) profiles existe e tem PK uuid (dependencia da FK user_id)? Esperado: 1 linha.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'id';

-- 4) Extensao pgcrypto/gen_random_uuid disponivel (usada no default da PK)?
--    Esperado: 1 linha (ja usada por todas as outras tabelas do schema).
select gen_random_uuid() is not null as gen_random_uuid_ok;
