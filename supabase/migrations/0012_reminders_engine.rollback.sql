-- ===========================================================================
-- ROLLBACK da migration 0012 — PARCIAL POR SEGURANCA
-- ---------------------------------------------------------------------------
--
--  /!\  ESTE ROLLBACK E DELIBERADAMENTE INCOMPLETO.
--
--  A parte ATIVA remove apenas INDICES — objetos derivados, que nao guardam
--  informacao propria e podem ser recriados a qualquer momento reaplicando a
--  0012. Reverter isso nao perde nada.
--
--  A parte DESTRUTIVA (DROP COLUMN) esta COMENTADA e assim deve permanecer,
--  salvo decisao explicita e consciente. Motivo: a partir do momento em que a
--  0012 e aplicada, estas colunas passam a ser PREENCHIDAS — pelo
--  reminderService (1B), pelo worker (1C) e pelo proprio usuario, no caso do
--  fuso horario. `DROP COLUMN` apagaria esses dados de forma IRREVERSIVEL, sem
--  aviso e sem backup.
--
--  Principio adotado: prefira rollback INCOMPLETO e SEGURO a rollback completo
--  que apague dados.
--
-- ---------------------------------------------------------------------------
-- O QUE PODE DAR ERRADO E COMO RESOLVER SEM DROP COLUMN
-- ---------------------------------------------------------------------------
--   * "O UNIQUE de reminders esta bloqueando um INSERT legitimo"
--       -> remova SO o indice (parte ativa abaixo) e reavalie a chave.
--          As colunas e os dados permanecem intactos.
--
--   * "O UNIQUE de notifications esta bloqueando uma entrega legitima"
--       -> idem: remova o indice, investigue, recrie depois.
--
--   * "O default de timezone esta errado para os usuarios"
--       -> NAO reverta a coluna. Faca um UPDATE consciente do valor, ou
--          altere apenas o DEFAULT:
--          alter table public.profiles alter column timezone set default '<novo>';
--
--   * "Precisamos desfazer a 0012 inteira antes de qualquer uso"
--       -> so entao considere a parte comentada, e SOMENTE se o precheck
--          comprovar que nenhuma das colunas foi preenchida:
--          select count(*) filter (where recipient_id   is not null) as com_recipient,
--                 count(*) filter (where minutes_before is not null) as com_minutes,
--                 count(*) filter (where cancelled_at   is not null) as com_cancel
--          from public.reminders;
--          select count(*) filter (where user_id is not null) from public.notifications;
--          Se qualquer contagem for > 0, HA DADO REAL: nao remova a coluna.
--
-- ---------------------------------------------------------------------------
-- ESTE ARQUIVO NAO ALTERA
-- ---------------------------------------------------------------------------
--   dados, grants, policies, RLS, DEFAULT PRIVILEGES, triggers, storage, nem
--   qualquer tabela fora de reminders/notifications. A 0012 nao alterou grants
--   nem policies, entao nao ha o que restaurar nesse plano.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- PARTE ATIVA — remove apenas os INDICES criados pela 0012 (seguro).
-- Nenhum dado e perdido: indices sao derivados e recriaveis pela 0012.
-- ---------------------------------------------------------------------------
drop index if exists public.uq_reminders_alive;
drop index if exists public.idx_reminders_due_alive;
drop index if exists public.uq_notifications_reminder_channel;

commit;

-- ===========================================================================
-- PARTE DESTRUTIVA — MANTENHA COMENTADA
-- ---------------------------------------------------------------------------
-- Descomente SOMENTE apos confirmar, com as contagens do cabecalho, que
-- NENHUMA das colunas contem dado. Remover coluna com dado e irreversivel.
--
-- Observacao sobre profiles.timezone: alem de apagar a preferencia de fuso de
-- todos os usuarios, remove-la quebraria o motor de lembretes, que depende
-- dela para converter data+hora local em timestamptz. Nao remova enquanto
-- houver qualquer reminder no sistema.
--
-- begin;
--
-- alter table public.notifications drop column if exists user_id;
--
-- alter table public.reminders drop column if exists cancelled_at;
-- alter table public.reminders drop column if exists minutes_before;
-- alter table public.reminders drop column if exists recipient_id;
--
-- alter table public.profiles drop column if exists timezone;
--
-- commit;
-- ===========================================================================

-- ===========================================================================
-- Apos executar, rode o precheck da 0012 para confirmar o estado restaurado.
-- Para voltar ao estado da 0012: reaplique 0012_reminders_engine.sql
-- (idempotente: `add column if not exists` / `create index if not exists`).
-- ===========================================================================
