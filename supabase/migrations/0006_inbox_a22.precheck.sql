-- ===========================================================================
-- PRECHECK da migration 0006 (rode ANTES; nao altera nada)
-- ===========================================================================

-- 1) Pre-requisito (0005). Esperado: inbox_items existe com status.
select
  to_regclass('public.inbox_items') is not null as tem_inbox_items,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inbox_items' and column_name='status'
  ) as tem_status;

-- 2) A coluna origin ja existe? Esperado: 0 linhas na 1a aplicacao.
select column_name
from information_schema.columns
where table_schema='public' and table_name='inbox_items' and column_name='origin';

-- 3) A tabela de eventos ja existe? Esperado: NULL na 1a aplicacao.
select to_regclass('public.inbox_events') as inbox_events_regclass;
