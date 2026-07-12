-- ===========================================================================
-- ROLLBACK da migration 0003 (reverte a fundacao A1 da Caixa de Entrada)
-- ATENCAO: remove a tabela inbox_items e TODOS os seus dados.
-- ===========================================================================

begin;

drop trigger if exists trg_inbox_items_updated on public.inbox_items;

drop policy if exists inbox_items_select on public.inbox_items;
drop policy if exists inbox_items_insert on public.inbox_items;
drop policy if exists inbox_items_update on public.inbox_items;
drop policy if exists inbox_items_delete on public.inbox_items;

drop table if exists public.inbox_items;

commit;
