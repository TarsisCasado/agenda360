-- ===========================================================================
-- VERIFICACAO DE SCHEMA DE PRODUCAO (SOMENTE LEITURA)
-- ---------------------------------------------------------------------------
-- Confirma que as migrations 0002..0006 estao refletidas no schema, SEM alterar
-- nada (apenas SELECTs). Nao cria tabela de migrations, nao altera dados.
--
-- Como usar: Supabase -> SQL Editor -> New query -> cole tudo -> Run.
-- O Supabase mostra o resultado da ULTIMA consulta: um resumo com all_ok = true
-- quando o schema esta completo. Os SELECTs anteriores sao detalhamentos
-- opcionais (rode isolado se quiser inspecionar item a item).
-- ===========================================================================

-- (Opcional) Detalhe: colunas de inbox_items
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_items'
order by ordinal_position;

-- (Opcional) Detalhe: policies das tabelas da Inbox
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('inbox_items', 'inbox_checklist_items', 'inbox_events')
order by tablename, cmd, policyname;

-- (Opcional) Detalhe: indices das tabelas da Inbox
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('inbox_items', 'inbox_checklist_items', 'inbox_events')
order by tablename, indexname;

-- ===========================================================================
-- RESUMO CONSOLIDADO (este e o resultado que o SQL Editor exibe)
-- Esperado: todas as colunas = true, inclusive all_ok = true.
-- ===========================================================================
with checks as (
  select
    -- Tabelas essenciais existem?
    to_regclass('public.inbox_items')            is not null as t_inbox_items,
    to_regclass('public.inbox_checklist_items')  is not null as t_checklist,
    to_regclass('public.inbox_events')           is not null as t_events,

    -- inbox_items tem as 12 colunas esperadas?
    (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'inbox_items'
         and column_name in ('id','workspace_id','created_by','updated_by',
           'title','content','type','status','seen','origin',
           'created_at','updated_at')) = 12                  as cols_inbox_items_ok,

    -- coluna antiga 'archived' foi removida no 0005?
    (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'inbox_items'
         and column_name = 'archived') = 0                   as archived_removido,

    -- RLS habilitada nas 3 tabelas?
    (select count(*) = 3 from pg_tables
       where schemaname = 'public'
         and tablename in ('inbox_items','inbox_checklist_items','inbox_events')
         and rowsecurity = true)                             as rls_ok,

    -- Policies por-comando presentes? (items 4, checklist 4, events 2)
    (select count(*) from pg_policies
       where schemaname='public' and tablename='inbox_items') = 4
                                                             as pol_items_ok,
    (select count(*) from pg_policies
       where schemaname='public' and tablename='inbox_checklist_items') = 4
                                                             as pol_checklist_ok,
    (select count(*) from pg_policies
       where schemaname='public' and tablename='inbox_events') = 2
                                                             as pol_events_ok,

    -- Trigger de updated_at em inbox_items?
    (select count(*) from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname='inbox_items'
        and t.tgname='trg_inbox_items_updated' and not t.tgisinternal) = 1
                                                             as trigger_updated_ok,

    -- Indices essenciais presentes?
    (select count(*) from pg_indexes
       where schemaname='public'
         and indexname in ('idx_inbox_items_ws_status',
           'idx_inbox_checklist_item','idx_inbox_events_item',
           'idx_inbox_events_created_brin')) = 4             as indexes_ok
)
select
  *,
  (t_inbox_items and t_checklist and t_events
   and cols_inbox_items_ok and archived_removido and rls_ok
   and pol_items_ok and pol_checklist_ok and pol_events_ok
   and trigger_updated_ok and indexes_ok)                    as all_ok
from checks;
