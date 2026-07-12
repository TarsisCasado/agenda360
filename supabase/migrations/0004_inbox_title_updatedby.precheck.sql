-- ===========================================================================
-- PRECHECK da migration 0004 (rode ANTES; nao altera nada)
-- ===========================================================================

-- 1) A tabela 0003 existe? Esperado: nao-nulo.
select to_regclass('public.inbox_items') as inbox_items_regclass;

-- 2) As colunas ja existem? Esperado: 0 linhas na primeira aplicacao.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
  and column_name in ('title', 'updated_by');
