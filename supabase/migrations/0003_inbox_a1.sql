-- ===========================================================================
-- MIGRATION 0003 — Caixa de Entrada Inteligente · Milestone A1
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Fundacao MINIMA da Caixa de Entrada: apenas NOTA DE TEXTO SIMPLES.
--   Dominio proprio, INDEPENDENTE de tasks (Inbox -> (futuro) Task; nunca o
--   contrario). Sem checklist, anexos, origem, processamento, timeline,
--   compartilhamento, delegacao ou conversao — tudo isso entra em migrations
--   futuras (A2/B/C/D).
--
-- O QUE CRIA (exatamente)
--   1. Tabela public.inbox_items (campos minimos: content + archived).
--   2. Indice de listagem por workspace.
--   3. Trigger updated_at (reusa public.set_updated_at).
--   4. RLS por-comando no padrao do projeto (migration 0002):
--        SELECT/UPDATE/DELETE -> pertencimento ao workspace;
--        INSERT               -> pertencimento + created_by = auth.uid().
--   5. GRANT para o papel authenticated (RLS continua sendo a barreira).
--
-- ANALISE DE IMPACTO
--   * Tabela NOVA: nao altera dados existentes, sem rewrite.
--   * DEFAULT auth.uid() em created_by (mesmo padrao de tasks/links no 0002).
--   * Idempotente: pode rodar novamente sem erro.
--
-- Depende de: 0001 (schema.sql) — workspaces, profiles, is_workspace_member,
--             set_updated_at.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) TABELA (campos minimos — nada "porque um dia sera usado")
-- ---------------------------------------------------------------------------
create table if not exists public.inbox_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  content       text not null default '',
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2) Indice de listagem: ativos/arquivados por workspace, mais recentes 1o.
create index if not exists idx_inbox_items_ws
  on public.inbox_items(workspace_id, archived, updated_at desc);

-- 3) updated_at automatico (reusa a funcao ja existente)
drop trigger if exists trg_inbox_items_updated on public.inbox_items;
create trigger trg_inbox_items_updated before update on public.inbox_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS por-comando (identico ao padrao de tasks/links no 0002)
-- ---------------------------------------------------------------------------
alter table public.inbox_items enable row level security;

drop policy if exists inbox_items_select on public.inbox_items;
create policy inbox_items_select on public.inbox_items
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists inbox_items_insert on public.inbox_items;
create policy inbox_items_insert on public.inbox_items
  for insert with check (
    public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
  );

drop policy if exists inbox_items_update on public.inbox_items;
create policy inbox_items_update on public.inbox_items
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists inbox_items_delete on public.inbox_items;
create policy inbox_items_delete on public.inbox_items
  for delete using (public.is_workspace_member(workspace_id));

-- 5) GRANT (RLS continua sendo a barreira efetiva por linha)
grant select, insert, update, delete on public.inbox_items to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0003
-- Verificacao: rode 0003_inbox_a1.verify.sql
-- Reverter:    rode 0003_inbox_a1.rollback.sql
-- ===========================================================================
