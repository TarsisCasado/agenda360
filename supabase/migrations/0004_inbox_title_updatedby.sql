-- ===========================================================================
-- MIGRATION 0004 — Caixa de Entrada · A1.5 (refinamento)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Preparar inbox_items para crescer sem retrabalho, com o MINIMO:
--     1. title    text    -> assunto curto (a maioria das notas tera).
--     2. updated_by uuid  -> autor da ultima edicao (preparado para workspaces
--        compartilhados). SEM logica de compartilhamento agora.
--   Nenhum outro campo.
--
-- ANALISE DE IMPACTO
--   * ADD COLUMN com DEFAULT constante/expressao volatil: no Postgres >= 11,
--     colunas com default sao adicionadas sem rewrite (metadados). Linhas
--     existentes recebem title = '' e updated_by = NULL (default so afeta novos
--     INSERTs).
--   * updated_by tem DEFAULT auth.uid() (mesmo padrao de created_by), so aplica
--     em INSERT; UPDATE nao e afetado (sem logica nova).
--   * Idempotente (add column if not exists).
--
-- Depende de: 0003 (inbox_items) aplicada.
-- ===========================================================================

begin;

alter table public.inbox_items
  add column if not exists title text not null default '';

alter table public.inbox_items
  add column if not exists updated_by uuid
  references public.profiles(id) on delete set null default auth.uid();

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0004
-- Verificacao: rode 0004_inbox_title_updatedby.verify.sql
-- Reverter:    rode 0004_inbox_title_updatedby.rollback.sql
-- ===========================================================================
