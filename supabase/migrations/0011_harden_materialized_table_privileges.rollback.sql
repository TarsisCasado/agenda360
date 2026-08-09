-- ===========================================================================
-- ROLLBACK da migration 0011 — EXECUTAVEL, MAS LEIA ANTES
-- ---------------------------------------------------------------------------
--
--  /!\  ESTE ROLLBACK REDUZ A SEGURANCA DO BANCO. Use apenas diante de falha
--       real e comprovada, nunca "por precaucao".
--
--  O que ele faz: devolve as 5 tabelas ao estado anterior CONHECIDO —
--  authenticated com SELECT/INSERT/UPDATE/DELETE e as policies genericas
--  `<tabela>_all` (cmd=ALL) em integrations, notifications e delegations.
--
--  Consequencias de executar:
--    * activity_logs e delegations deixam de ser append-only na pratica:
--      UPDATE/DELETE voltam a ser permitidos e o historico de auditoria fica
--      alteravel/apagavel por qualquer membro do workspace;
--    * notifications volta a aceitar escrita do cliente: passa a ser possivel
--      forjar entregas ("enviado") sem que o worker tenha enviado nada;
--    * integrations volta a aceitar DELETE, contrariando a decisao funcional
--      de representar desconexao como status='revoked'.
--
--  ANTES DE EXECUTAR, prefira sempre a correcao pontual: se faltar UM
--  privilegio para a Sprint 2, conceda so ele
--  (ex.: `grant delete on public.integrations to authenticated;`)
--  em vez de reverter o conjunto inteiro.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTE ROLLBACK DELIBERADAMENTE **NAO** RESTAURA
-- ---------------------------------------------------------------------------
--   * TRUNCATE   — nao e filtrado por RLS; apagaria dados de TODOS os
--                  workspaces de uma vez. Nunca deve voltar.
--   * REFERENCES — sem uso funcional.
--   * TRIGGER    — sem uso funcional.
--   * MAINTAIN   — sem uso funcional.
--   * QUALQUER privilegio para `anon` — a aplicacao exige autenticacao; o papel
--                  anonimo nunca precisou de acesso a estas tabelas.
--
--   Nenhum desses veio do nosso repositorio: foram herdados das default
--   privileges (ja removidas pela 0010). Reproduzi-los aqui transformaria um
--   passivo herdado em decisao nossa — por isso ficam de fora, mesmo no
--   rollback. Se o estado herdado for mesmo necessario (nao deveria), sera uma
--   decisao explicita e documentada a parte.
--
--   Este arquivo tambem NAO altera dados, tabelas, colunas, indices,
--   constraints, triggers nem DEFAULT PRIVILEGES.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) REMINDERS — grants (as policies nunca foram alteradas pela 0011).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2) INTEGRATIONS — grants + policy generica FOR ALL.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.integrations to authenticated;

drop policy if exists integrations_select on public.integrations;
drop policy if exists integrations_insert on public.integrations;
drop policy if exists integrations_update on public.integrations;
drop policy if exists integrations_all    on public.integrations;
create policy integrations_all on public.integrations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 3) NOTIFICATIONS — grants + policy generica FOR ALL.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.notifications to authenticated;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_all    on public.notifications;
create policy notifications_all on public.notifications
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 4) DELEGATIONS — grants + policy generica FOR ALL.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.delegations to authenticated;

drop policy if exists delegations_select on public.delegations;
drop policy if exists delegations_insert on public.delegations;
drop policy if exists delegations_all    on public.delegations;
create policy delegations_all on public.delegations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 5) ACTIVITY_LOGS — grants (as policies nunca foram alteradas pela 0011;
--    seguem sendo activity_logs_select + activity_logs_insert, da 0002).
--    ATENCAO: conceder UPDATE/DELETE aqui e inofensivo na pratica enquanto
--    nao existir policy para esses comandos — mas restaura o passivo. Mantido
--    apenas para reproduzir fielmente o estado anterior.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.activity_logs to authenticated;

commit;

-- ===========================================================================
-- Apos executar, rode o precheck da 0011 para confirmar o estado restaurado.
-- Para voltar ao estado seguro: reaplique 0011_harden_materialized_table_privileges.sql
-- ===========================================================================
