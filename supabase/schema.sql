-- ===========================================================================
-- Agenda Inteligente 360 — Schema do banco de dados (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------------
-- Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. Abra o SQL Editor e cole/rode este arquivo inteiro.
--   3. Copie a URL e a anon key (Settings > API) para o arquivo .env do front.
--
-- Inclui: tabelas, enums, indices, Row Level Security (RLS), trigger de criacao
-- de perfil no signup e seed automatico das categorias padrao por usuario.
-- ===========================================================================

-- Extensoes ----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'manager', 'collaborator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum (
    'todo', 'in_progress', 'done', 'missed',
    'delegated', 'not_needed', 'rescheduled', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_type as enum ('in_app', 'push', 'email', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type link_action as enum (
    'task', 'meeting', 'idea', 'project', 'reminder', 'future_agenda'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type log_action as enum (
    'create', 'update', 'status_change', 'reschedule',
    'delegate', 'cancel', 'complete', 'delete'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- PROFILES (extensao de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        user_role not null default 'collaborator',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_categories_user on public.categories(user_id);

-- ---------------------------------------------------------------------------
-- TASKS (atividades)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  owner_id              uuid references public.profiles(id) on delete set null,
  assignee_id           uuid references public.profiles(id) on delete set null,
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
  -- Alertas
  alert_enabled         boolean not null default false,
  alert_type            alert_type not null default 'in_app',
  alert_minutes_before  integer not null default 15,
  alert_sent            boolean not null default false,
  -- Metricas
  reschedule_count      integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_tasks_user_date on public.tasks(user_id, date);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);
create index if not exists idx_tasks_status on public.tasks(status);

-- ---------------------------------------------------------------------------
-- LINKS (central de links)
-- ---------------------------------------------------------------------------
create table if not exists public.links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  url             text not null,
  title           text,
  note            text default '',
  desired_action  link_action not null default 'task',
  task_id         uuid references public.tasks(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_links_user on public.links(user_id);

-- ---------------------------------------------------------------------------
-- REMINDERS (lembretes / alertas agendados)
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  type          alert_type not null default 'in_app',
  remind_at     timestamptz not null,
  sent          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_reminders_pending on public.reminders(remind_at) where sent = false;

-- ---------------------------------------------------------------------------
-- ACTIVITY LOGS (historico)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete set null,
  action       log_action not null,
  description  text,
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_logs_user on public.activity_logs(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- DELEGATIONS (delegacao de atividades)
-- ---------------------------------------------------------------------------
create table if not exists public.delegations (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  note          text default '',
  created_at    timestamptz not null default now()
);
create index if not exists idx_delegations_task on public.delegations(task_id);

-- ===========================================================================
-- FUNCOES / TRIGGERS
-- ===========================================================================

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Cria o perfil e as categorias padrao quando um usuario se cadastra.
-- SECURITY DEFINER com search_path fixo (recomendacao de seguranca do Supabase).
create or replace function public.handle_new_user()
returns trigger
set search_path = public
as $$
declare
  default_cats text[][] := array[
    ['Pessoal','#6366f1'], ['Trabalho','#0ea5e9'], ['Reuniao','#8b5cf6'],
    ['Ideia','#f59e0b'], ['Projeto','#10b981'], ['Familia','#ec4899'],
    ['Saude','#ef4444'], ['Estudo','#14b8a6'], ['Financeiro','#84cc16'],
    ['Equipe','#f97316']
  ];
  is_first boolean;
  i int;
begin
  -- O primeiro usuario cadastrado vira administrador.
  select count(*) = 0 into is_first from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when is_first then 'admin'::user_role else 'collaborator'::user_role end
  );

  for i in 1 .. array_length(default_cats, 1) loop
    insert into public.categories (user_id, name, color, is_default)
    values (new.id, default_cats[i][1], default_cats[i][2], true);
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Regra base: cada usuario ve/edita apenas os proprios registros. Atividades
-- tambem sao visiveis para quem foi delegado (assignee_id).
-- ===========================================================================
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.tasks          enable row level security;
alter table public.links          enable row level security;
alter table public.reminders      enable row level security;
alter table public.activity_logs  enable row level security;
alter table public.delegations    enable row level security;

-- PROFILES
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- CATEGORIES
drop policy if exists "categories_all_own" on public.categories;
create policy "categories_all_own" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TASKS (dono ou responsavel delegado)
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (auth.uid() = user_id or auth.uid() = assignee_id);
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (auth.uid() = user_id or auth.uid() = assignee_id);
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (auth.uid() = user_id);

-- LINKS
drop policy if exists "links_all_own" on public.links;
create policy "links_all_own" on public.links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- REMINDERS
drop policy if exists "reminders_all_own" on public.reminders;
create policy "reminders_all_own" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ACTIVITY LOGS
drop policy if exists "logs_select_own" on public.activity_logs;
create policy "logs_select_own" on public.activity_logs
  for select using (auth.uid() = user_id);
drop policy if exists "logs_insert_own" on public.activity_logs;
create policy "logs_insert_own" on public.activity_logs
  for insert with check (auth.uid() = user_id);

-- DELEGATIONS
drop policy if exists "delegations_select" on public.delegations;
create policy "delegations_select" on public.delegations
  for select using (auth.uid() = from_user_id or auth.uid() = to_user_id);
drop policy if exists "delegations_insert" on public.delegations;
create policy "delegations_insert" on public.delegations
  for insert with check (auth.uid() = from_user_id);

-- ===========================================================================
-- FIM
-- ===========================================================================
