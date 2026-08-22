-- ===========================================================================
-- MIGRATION 0015 — notifications.claimed_at (Sprint 2 / Etapa 1D — DELIVERY)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Permitir que o push-delivery-worker (Etapa 1D) RECUPERE notifications
--   presas em status='processing' por uma execucao anterior que morreu no
--   meio (timeout/crash da Edge Function), sem depender de nenhuma coluna
--   generica de updated_at (notifications nao tem uma, e nao criamos so por
--   isso — o worker so precisa saber QUANDO entrou em 'processing').
--
-- O QUE ESTA MIGRATION FAZ (1 mudanca, ADITIVA)
--   1. notifications.claimed_at — timestamptz nullable, sem default.
--   + 1 indice parcial de apoio ao worker (so linhas 'processing').
--
-- O QUE ESTA MIGRATION **NAO** FAZ
--   * NAO altera dados existentes;
--   * NAO adiciona NOT NULL (linhas 'pending'/'sent'/'failed' nunca preenchem
--     esta coluna — so 'processing' preenche, no momento do claim);
--   * NAO altera grants nem policies (mesma coluna, mesma tabela: SELECT
--     para authenticated ja cobre; escrita continua exclusiva do service_role,
--     igual as demais colunas de controle do worker: status/attempts/sent_at);
--   * NAO cria worker nem pg_cron (isso e a 0016).
--
-- Depende de: 0011 (grants minimos de notifications, preservados).
-- ===========================================================================

begin;

alter table public.notifications
  add column if not exists claimed_at timestamptz;

comment on column public.notifications.claimed_at is
  'Quando o push-delivery-worker reivindicou esta notification (status '
  'passou a processing). NULL fora de processing. Usado para recuperar '
  'linhas estagnadas: processing com claimed_at antigo demais volta a ser '
  'elegivel, sem depender de um updated_at generico.';

-- Indice de apoio: varrer so as 'processing' (poucas, transitorias) para
-- decidir estagnacao, sem tocar as (muitas) 'sent'/'failed' historicas.
create index if not exists idx_notifications_processing_claimed
  on public.notifications (claimed_at)
  where status = 'processing';

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0015
-- Verificacao: rode 0015_notifications_claim_tracking.verify.sql
-- Reverter:    0015_notifications_claim_tracking.rollback.sql
-- ===========================================================================
