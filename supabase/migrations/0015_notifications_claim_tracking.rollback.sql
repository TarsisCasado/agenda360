-- ===========================================================================
-- ROLLBACK da migration 0015 — PARCIAL POR SEGURANCA
-- ---------------------------------------------------------------------------
-- Mesmo principio das demais: remover o INDICE e seguro (derivado,
-- recriavel). Remover a COLUNA apagaria o rastro de reivindicacao de
-- notifications em voo no momento do rollback — mantenha comentado.
-- ===========================================================================

begin;

drop index if exists public.idx_notifications_processing_claimed;

commit;

-- ---------------------------------------------------------------------------
-- PARTE DESTRUTIVA — MANTENHA COMENTADA
-- ---------------------------------------------------------------------------
-- Descomente SOMENTE apos confirmar que nenhuma notification depende do
-- valor (select count(*) from public.notifications where claimed_at is not null;)
-- e que o push-delivery-worker esta DESATIVADO (job inativo ou Function
-- removida) — caso contrario o worker falha ao tentar gravar a coluna.
--
-- begin;
-- alter table public.notifications drop column if exists claimed_at;
-- commit;
-- ===========================================================================

-- ===========================================================================
-- Para restaurar: reaplique 0015_notifications_claim_tracking.sql (idempotente).
-- ===========================================================================
