-- ===========================================================================
-- ROLLBACK da migration 0006 (volta ao estado do 0005)
-- ATENCAO: remove o historico (inbox_events) e a coluna origin.
-- ===========================================================================

begin;

drop table if exists public.inbox_events;

alter table public.inbox_items drop column if exists origin;

commit;
