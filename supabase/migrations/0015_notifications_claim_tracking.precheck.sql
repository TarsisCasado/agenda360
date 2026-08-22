-- ===========================================================================
-- PRECHECK da migration 0015 (rode ANTES; nao altera nada) — 3 checks
-- ===========================================================================

-- 1) A coluna ja existe? Esperado: 0 linhas na 1a aplicacao.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications' and column_name = 'claimed_at';

-- 2) Volume atual por status (contexto; nao bloqueia nada).
select status, count(*) from public.notifications group by status order by status;

-- 3) O indice que a 0015 vai criar ja existe com outro nome/definicao?
--    Esperado: 0 linhas.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'notifications'
  and indexname = 'idx_notifications_processing_claimed';
