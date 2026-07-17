-- ===========================================================================
-- PRECHECK da migration 0007 (rode ANTES; nao altera nada)
-- ---------------------------------------------------------------------------
-- T-Core minimo: tornar public.tasks.date anulavel e adicionar
-- public.tasks.origin text NOT NULL default 'manual'. Somente leitura.
-- ===========================================================================

-- 1) Pre-requisito: a tabela tasks existe? Esperado: nao-nulo.
select to_regclass('public.tasks') as tasks_regclass;

-- 2) Estado ATUAL da coluna date. Esperado (1a aplicacao): is_nullable = 'NO'.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='tasks' and column_name='date';

-- 3) A coluna origin ja existe? Esperado: 0 linhas na 1a aplicacao.
select column_name
from information_schema.columns
where table_schema='public' and table_name='tasks' and column_name='origin';

-- 4) Diagnostico: quantas tasks ja estao sem data hoje? Esperado: 0 (a coluna
--    ainda e NOT NULL). Informa o "antes" para conferir a mudanca de contrato.
select count(*) as tasks_sem_data
from public.tasks
where date is null;
