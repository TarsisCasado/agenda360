-- ===========================================================================
-- VERIFICACAO da migration 0004 (rode apos aplicar)
-- ===========================================================================

-- 1) Colunas title e updated_by presentes? Esperado: 2 linhas.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
  and column_name in ('title', 'updated_by')
order by column_name;

-- 2) title NOT NULL default ''? updated_by com DEFAULT auth.uid()?
--    Esperado: title -> is_nullable=NO, default ''::text;
--              updated_by -> column_default contendo "auth.uid()".

-- 3) FK de updated_by -> profiles presente? Esperado: 1 linha.
select conname
from pg_constraint
where conrelid = 'public.inbox_items'::regclass
  and contype = 'f'
  and pg_get_constraintdef(oid) ilike '%updated_by%';
