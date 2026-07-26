-- ===========================================================================
-- MIGRATION 0008 — Vinculo Caixa de Entrada <-> Atividade (inbox_task_links)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Registrar a proveniencia de uma Task criada A PARTIR de um InboxItem,
--   reutilizando integralmente o dominio de tasks (SEM novo dominio, SEM
--   tabela activities). A Inbox continua central de captura; a Task, o centro
--   operacional. Este vinculo sera reaproveitado no futuro por foto/OCR/PDF/
--   IA/e-mail/WhatsApp/Google Calendar.
--
-- CARDINALIDADE
--   * 1 InboxItem -> muitas Tasks (permitido; NAO ha unique em inbox_item_id).
--   * 1 Task      -> 1 InboxItem  (garantido por unique(task_id)).
--   Assim a evolucao futura (varias tasks por captura) NAO fica bloqueada.
--
-- ANALISE DE IMPACTO
--   * Nova tabela isolada; nao altera inbox_items nem tasks.
--   * FKs com ON DELETE CASCADE: excluir a Task ou o InboxItem remove apenas o
--     vinculo (nunca o outro lado). "Nunca apagar atividade/captura por tabela".
--   * RLS no padrao do projeto. Append-only (sem UPDATE). Idempotente.
--
-- Depende de: 0003..0006 (inbox) e 0002 (tasks) aplicadas.
-- ===========================================================================

begin;

create table if not exists public.inbox_task_links (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  inbox_item_id uuid not null references public.inbox_items(id) on delete cascade,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  -- 1 Task -> no maximo 1 InboxItem (nesta versao). NAO restringe inbox_item_id.
  constraint inbox_task_links_task_unique unique (task_id)
);

-- Buscar todas as tasks de um InboxItem (futuro: 1 -> N).
create index if not exists idx_inbox_task_links_inbox
  on public.inbox_task_links(inbox_item_id);
-- (task_id ja possui indice unico implicito pela constraint acima.)

alter table public.inbox_task_links enable row level security;

-- SELECT/INSERT por pertencimento; INSERT tambem exige identidade propria
-- (created_by = auth.uid()). Sem UPDATE: vinculo imutavel. Sem DELETE de
-- cliente: a remocao acontece por CASCADE quando a Task/InboxItem some.
drop policy if exists inbox_task_links_select on public.inbox_task_links;
create policy inbox_task_links_select on public.inbox_task_links
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists inbox_task_links_insert on public.inbox_task_links;
create policy inbox_task_links_insert on public.inbox_task_links
  for insert with check (
    public.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

grant select, insert on public.inbox_task_links to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0008
-- Verificacao: rode 0008_inbox_task_links.verify.sql
-- Reverter:    rode 0008_inbox_task_links.rollback.sql
-- ===========================================================================
