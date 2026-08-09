-- ===========================================================================
-- MIGRATION 0009 — Assets de captura (inbox_attachments) + Storage privado
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO (Sprint 1 / Etapa 2)
--   Infra minima e segura para PERSISTIR o descritor de um asset de captura
--   (foto agora; pdf/audio/file no futuro) e ARMAZENAR o binario em bucket
--   privado. Sem OCR, sem processamento, sem metadata generico, sem raw/
--   normalized (ARCHITECTURE.md ADR-07: entram em sprints futuras).
--
-- MODELAGEM
--   * kind e TEXT (image|pdf|audio|file) validado na APLICACAO — sem enum
--     PostgreSQL e sem CHECK em kind, por coerencia com a decisao de `origin`
--     (texto livre/extensivel). Unico CHECK: bytes >= 0 (integridade pura).
--   * Tabela IMUTAVEL: apenas SELECT/INSERT/DELETE (sem UPDATE).
--   * FKs ON DELETE CASCADE (workspace/inbox_item) removem apenas a LINHA do
--     descritor; o BINARIO no Storage e responsabilidade do captureService
--     (Etapa 3) — o banco nunca apaga arquivo.
--
-- Depende de: 0002 (tasks/base) e 0003..0006 (inbox). 0008 nao e pre-requisito.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Tabela de descritores de asset
-- ---------------------------------------------------------------------------
create table if not exists public.inbox_attachments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id)  on delete cascade,
  inbox_item_id  uuid not null references public.inbox_items(id) on delete cascade,
  kind           text not null,                -- image | pdf | audio | file (app-validated)
  storage_bucket text not null,
  storage_path   text not null,
  mime           text not null,
  bytes          bigint not null check (bytes >= 0),
  width          integer,
  height         integer,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  -- Impede referenciar duas vezes o MESMO objeto fisico.
  constraint inbox_attachments_object_unique unique (storage_bucket, storage_path)
);

create index if not exists idx_inbox_attachments_item
  on public.inbox_attachments(inbox_item_id);
create index if not exists idx_inbox_attachments_ws
  on public.inbox_attachments(workspace_id);

alter table public.inbox_attachments enable row level security;

-- SELECT/INSERT/DELETE por pertencimento; INSERT exige identidade propria.
-- SEM policy de UPDATE => tabela imutavel (so exclusao).
drop policy if exists inbox_attachments_select on public.inbox_attachments;
create policy inbox_attachments_select on public.inbox_attachments
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists inbox_attachments_insert on public.inbox_attachments;
create policy inbox_attachments_insert on public.inbox_attachments
  for insert with check (
    public.is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
  );

drop policy if exists inbox_attachments_delete on public.inbox_attachments;
create policy inbox_attachments_delete on public.inbox_attachments
  for delete using (public.is_workspace_member(workspace_id));

-- GRANTS — estado explicito, nunca herdado.
-- O schema.sql tem `alter default privileges ... grant select,insert,update,
-- delete` e o Supabase provisiona defaults nativos; ambos alcancam esta tabela
-- ja no CREATE TABLE. GRANT apenas SOMA privilegios — por isso REVOKE primeiro,
-- para que o conjunto final seja deterministico e a imutabilidade (sem UPDATE)
-- seja real, e nao apenas uma intencao documentada.
-- TRUNCATE importa em especial: NAO e filtrado por RLS.
revoke all privileges on public.inbox_attachments from anon;
revoke all privileges on public.inbox_attachments from authenticated;
grant select, insert, delete on public.inbox_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Bucket PRIVADO 'captures' (idempotente)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do update set public = false;  -- garante privado se ja existia

-- ---------------------------------------------------------------------------
-- 3) Policies de storage.objects — restritas ao bucket 'captures' e ao
--    workspace (1o segmento do path = workspace_id). Sem UPDATE nesta fase.
--    (storage.foldername(name))[1] = primeiro "folder" => workspace_id.
-- ---------------------------------------------------------------------------
drop policy if exists "captures objects select" on storage.objects;
create policy "captures objects select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'captures'
    and public.is_workspace_member( ((storage.foldername(name))[1])::uuid )
  );

drop policy if exists "captures objects insert" on storage.objects;
create policy "captures objects insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'captures'
    and public.is_workspace_member( ((storage.foldername(name))[1])::uuid )
  );

drop policy if exists "captures objects delete" on storage.objects;
create policy "captures objects delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'captures'
    and public.is_workspace_member( ((storage.foldername(name))[1])::uuid )
  );

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0009
-- Verificacao: rode 0009_inbox_attachments.verify.sql
-- Reverter:    rode 0009_inbox_attachments.rollback.sql (preserva bucket com objetos)
-- ===========================================================================
