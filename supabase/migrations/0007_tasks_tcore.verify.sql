-- ===========================================================================
-- VERIFICACAO da migration 0007 (rode apos aplicar)
-- ===========================================================================

-- 1) date agora e anulavel? Esperado: is_nullable = 'YES'.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='tasks' and column_name='date';

-- 2) origin presente, NOT NULL e com default 'manual'?
--    Esperado: 1 linha, is_nullable = 'NO', column_default contendo 'manual'.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='tasks' and column_name='origin';

-- 3) Nenhuma linha existente ficou sem origin? Esperado: 0.
select count(*) as tasks_sem_origin
from public.tasks
where origin is null;
