-- ===========================================================================
-- VERIFICACAO DE INTEGRACAO — Agenda Inteligente 360
-- ---------------------------------------------------------------------------
-- Rode ESTE arquivo no SQL Editor do Supabase DEPOIS de criar o primeiro
-- usuario pelo app (tela "Criar agora"). Ele confirma que o trigger
-- handle_new_user() criou tudo corretamente.
-- ===========================================================================

-- 1) Estrutura existe? (14 tabelas esperadas)
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2) Trigger de cadastro esta ativo?
select tgname, tgenabled
from pg_trigger
where tgname = 'on_auth_user_created';

-- 3) Profile criado (o primeiro deve ter role = admin)
select id, email, full_name, role, default_workspace_id, created_at
from public.profiles
order by created_at;

-- 4) Workspace "Pessoal" criado (is_personal = true, owner = usuario)
select w.id, w.name, w.slug, w.is_personal, w.owner_id, p.email as owner_email
from public.workspaces w
join public.profiles p on p.id = w.owner_id
order by w.created_at;

-- 5) Membership criada (deve ser role = owner)
select m.workspace_id, m.user_id, m.role, p.email
from public.workspace_members m
join public.profiles p on p.id = m.user_id
order by m.created_at;

-- 6) Categorias padrao criadas (deve haver 10 por workspace)
select w.name as workspace, count(c.*) as total_categorias
from public.categories c
join public.workspaces w on w.id = c.workspace_id
group by w.name;

-- 7) Resumo consolidado (o esperado apos 1 usuario: 1/1/1/10)
select
  (select count(*) from public.profiles)          as profiles,
  (select count(*) from public.workspaces)         as workspaces,
  (select count(*) from public.workspace_members)  as memberships,
  (select count(*) from public.categories)         as categorias;

-- 8) RLS habilitada em todas as tabelas de dados? (rowsecurity = true)
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- ===========================================================================
-- RESULTADO ESPERADO (com exatamente 1 usuario cadastrado):
--   profiles = 1  | workspaces = 1  | memberships = 1  | categorias = 10
--   profile.role = 'admin'  | membership.role = 'owner'  | is_personal = true
--   rowsecurity = true em todas as tabelas
-- ===========================================================================
