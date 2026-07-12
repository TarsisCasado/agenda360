-- ===========================================================================
-- MIGRATION 0005 — Caixa de Entrada · Milestone A2.1
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Transformar a Caixa de Entrada em modulo de organizacao, com o MINIMO:
--     1. inbox_items.type    -> 'note' | 'checklist'
--     2. inbox_items.status  -> 'inbox' | 'to_think' | 'archived'
--        (substitui a coluna booleana `archived` do 0003)
--     3. inbox_items.seen    -> controle apenas VISUAL (Novo/Visto)
--     4. inbox_checklist_items -> itens de checklist (add/editar/remover/marcar)
--   Nada alem disso (sem origem, processamento, timeline, compartilhamento,
--   delegacao, conversao em atividade). Dominio segue independente de tasks.
--
-- ANALISE DE IMPACTO
--   * ADD COLUMN com default: sem rewrite (metadados). Backfill de status a
--     partir de archived antes de remover a coluna.
--   * DROP COLUMN archived: remove a coluna booleana (dados migrados p/ status).
--   * Nova tabela inbox_checklist_items: nao afeta dados existentes.
--   * RLS no padrao do projeto (pertencimento ao workspace).
--   * Idempotente.
--
-- Depende de: 0003 e 0004 aplicadas.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Novas colunas em inbox_items
-- ---------------------------------------------------------------------------
alter table public.inbox_items
  add column if not exists type text not null default 'note';    -- 'note' | 'checklist'
alter table public.inbox_items
  add column if not exists status text not null default 'inbox';  -- 'inbox' | 'to_think' | 'archived'
alter table public.inbox_items
  add column if not exists seen boolean not null default false;

-- Backfill: preserva o que estava arquivado (0003 usava boolean archived).
update public.inbox_items set status = 'archived'
  where status = 'inbox'
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inbox_items'
        and column_name = 'archived'
    )
    and coalesce(archived, false) = true;

-- Remove a coluna archived (substituida por status). O indice antigo que a
-- referenciava e removido junto.
drop index if exists public.idx_inbox_items_ws;
alter table public.inbox_items drop column if exists archived;

-- Novo indice de listagem por status.
create index if not exists idx_inbox_items_ws_status
  on public.inbox_items(workspace_id, status, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2) Itens de checklist (checklist SIMPLES: sem subtarefas/niveis/dependencias)
-- ---------------------------------------------------------------------------
create table if not exists public.inbox_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  position      integer not null default 0,
  text          text not null default '',
  checked       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_inbox_checklist_item
  on public.inbox_checklist_items(inbox_item_id, position);

alter table public.inbox_checklist_items enable row level security;

drop policy if exists inbox_checklist_items_select on public.inbox_checklist_items;
create policy inbox_checklist_items_select on public.inbox_checklist_items
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists inbox_checklist_items_insert on public.inbox_checklist_items;
create policy inbox_checklist_items_insert on public.inbox_checklist_items
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists inbox_checklist_items_update on public.inbox_checklist_items;
create policy inbox_checklist_items_update on public.inbox_checklist_items
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists inbox_checklist_items_delete on public.inbox_checklist_items;
create policy inbox_checklist_items_delete on public.inbox_checklist_items
  for delete using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.inbox_checklist_items to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0005
-- Verificacao: rode 0005_inbox_a21.verify.sql
-- Reverter:    rode 0005_inbox_a21.rollback.sql
-- ===========================================================================
