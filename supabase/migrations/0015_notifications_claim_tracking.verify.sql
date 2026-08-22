-- ===========================================================================
-- VERIFICACAO da migration 0015 (rode apos aplicar) — 2 checks
-- ===========================================================================

-- 1) Coluna claimed_at — tipo timestamptz, nullable. Esperado: OK.
select
  data_type, is_nullable,
  case
    when data_type = 'timestamp with time zone' and is_nullable = 'YES' then 'OK'
    else 'FALHOU'
  end as veredito
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications' and column_name = 'claimed_at';

-- 2) Indice parcial presente. Esperado: 1 linha 'OK'.
select indexname,
  case when indexname = 'idx_notifications_processing_claimed' then 'OK' else 'FALHOU' end as veredito
from pg_indexes
where schemaname = 'public' and tablename = 'notifications'
  and indexname = 'idx_notifications_processing_claimed';
