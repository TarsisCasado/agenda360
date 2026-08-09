-- ===========================================================================
-- MIGRATION 0011 — Saneamento de ACLs materializadas e policies FOR ALL
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Deixar 5 tabelas com o PRIVILEGIO MINIMO comprovado, antes de entrarem em
--   uso real na Sprint 2 (alertas + WhatsApp). Producao media hoje 7
--   privilegios para anon E authenticated nas 5 (incluindo TRUNCATE, que NAO e
--   filtrado por RLS e atravessa o isolamento multi-tenant).
--
--   A 0010 ja removeu as DEFAULT PRIVILEGES (o futuro); esta migration trata
--   as ACLs JA MATERIALIZADAS (o presente). Sao problemas distintos.
--
-- MATRIZ APROVADA (authenticated; anon = zero em todas)
--   reminders       SELECT, INSERT, UPDATE, DELETE   (nao e append-only:
--                   reminderService cria, recalcula ao editar a task e remove
--                   ao concluir/cancelar — as 4 policies da 0002 ja assumem isso)
--   integrations    SELECT, INSERT, UPDATE           (SEM DELETE: desconectar e
--                   mudanca de estado -> status='revoked', preservando historico)
--   notifications   SELECT                           (outbox: o ciclo
--                   pending->processing->sent/failed e do WORKER via
--                   service_role, que ignora RLS e grants de authenticated.
--                   Cliente so le para exibir "enviado")
--   delegations     SELECT, INSERT                   (append-only por
--                   ARQUITETURA.md §3: "registro append-only", "log imutavel")
--   activity_logs   SELECT, INSERT                   (append-only por DDL/BRIN,
--                   pela 0002 e pelo codigo: logService faz insert + select)
--
-- ESCOPO — o que esta migration NAO faz:
--   * NAO altera dados (nenhum insert/update/delete/truncate);
--   * NAO altera tabelas, colunas, indices, constraints nem triggers;
--   * NAO altera DEFAULT PRIVILEGES (isso e da 0010);
--   * NAO toca em workspaces/workspace_members nem em qualquer tabela fora das 5;
--   * NAO altera storage, sequences ou functions;
--   * NAO acrescenta restricoes novas de identidade nas policies — as
--     expressoes de workspace sao preservadas EXATAMENTE como estao hoje.
--
-- POLICIES
--   reminders e activity_logs: INTACTAS (ja sao por-comando, vindas da 0002).
--   integrations/notifications/delegations: a policy generica `<t>_all`
--   (cmd=ALL, herdada do bloco DO do schema.sql) e substituida por policies
--   por-comando com a MESMA expressao. Nenhum acesso e ampliado: apenas
--   comandos sem consumidor deixam de ser permitidos.
--
-- IDEMPOTENTE: `revoke` de privilegio inexistente e no-op; `drop policy if
-- exists` e seguro; `create policy` e precedido do drop correspondente.
--
-- Depende de: 0002 (policies por-comando de reminders/activity_logs).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) REMINDERS — mutavel por design. Policies da 0002 permanecem INTACTAS.
--    Aqui so alinhamos o GRANT ao que as policies ja permitem.
-- ---------------------------------------------------------------------------
revoke all privileges on public.reminders from anon;
revoke all privileges on public.reminders from authenticated;
grant select, insert, update, delete on public.reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2) INTEGRATIONS — conectar/ler/atualizar. SEM DELETE (status='revoked').
-- ---------------------------------------------------------------------------
revoke all privileges on public.integrations from anon;
revoke all privileges on public.integrations from authenticated;
grant select, insert, update on public.integrations to authenticated;

-- Substitui a policy generica FOR ALL por policies por-comando, com a MESMA
-- expressao de pertencimento. Sem policy de DELETE (coerente com o grant).
drop policy if exists integrations_all    on public.integrations;
drop policy if exists integrations_select on public.integrations;
drop policy if exists integrations_insert on public.integrations;
drop policy if exists integrations_update on public.integrations;

create policy integrations_select on public.integrations
  for select using (public.is_workspace_member(workspace_id));

create policy integrations_insert on public.integrations
  for insert with check (public.is_workspace_member(workspace_id));

create policy integrations_update on public.integrations
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 3) NOTIFICATIONS — outbox. Cliente APENAS le; escrita e do service_role.
-- ---------------------------------------------------------------------------
revoke all privileges on public.notifications from anon;
revoke all privileges on public.notifications from authenticated;
grant select on public.notifications to authenticated;

drop policy if exists notifications_all    on public.notifications;
drop policy if exists notifications_select on public.notifications;

create policy notifications_select on public.notifications
  for select using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 4) DELEGATIONS — historico append-only (ARQUITETURA.md §3).
--    A 0002 endureceu 6 tabelas e esqueceu esta; aqui ela entra no padrao.
-- ---------------------------------------------------------------------------
revoke all privileges on public.delegations from anon;
revoke all privileges on public.delegations from authenticated;
grant select, insert on public.delegations to authenticated;

drop policy if exists delegations_all    on public.delegations;
drop policy if exists delegations_select on public.delegations;
drop policy if exists delegations_insert on public.delegations;

create policy delegations_select on public.delegations
  for select using (public.is_workspace_member(workspace_id));

create policy delegations_insert on public.delegations
  for insert with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 5) ACTIVITY_LOGS — append-only. Policies da 0002 permanecem INTACTAS
--    (activity_logs_select + activity_logs_insert; sem UPDATE/DELETE).
--    Aqui so removemos os privilegios herdados, incluindo TRUNCATE — o unico
--    que RLS nao barra e que apagaria a auditoria de todos os workspaces.
-- ---------------------------------------------------------------------------
revoke all privileges on public.activity_logs from anon;
revoke all privileges on public.activity_logs from authenticated;
grant select, insert on public.activity_logs to authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0011
-- Verificacao: rode 0011_harden_materialized_table_privileges.verify.sql
-- Reverter:    0011_harden_materialized_table_privileges.rollback.sql (LEIA ANTES)
-- ===========================================================================
