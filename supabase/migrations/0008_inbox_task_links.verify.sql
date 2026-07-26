-- ===========================================================================
-- VERIFICACAO da migration 0008 (rode apos aplicar)
-- ===========================================================================

-- 1) Tabela criada? Esperado: nao-nulo.
select to_regclass('public.inbox_task_links') as inbox_task_links_regclass;

-- 2) Colunas esperadas (6)? Esperado: 6.
select count(*) as colunas_ok
from information_schema.columns
where table_schema='public' and table_name='inbox_task_links'
  and column_name in ('id','workspace_id','inbox_item_id','task_id','created_by','created_at');

-- 3) Unique em task_id (1 Task -> 1 InboxItem)? Esperado: 1 linha.
select conname
from pg_constraint
where conrelid = 'public.inbox_task_links'::regclass and contype = 'u';

-- 4) NAO ha unique em inbox_item_id (1 InboxItem -> N Tasks)? Esperado: 0.
select count(*) as unique_indevido_em_inbox
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.conrelid = 'public.inbox_task_links'::regclass and c.contype = 'u'
  and a.attname = 'inbox_item_id';

-- 5) RLS habilitada? Esperado: true.
select rowsecurity from pg_tables
where schemaname='public' and tablename='inbox_task_links';

-- 6) Policies: apenas select e insert (imutavel). Esperado: 2 linhas.
select policyname, cmd
from pg_policies
where schemaname='public' and tablename='inbox_task_links'
order by cmd, policyname;

-- 7) Indice de busca por inbox_item_id presente? Esperado: idx_inbox_task_links_inbox.
select indexname from pg_indexes
where schemaname='public' and tablename='inbox_task_links';
