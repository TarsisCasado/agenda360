-- ===========================================================================
-- ROLLBACK da migration 0005 (volta ao estado do 0004)
-- ATENCAO: remove os itens de checklist e as colunas type/status/seen.
-- Restaura a coluna booleana archived a partir de status.
-- ===========================================================================

begin;

-- Remove a tabela de checklist (e seus dados).
drop table if exists public.inbox_checklist_items;

-- Restaura a coluna archived a partir de status.
alter table public.inbox_items add column if not exists archived boolean not null default false;
update public.inbox_items set archived = true where status = 'archived';

-- Restaura o indice original e remove o de status.
drop index if exists public.idx_inbox_items_ws_status;
create index if not exists idx_inbox_items_ws
  on public.inbox_items(workspace_id, archived, updated_at desc);

-- Remove as colunas novas.
alter table public.inbox_items drop column if exists seen;
alter table public.inbox_items drop column if exists status;
alter table public.inbox_items drop column if exists type;

commit;
