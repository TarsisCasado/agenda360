-- ===========================================================================
-- MIGRATION 0002 — Hardening de identidade (Milestone 1 / Sprint 3)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Impedir spoofing de created_by / actor_id / user_id: a identidade passa a
--   ser CARIMBADA pelo banco (auth.uid()) e o INSERT so aceita a propria
--   identidade. UPDATE/DELETE seguem no nivel de PERTENCIMENTO ao workspace,
--   preservando workspaces compartilhados e tarefas delegadas.
--
-- O QUE MUDA (exatamente)
--   1. DEFAULT auth.uid() em colunas de identidade (6 colunas / 6 tabelas).
--   2. Substitui as policies "<tabela>_all" por policies por-comando:
--        SELECT/UPDATE/DELETE  -> pertencimento (inalterado);
--        INSERT                -> pertencimento + identidade = auth.uid().
--   Tabelas afetadas: tasks, links, categories, reminders, activity_logs,
--   ai_conversations.
--
-- ANALISE DE IMPACTO / BLOQUEIO
--   * ALTER COLUMN ... SET DEFAULT: mudanca de catalogo, INSTANTANEA, sem
--     rewrite de tabela, sem alterar dados existentes. Lock ACCESS EXCLUSIVE
--     apenas momentaneo (metadados).
--   * DROP/CREATE POLICY: mudanca de catalogo, sem tocar dados; passa a valer
--     na proxima query. Nao ha rewrite.
--   * NENHUMA linha existente e alterada. Nenhuma tabela e apagada/renomeada.
--   * O app ja envia created_by/actor_id/user_id = usuario da sessao (=auth.uid())
--     -> INSERTs continuam passando. A trigger handle_new_user roda como
--     SECURITY DEFINER (ignora RLS) -> seed no cadastro NAO e afetado.
--   * Idempotente: pode rodar novamente sem erro.
--
-- Depende de: 0001 (schema.sql) ja aplicado e da funcao public.is_workspace_member.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) DEFAULT auth.uid() nas colunas de identidade
--    (so afeta INSERTs futuros que omitirem a coluna; dados atuais intactos)
-- ---------------------------------------------------------------------------
alter table public.tasks            alter column created_by set default auth.uid();
alter table public.links            alter column created_by set default auth.uid();
alter table public.categories       alter column created_by set default auth.uid();
alter table public.reminders        alter column created_by set default auth.uid();
alter table public.activity_logs    alter column actor_id   set default auth.uid();
alter table public.ai_conversations alter column user_id    set default auth.uid();

-- ---------------------------------------------------------------------------
-- 2) Policies por-comando (substituem as "<tabela>_all" do schema base)
--    Regra: INSERT exige identidade propria; demais comandos = pertencimento.
-- ---------------------------------------------------------------------------

-- TASKS -------------------------------------------------------------------
drop policy if exists tasks_all    on public.tasks;
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.is_workspace_member(workspace_id));
create policy tasks_insert on public.tasks
  for insert with check (
    public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
  );
create policy tasks_update on public.tasks
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy tasks_delete on public.tasks
  for delete using (public.is_workspace_member(workspace_id));

-- LINKS -------------------------------------------------------------------
drop policy if exists links_all    on public.links;
drop policy if exists links_select on public.links;
drop policy if exists links_insert on public.links;
drop policy if exists links_update on public.links;
drop policy if exists links_delete on public.links;
create policy links_select on public.links
  for select using (public.is_workspace_member(workspace_id));
create policy links_insert on public.links
  for insert with check (
    public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
  );
create policy links_update on public.links
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy links_delete on public.links
  for delete using (public.is_workspace_member(workspace_id));

-- CATEGORIES --------------------------------------------------------------
drop policy if exists categories_all    on public.categories;
drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_select on public.categories
  for select using (public.is_workspace_member(workspace_id));
create policy categories_insert on public.categories
  for insert with check (
    public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
  );
create policy categories_update on public.categories
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy categories_delete on public.categories
  for delete using (public.is_workspace_member(workspace_id));

-- REMINDERS ---------------------------------------------------------------
drop policy if exists reminders_all    on public.reminders;
drop policy if exists reminders_select on public.reminders;
drop policy if exists reminders_insert on public.reminders;
drop policy if exists reminders_update on public.reminders;
drop policy if exists reminders_delete on public.reminders;
create policy reminders_select on public.reminders
  for select using (public.is_workspace_member(workspace_id));
create policy reminders_insert on public.reminders
  for insert with check (
    public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
  );
create policy reminders_update on public.reminders
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy reminders_delete on public.reminders
  for delete using (public.is_workspace_member(workspace_id));

-- ACTIVITY_LOGS -----------------------------------------------------------
-- actor_id pode ser NULL (eventos de sistema); permitimos NULL ou o proprio.
drop policy if exists activity_logs_all    on public.activity_logs;
drop policy if exists activity_logs_select on public.activity_logs;
drop policy if exists activity_logs_insert on public.activity_logs;
drop policy if exists activity_logs_update on public.activity_logs;
drop policy if exists activity_logs_delete on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select using (public.is_workspace_member(workspace_id));
create policy activity_logs_insert on public.activity_logs
  for insert with check (
    public.is_workspace_member(workspace_id)
    and (actor_id is null or actor_id = (select auth.uid()))
  );
-- logs sao imutaveis: sem UPDATE/DELETE via cliente (nenhuma policy criada).

-- AI_CONVERSATIONS --------------------------------------------------------
drop policy if exists ai_conversations_all    on public.ai_conversations;
drop policy if exists ai_conversations_select on public.ai_conversations;
drop policy if exists ai_conversations_insert on public.ai_conversations;
drop policy if exists ai_conversations_update on public.ai_conversations;
drop policy if exists ai_conversations_delete on public.ai_conversations;
create policy ai_conversations_select on public.ai_conversations
  for select using (public.is_workspace_member(workspace_id));
create policy ai_conversations_insert on public.ai_conversations
  for insert with check (
    public.is_workspace_member(workspace_id) and user_id = (select auth.uid())
  );
create policy ai_conversations_update on public.ai_conversations
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy ai_conversations_delete on public.ai_conversations
  for delete using (public.is_workspace_member(workspace_id));

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0002
-- Verificacao: rode 0002_identity_hardening.verify.sql
-- Reverter:    rode 0002_identity_hardening.rollback.sql
-- ===========================================================================
