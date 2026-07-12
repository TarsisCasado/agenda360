-- ===========================================================================
-- ROLLBACK da migration 0004 (remove title e updated_by de inbox_items)
-- ATENCAO: remove os dados dessas duas colunas.
-- ===========================================================================

begin;

alter table public.inbox_items drop column if exists updated_by;
alter table public.inbox_items drop column if exists title;

commit;
