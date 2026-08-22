-- ===========================================================================
-- MIGRATION 0014 — Tabela PUSH_SUBSCRIPTIONS (Sprint 2 / Etapa 1D — DELIVERY)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Armazenar as subscriptions Web Push (endpoint + chaves p256dh/auth) de
--   cada usuario, para que o push-delivery-worker (Etapa 1D) possa entregar
--   notifications(channel='push') como notificacoes nativas do navegador/SO.
--
-- O QUE ESTA MIGRATION FAZ
--   1. cria public.push_subscriptions (ADITIVA — tabela nova, nenhuma tabela
--      existente e alterada);
--   2. RLS por DONO (user_id = auth.uid()) — NAO por workspace: uma
--      subscription pertence a um dispositivo/navegador de UM usuario, nunca
--      a um workspace (mesmo padrao de "dado do usuario" usado em profiles);
--   3. UNIQUE(endpoint) — o endpoint do push service (FCM/APNs/Mozilla) e
--      globalmente unico por instalacao de navegador; garante idempotencia no
--      upsert (o cliente chama subscribe() de novo e recebe o MESMO endpoint
--      sempre que a subscription anterior segue valida);
--   4. indice parcial para o worker varrer apenas subscriptions VIVAS.
--
-- O QUE ESTA MIGRATION **NAO** FAZ
--   * NAO altera profiles/tasks/reminders/notifications;
--   * NAO cria worker, pg_cron nem toca no frontend (isso e 1D/1E, migrations
--     separadas: 0015 = agendador do push-delivery-worker);
--   * NAO concede nenhum privilegio a anon;
--   * NAO permite que um usuario leia/escreva subscription de outro usuario.
--
-- ESCRITA DE `disabled_at`/`last_seen_at`
--   O delivery worker roda com service_role (bypassa RLS), entao desativar uma
--   subscription invalida (HTTP 404/410 do push service) NAO depende de
--   nenhuma policy de UPDATE para `authenticated` alem da que o proprio dono
--   ja tem (mantida por simetria com o padrao CRUD de `reminders`, permitindo
--   tambem que o cliente faca upsert por ON CONFLICT(endpoint) DO UPDATE ao
--   reconfirmar uma subscription existente).
--
-- Depende de: schema base (profiles) + 0011 (padrao de grants minimos).
-- ===========================================================================

begin;

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  disabled_at     timestamptz,
  disabled_reason text
);

comment on table public.push_subscriptions is
  'Subscriptions Web Push (RFC 8030) de cada usuario/dispositivo. Multiplas '
  'linhas por usuario (um navegador/dispositivo cada). Escrita de linha viva '
  'pelo dono via RLS; desativacao (disabled_at) feita pelo push-delivery-worker '
  '(service_role) quando o push service responde 404/410.';
comment on column public.push_subscriptions.endpoint is
  'URL do push service (unica por instalacao de navegador). Chave de '
  'idempotencia: reassinar o mesmo dispositivo faz upsert, nao duplica.';
comment on column public.push_subscriptions.p256dh is
  'Chave publica ECDH (base64url) da subscription — usada para cifrar o payload (RFC 8291).';
comment on column public.push_subscriptions.auth is
  'Segredo de autenticacao (base64url) da subscription — usado na cifra do payload (RFC 8291).';
comment on column public.push_subscriptions.disabled_at is
  'Quando o worker desativou a subscription (endpoint expirado/invalido: '
  'HTTP 404/410 do push service). NULL = viva. Nunca apagamos a linha: '
  'preserva historico/auditoria e evita recriacao acidental pelo mesmo cliente.';

-- IDEMPOTENCIA: um endpoint pertence a UMA instalacao de navegador; upsert por
-- ON CONFLICT(endpoint) evita duplicar a mesma subscription a cada login.
create unique index if not exists uq_push_subscriptions_endpoint
  on public.push_subscriptions (endpoint);

-- Indice de apoio ao worker: varrer so as subscriptions VIVAS de um usuario.
create index if not exists idx_push_subscriptions_user_alive
  on public.push_subscriptions (user_id)
  where disabled_at is null;

-- ---------------------------------------------------------------------------
-- RLS — por DONO (nao por workspace).
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- GRANTS — minimo comprovado (mesma matriz da 0011: anon = zero).
-- ---------------------------------------------------------------------------
revoke all privileges on public.push_subscriptions from anon;
revoke all privileges on public.push_subscriptions from authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0014
-- Verificacao: rode 0014_push_subscriptions.verify.sql
-- Reverter:    0014_push_subscriptions.rollback.sql
-- ===========================================================================
