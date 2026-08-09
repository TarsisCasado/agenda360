-- ===========================================================================
-- Agenda Inteligente 360 — Schema do banco (Supabase / PostgreSQL)
-- Arquitetura MULTI-TENANT por WORKSPACE (SaaS escalavel)
-- ---------------------------------------------------------------------------
-- Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. SQL Editor > cole este arquivo inteiro > Run.
--   3. Copie URL e anon key (Settings > API) para o .env.local do front.
--
-- Modelo de dados:
--   auth.users (Supabase) 1--1 profiles
--   profiles 1--N workspaces (dono)  |  profiles N--N workspaces (membros)
--   workspace 1--N { categories, tasks, links, reminders, logs, delegations,
--                    ai_conversations, integrations, notifications }
--
-- Toda a autorizacao (RLS) e feita por PERTENCIMENTO AO WORKSPACE, nao por
-- usuario isolado. Isso permite crescer para times, papeis e multiplos espacos
-- (Pessoal, Carmais, Familia, Igreja, Projetos...) sem remodelar o banco.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin create type user_role as enum ('admin','manager','collaborator');
exception when duplicate_object then null; end $$;

-- Papel DENTRO de um workspace (autorizacao efetiva do produto)
do $$ begin create type workspace_role as enum
  ('owner','admin','manager','collaborator','viewer');
exception when duplicate_object then null; end $$;

do $$ begin create type task_status as enum
  ('todo','in_progress','done','missed','delegated','not_needed','rescheduled','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type task_priority as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin create type alert_type as enum ('in_app','push','email','whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin create type link_action as enum
  ('task','meeting','idea','project','reminder','future_agenda');
exception when duplicate_object then null; end $$;

do $$ begin create type log_action as enum
  ('create','update','status_change','reschedule','delegate','cancel','complete','delete');
exception when duplicate_object then null; end $$;

-- Preparacao para IA (nao usado ainda pela aplicacao)
do $$ begin create type ai_message_role as enum ('system','user','assistant','tool');
exception when duplicate_object then null; end $$;

-- Preparacao para automacoes / integracoes (nao usado ainda)
do $$ begin create type integration_provider as enum
  ('google_calendar','whatsapp','email','push','webhook');
exception when duplicate_object then null; end $$;

do $$ begin create type integration_status as enum ('pending','active','error','revoked');
exception when duplicate_object then null; end $$;

do $$ begin create type delivery_status as enum
  ('pending','processing','sent','failed','cancelled');
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- FUNCOES UTILITARIAS
-- ===========================================================================

-- updated_at automatico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- TABELAS BASE
-- ===========================================================================

-- PROFILES (extensao de auth.users) --------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  full_name             text,
  avatar_url            text,
  role                  user_role not null default 'collaborator', -- papel de PLATAFORMA
  default_workspace_id  uuid,  -- FK adicionada apos workspaces (evita ciclo na criacao)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- WORKSPACES (tenant) ----------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  is_personal boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_workspaces_owner on public.workspaces(owner_id);

-- FK circular resolvida aqui
alter table public.profiles
  drop constraint if exists profiles_default_workspace_fk;
alter table public.profiles
  add constraint profiles_default_workspace_fk
  foreign key (default_workspace_id) references public.workspaces(id) on delete set null;

-- WORKSPACE_MEMBERS (N--N usuarios x workspaces) -------------------------
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          workspace_role not null default 'collaborator',
  invited_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists idx_members_user on public.workspace_members(user_id);
create index if not exists idx_members_workspace on public.workspace_members(workspace_id);

-- ---------------------------------------------------------------------------
-- HELPERS DE AUTORIZACAO (SECURITY DEFINER)
-- Rodam com privilegios do dono da funcao e ignoram RLS -> evitam recursao nas
-- policies e sao STABLE (o planner avalia uma vez por statement).
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = (select auth.uid())
      and role in ('owner','admin')
  );
$$;

-- Dois usuarios compartilham algum workspace? (visibilidade de colegas)
create or replace function public.shares_workspace(other_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.workspace_members m1
    join public.workspace_members m2 on m1.workspace_id = m2.workspace_id
    where m1.user_id = (select auth.uid()) and m2.user_id = other_user
  );
$$;

-- ===========================================================================
-- TABELAS DE DADOS (todas escopadas por workspace_id)
-- ===========================================================================

-- CATEGORIES -------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  name          text not null,
  color         text not null default '#6366f1',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_categories_ws on public.categories(workspace_id);
create unique index if not exists uq_categories_ws_name
  on public.categories(workspace_id, lower(name));

-- TASKS ------------------------------------------------------------------
create table if not exists public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  created_by            uuid references public.profiles(id) on delete set null, -- dono
  assignee_id           uuid references public.profiles(id) on delete set null, -- responsavel
  delegated_by          uuid references public.profiles(id) on delete set null,
  delegated_at          timestamptz,
  title                 text not null,
  description           text default '',
  date                  date not null,
  start_time            time,
  end_time              time,
  category_id           uuid references public.categories(id) on delete set null,
  priority              task_priority not null default 'medium',
  status                task_status not null default 'todo',
  link                  text default '',
  notes                 text default '',
  alert_enabled         boolean not null default false,
  alert_type            alert_type not null default 'in_app',
  alert_minutes_before  integer not null default 15,
  alert_sent            boolean not null default false,
  reschedule_count      integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_tasks_ws_date on public.tasks(workspace_id, date);
create index if not exists idx_tasks_ws_status on public.tasks(workspace_id, status);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id) where assignee_id is not null;
create index if not exists idx_tasks_category on public.tasks(category_id);

-- LINKS ------------------------------------------------------------------
create table if not exists public.links (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid references public.profiles(id) on delete set null,
  url             text not null,
  title           text,
  note            text default '',
  desired_action  link_action not null default 'task',
  task_id         uuid references public.tasks(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_links_ws on public.links(workspace_id, created_at desc);

-- REMINDERS (intencao de lembrete) --------------------------------------
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  type          alert_type not null default 'in_app',
  remind_at     timestamptz not null,
  sent          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_reminders_pending on public.reminders(remind_at) where sent = false;

-- ACTIVITY LOGS (auditoria / historico) ---------------------------------
create table if not exists public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  task_id       uuid references public.tasks(id) on delete set null,
  action        log_action not null,
  description   text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_logs_ws_created on public.activity_logs(workspace_id, created_at desc);
-- BRIN e otimo para tabela append-only por tempo (escala para milhoes de linhas)
create index if not exists idx_logs_created_brin on public.activity_logs using brin(created_at);

-- DELEGATIONS (HISTORICO imutavel de delegacoes) ------------------------
create table if not exists public.delegations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  from_user_id  uuid references public.profiles(id) on delete set null,
  to_user_id    uuid references public.profiles(id) on delete set null,
  note          text default '',
  created_at    timestamptz not null default now()
);
create index if not exists idx_delegations_task on public.delegations(task_id);
create index if not exists idx_delegations_ws on public.delegations(workspace_id);

-- ===========================================================================
-- PREPARACAO PARA IA (estrutura pronta, sem uso na aplicacao ainda)
-- Relaciona conversas, prompts, decisoes e contexto SEM tocar em tasks.
-- ===========================================================================
create table if not exists public.ai_conversations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  title         text,
  context       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ai_conv_ws on public.ai_conversations(workspace_id, updated_at desc);

create table if not exists public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations(id) on delete cascade,
  role             ai_message_role not null,
  content          text not null default '',
  tokens           integer,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists idx_ai_msg_conv on public.ai_messages(conversation_id, created_at);

-- Decisoes/acoes propostas pela IA e sua relacao com atividades
create table if not exists public.ai_actions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  conversation_id  uuid references public.ai_conversations(id) on delete set null,
  message_id       uuid references public.ai_messages(id) on delete set null,
  action_type      text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'proposed', -- proposed | applied | dismissed
  task_id          uuid references public.tasks(id) on delete set null,
  created_at       timestamptz not null default now(),
  applied_at       timestamptz
);
create index if not exists idx_ai_actions_ws on public.ai_actions(workspace_id, created_at desc);

-- ===========================================================================
-- PREPARACAO PARA AUTOMACOES (Google Calendar, WhatsApp, E-mail, Push)
-- ===========================================================================
-- Contas/integracoes externas conectadas por workspace
create table if not exists public.integrations (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  provider          integration_provider not null,
  status            integration_status not null default 'pending',
  external_account  text,
  config            jsonb not null default '{}'::jsonb, -- tokens/refs (idealmente via secrets)
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_integrations_ws on public.integrations(workspace_id);

-- Outbox de entregas: fila confiavel para disparo assincrono (push/email/wpp...)
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete set null,
  reminder_id    uuid references public.reminders(id) on delete set null,
  channel        alert_type not null default 'in_app',
  status         delivery_status not null default 'pending',
  payload        jsonb not null default '{}'::jsonb,
  scheduled_for  timestamptz,
  sent_at        timestamptz,
  attempts       integer not null default 0,
  last_error     text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_notifications_due
  on public.notifications(scheduled_for) where status = 'pending';

-- ===========================================================================
-- TRIGGERS updated_at
-- ===========================================================================
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_workspaces_updated on public.workspaces;
create trigger trg_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_conv_updated on public.ai_conversations;
create trigger trg_ai_conv_updated before update on public.ai_conversations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_integrations_updated on public.integrations;
create trigger trg_integrations_updated before update on public.integrations
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- TRIGGER DE CADASTRO
-- Cria: profile -> workspace "Pessoal" -> membership (owner) -> categorias seed.
-- O PRIMEIRO usuario cadastrado vira admin de plataforma.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
  ws_id    uuid;
  ws_slug  text;
  cats     text[][] := array[
    ['Pessoal','#6366f1'], ['Trabalho','#0ea5e9'], ['Reuniao','#8b5cf6'],
    ['Ideia','#f59e0b'], ['Projeto','#10b981'], ['Familia','#ec4899'],
    ['Saude','#ef4444'], ['Estudo','#14b8a6'], ['Financeiro','#84cc16'],
    ['Equipe','#f97316']
  ];
  i int;
begin
  select count(*) = 0 into is_first from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when is_first then 'admin'::user_role else 'collaborator'::user_role end
  );

  ws_slug := 'pessoal-' || substr(replace(new.id::text, '-', ''), 1, 10);

  insert into public.workspaces (name, slug, owner_id, is_personal)
  values ('Pessoal', ws_slug, new.id, true)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (ws_id, new.id, 'owner', new.id);

  update public.profiles set default_workspace_id = ws_id where id = new.id;

  for i in 1 .. array_length(cats, 1) loop
    insert into public.categories (workspace_id, created_by, name, color, is_default)
    values (ws_id, new.id, cats[i][1], cats[i][2], true);
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- ROW LEVEL SECURITY (por workspace)
-- ===========================================================================
alter table public.profiles          enable row level security;
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.categories         enable row level security;
alter table public.tasks              enable row level security;
alter table public.links              enable row level security;
alter table public.reminders          enable row level security;
alter table public.activity_logs      enable row level security;
alter table public.delegations        enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.ai_actions         enable row level security;
alter table public.integrations       enable row level security;
alter table public.notifications      enable row level security;

-- PROFILES: ve o proprio e colegas de workspace; edita o proprio ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = (select auth.uid()) or public.shares_workspace(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = (select auth.uid()));

-- WORKSPACES --------------------------------------------------------------
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert with check (owner_id = (select auth.uid()));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update using (public.is_workspace_admin(id));
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces
  for delete using (owner_id = (select auth.uid()));

-- WORKSPACE_MEMBERS -------------------------------------------------------
drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
drop policy if exists members_insert on public.workspace_members;
create policy members_insert on public.workspace_members
  for insert with check (public.is_workspace_admin(workspace_id));
drop policy if exists members_update on public.workspace_members;
create policy members_update on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id));
drop policy if exists members_delete on public.workspace_members;
create policy members_delete on public.workspace_members
  for delete using (
    public.is_workspace_admin(workspace_id) or user_id = (select auth.uid())
  );

-- Macro: policies padrao "membro do workspace" para tabelas de dados -------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','tasks','links','reminders','activity_logs','delegations',
    'ai_conversations','ai_actions','integrations','notifications'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all '
      || 'using (public.is_workspace_member(workspace_id)) '
      || 'with check (public.is_workspace_member(workspace_id));',
      t || '_all', t
    );
  end loop;
end $$;

-- AI_MESSAGES: escopo herdado da conversa (nao tem workspace_id direto) ----
drop policy if exists ai_messages_all on public.ai_messages;
create policy ai_messages_all on public.ai_messages
  for all
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and public.is_workspace_member(c.workspace_id)
  ))
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and public.is_workspace_member(c.workspace_id)
  ));

-- ===========================================================================
-- GRANTS (RLS continua sendo a barreira efetiva por linha)
-- ---------------------------------------------------------------------------
-- PRINCIPIO: privilegio e SEMPRE explicito.
--   * Tabelas NOVAS nao devem depender de DEFAULT PRIVILEGES para receber
--     acesso — nenhuma tabela nasce com privilegio automatico.
--   * Cada migration DECLARA explicitamente os privilegios da tabela que cria.
--   * O padrao preferencial e `revoke all` (anon + authenticated) seguido de
--     `grant <minimo>` para authenticated (ver 0006/0008/0009), porque GRANT
--     apenas SOMA: sem o revoke, o conjunto final nao e deterministico.
--
-- LIMITE CONHECIDO: o Supabase mantem default privileges proprias no schema
-- public sob o papel `supabase_admin`. Elas sao da PLATAFORMA, nao sao
-- alteradas por este arquivo nem pela migration 0010, e por isso o `revoke all`
-- por tabela nas migrations continua OBRIGATORIO — remover as nossas defaults
-- reduz a superficie, mas nao substitui aquele passo.
-- ===========================================================================
grant usage on schema public to anon, authenticated;

-- Grant de bootstrap: cobre APENAS as tabelas criadas ACIMA, neste arquivo.
-- Nao e retroativo nem prospectivo — tabelas futuras vem das migrations, com
-- grant proprio.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- REMOVIDO de proposito (ver migration 0010):
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to authenticated;
-- Era a causa de tabelas novas nascerem mutaveis para authenticated — incluindo
-- TRUNCATE via defaults da plataforma, que NAO e filtrado por RLS e atravessa o
-- isolamento multi-tenant.

-- ===========================================================================
-- FIM
-- ===========================================================================
