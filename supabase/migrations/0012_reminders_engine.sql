-- ===========================================================================
-- MIGRATION 0012 — Fundacao do MOTOR DE LEMBRETES (Sprint 2 / Etapa 1A)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Preparar reminders/notifications para operarem de forma DETERMINISTICA,
--   IDEMPOTENTE, MULTIUSUARIO e com TIMEZONE — sem ainda criar service, worker
--   ou canal de entrega (isso e 1B/1C/1D).
--
-- O QUE ESTA MIGRATION FAZ (5 mudancas, todas ADITIVAS)
--   1. profiles.timezone            — fuso do usuario (preferencia, nao constante)
--   2. reminders.recipient_id       — destinatario explicito
--   3. reminders.minutes_before     — antecedencia; torna a IDENTIDADE do
--                                     lembrete estavel e permite multiplos
--                                     lembretes por task/canal
--   4. reminders.cancelled_at       — 3o estado (cancelado) sem criar enum novo
--   5. notifications.user_id        — destinatario explicito
--   + 2 indices UNIQUE PARCIAIS de idempotencia (reminders e notifications)
--   + 1 indice de apoio ao worker
--
-- O QUE ESTA MIGRATION **NAO** FAZ
--   * NAO altera dados existentes (nenhum update/delete/backfill destrutivo);
--   * NAO adiciona NOT NULL em coluna nova (nao ha como preencher com verdade;
--     o 1B preenche e so entao se avalia endurecer);
--   * NAO cria enum novo (evita complexidade desnecessaria — ver decisao E);
--   * NAO altera grants (mudanca e por COLUNA; grants sao por TABELA, e a
--     matriz da 0011 permanece valida sem tocar em nada);
--   * NAO altera policies (as expressoes existentes filtram por workspace_id,
--     que nao muda; nenhuma policy precisa conhecer as colunas novas);
--   * NAO altera RLS, DEFAULT PRIVILEGES, storage, triggers ou tabelas fora
--     de profiles/reminders/notifications;
--   * NAO cria worker, pg_cron, service, nem toca no frontend.
--
-- ---------------------------------------------------------------------------
-- DECISAO C — IDEMPOTENCIA DE REMINDER (preserva multiplos lembretes)
-- ---------------------------------------------------------------------------
--   UNIQUE(task_id, type) foi REJEITADA: impediria "1 dia antes" + "1 hora
--   antes" + "15 min antes" no MESMO canal para a MESMA tarefa — cenario que o
--   produto quer manter.
--
--   A identidade logica de um lembrete e (tarefa, canal, ANTECEDENCIA).
--   `remind_at` NAO serve como chave: ele muda a cada reagendamento, entao
--   duas edicoes da mesma tarefa gerariam linhas "diferentes" e acumulariam
--   pendencias — exatamente o problema que queremos evitar.
--
--   Por isso `minutes_before` e adicionado: e o que permanece ESTAVEL quando a
--   tarefa muda de horario. Chave: (task_id, type, minutes_before) entre os
--   lembretes VIVOS (nao enviados e nao cancelados).
--
-- ---------------------------------------------------------------------------
-- DECISAO D — IDEMPOTENCIA DE NOTIFICATION (deterministica, no banco)
-- ---------------------------------------------------------------------------
--   A ocorrencia logica de uma entrega e (reminder, canal). Um reminder dispara
--   UMA vez (vira sent=true), entao UNIQUE(reminder_id, channel) impede
--   duplicata mesmo que o worker caia entre o INSERT e o commit do claim, ou
--   que duas execucoes concorram. Parcial `where reminder_id is not null`
--   porque notificacoes avulsas (sem reminder) devem continuar possiveis.
--   Garantia no BANCO — nao depende de logica JavaScript futura.
--
-- ---------------------------------------------------------------------------
-- DECISAO E — ESTADO DO REMINDER (menor evolucao possivel)
-- ---------------------------------------------------------------------------
--   `sent boolean` sozinho NAO distingue "cancelado" de "pendente": uma tarefa
--   concluida deixaria o lembrete com sent=false para sempre e o worker o
--   dispararia. Criar um enum novo seria complexidade desnecessaria.
--   Solucao minima: acrescentar `cancelled_at timestamptz`. Os 3 estados
--   passam a ser derivaveis, sem enum e sem migrar dado:
--     pendente  = sent = false and cancelled_at is null
--     enviado   = sent = true
--     cancelado = cancelled_at is not null
--
-- Depende de: schema base + 0002 (policies por-comando de reminders)
--             + 0011 (grants minimos ja aplicados — preservados).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) PROFILES — timezone do usuario (DECISAO A)
-- ---------------------------------------------------------------------------
-- Nao existe equivalente hoje (auditado: nenhuma coluna de fuso em profiles
-- nem em qualquer outra tabela). O default cobre as linhas existentes sem
-- backfill manual e sem rewrite pesado.
-- IMPORTANTE: e uma PREFERENCIA do usuario, editavel. O motor (1B/1C) deve
-- SEMPRE ler desta coluna — nunca hardcodar 'America/Sao_Paulo'.
alter table public.profiles
  add column if not exists timezone text not null default 'America/Sao_Paulo';

comment on column public.profiles.timezone is
  'Fuso IANA do usuario (preferencia editavel). Base para converter '
  'tasks.date + tasks.start_time em reminders.remind_at (timestamptz). '
  'O motor le SEMPRE daqui; nunca assume um fuso fixo.';

-- ---------------------------------------------------------------------------
-- 2) REMINDERS — destinatario, antecedencia e cancelamento
-- ---------------------------------------------------------------------------
-- recipient_id: QUEM deve ser avisado (≠ created_by, que e quem criou).
-- Mesmo padrao de FK das demais referencias a profiles no schema:
--   uuid references public.profiles(id) on delete set null
-- NULLABLE de proposito: as linhas existentes nao tem como saber o
-- destinatario com verdade. O 1B passa a preencher (a partir de
-- tasks.assignee_id); endurecer para NOT NULL so depois, se fizer sentido.
alter table public.reminders
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null;

-- minutes_before: antecedencia em minutos, espelhando tasks.alert_minutes_before.
-- E a peca que torna a identidade do lembrete ESTAVEL (ver DECISAO C).
-- NULLABLE: linhas antigas nao tem esse dado; e NULL nao colide no UNIQUE
-- parcial, entao nenhuma linha existente bloqueia a criacao do indice.
alter table public.reminders
  add column if not exists minutes_before integer;

-- cancelled_at: 3o estado, sem enum novo (ver DECISAO E).
alter table public.reminders
  add column if not exists cancelled_at timestamptz;

comment on column public.reminders.recipient_id is
  'Destinatario do lembrete (quem sera avisado). Diferente de created_by '
  '(autor). Preenchido pelo reminderService a partir de tasks.assignee_id.';
comment on column public.reminders.minutes_before is
  'Antecedencia em minutos (espelha tasks.alert_minutes_before). Compoe a '
  'identidade logica do lembrete (task, canal, antecedencia) — estavel entre '
  'reagendamentos, ao contrario de remind_at.';
comment on column public.reminders.cancelled_at is
  'Quando o lembrete foi cancelado (tarefa concluida/cancelada/excluida ou '
  'alerta desligado). Estados: pendente = sent=false and cancelled_at is null; '
  'enviado = sent=true; cancelado = cancelled_at is not null.';

-- IDEMPOTENCIA (DECISAO C): no maximo UM lembrete VIVO por
-- (tarefa, canal, antecedencia). Preserva multiplos lembretes legitimos
-- (1 dia / 1 hora / 15 min) porque minutes_before faz parte da chave.
-- Parcial: so vale entre os vivos — historico de enviados/cancelados nunca
-- bloqueia a criacao de um lembrete novo.
create unique index if not exists uq_reminders_alive
  on public.reminders (task_id, type, minutes_before)
  where sent = false and cancelled_at is null;

-- Indice de apoio ao worker (1C): varrer apenas os VIVOS e vencidos.
-- Complementa idx_reminders_pending (que nao conhece cancelled_at).
create index if not exists idx_reminders_due_alive
  on public.reminders (remind_at)
  where sent = false and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 3) NOTIFICATIONS — destinatario e idempotencia
-- ---------------------------------------------------------------------------
-- user_id: destinatario da entrega. Essencial para a Etapa 2 (WhatsApp precisa
-- saber de quem e o telefone) e para a UI filtrar "meus avisos".
alter table public.notifications
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

comment on column public.notifications.user_id is
  'Destinatario da notificacao. Herdado de reminders.recipient_id. Base para '
  'resolver o contato do canal (ex.: telefone, na Etapa 2 - WhatsApp).';

-- IDEMPOTENCIA (DECISAO D): uma unica entrega por (reminder, canal).
-- Garantia no BANCO: o worker pode usar `on conflict do nothing` e ficar
-- seguro contra concorrencia e contra falha entre INSERT e commit.
-- Parcial: notificacoes sem reminder (avulsas/futuras) seguem permitidas.
create unique index if not exists uq_notifications_reminder_channel
  on public.notifications (reminder_id, channel)
  where reminder_id is not null;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0012
-- Verificacao: rode 0012_reminders_engine.verify.sql
-- Reverter:    0012_reminders_engine.rollback.sql — parcialmente INATIVO por
--              seguranca (remover coluna apagaria dados criados depois da
--              migration). LEIA o cabecalho do arquivo antes de usar.
-- ===========================================================================
