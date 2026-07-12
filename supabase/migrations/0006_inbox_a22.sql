-- ===========================================================================
-- MIGRATION 0006 — Caixa de Entrada · Milestone A2.2 (memoria/timeline)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Dar MEMORIA a Caixa de Entrada, com o MINIMO:
--     1. inbox_items.origin -> proveniencia (apenas 'manual' por enquanto).
--     2. inbox_events       -> historico interno (timeline) APPEND-ONLY.
--   O estado 'processed' de inbox_items.status NAO exige mudanca de banco
--   (status e text livre; a validacao fica na aplicacao).
--
--   NAO integra Assistente/IA/Tool Registry (apenas prepara a estrutura).
--
-- ANALISE DE IMPACTO
--   * ADD COLUMN origin com default: sem rewrite.
--   * Nova tabela inbox_events: nao afeta dados existentes; imutavel (sem
--     UPDATE/DELETE via cliente) -> "nunca apagar movimentacoes".
--   * RLS no padrao do projeto. Idempotente.
--
-- Depende de: 0003, 0004 e 0005 aplicadas.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Origem (apenas 'manual' por ora; enum-like em texto, extensivel de graca)
-- ---------------------------------------------------------------------------
alter table public.inbox_items
  add column if not exists origin text not null default 'manual';

-- ---------------------------------------------------------------------------
-- 2) Timeline / historico interno (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.inbox_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null default auth.uid(),
  action        text not null,           -- created|edited|archived|restored|moved_to_think|moved_to_inbox|seen|unseen
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_inbox_events_item
  on public.inbox_events(inbox_item_id, created_at desc);
-- BRIN para tabela append-only por tempo (escala barata).
create index if not exists idx_inbox_events_created_brin
  on public.inbox_events using brin(created_at);

alter table public.inbox_events enable row level security;

-- SELECT/INSERT por pertencimento; INSERT tambem exige identidade propria
-- (ou NULL, para eventos de sistema). Sem UPDATE/DELETE: historico imutavel.
drop policy if exists inbox_events_select on public.inbox_events;
create policy inbox_events_select on public.inbox_events
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists inbox_events_insert on public.inbox_events;
create policy inbox_events_insert on public.inbox_events
  for insert with check (
    public.is_workspace_member(workspace_id)
    and (actor_id is null or actor_id = (select auth.uid()))
  );

grant select, insert on public.inbox_events to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0006
-- Verificacao: rode 0006_inbox_a22.verify.sql
-- Reverter:    rode 0006_inbox_a22.rollback.sql
-- ===========================================================================
