-- ===========================================================================
-- PRECHECK da migration 0005 (rode ANTES; nao altera nada)
-- ===========================================================================

-- 1) Pre-requisitos (0003/0004). Esperado: inbox_items existe.
select to_regclass('public.inbox_items') as inbox_items_regclass;

-- 2) Estado atual das colunas relevantes. Esperado (1a aplicacao):
--    archived presente; type/status/seen ausentes.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
  and column_name in ('archived', 'type', 'status', 'seen')
order by column_name;

-- 3) A tabela de checklist ja existe? Esperado: NULL na 1a aplicacao.
select to_regclass('public.inbox_checklist_items') as checklist_regclass;
