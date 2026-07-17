-- ===========================================================================
-- MIGRATION 0007 — Atividades · T-Core minimo (date anulavel + origin)
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO
--   Permitir atividades SEM data e registrar sua ORIGEM, com o MINIMO:
--     1. public.tasks.date -> remover NOT NULL (atividade pode nao ter data).
--     2. public.tasks.origin text NOT NULL default 'manual' -> proveniencia.
--
--   Valores de origin permitidos pela APLICACAO (validacao no app, NAO no
--   banco — coluna e text livre, extensivel de graca):
--     manual | inbox | assistant | photo | pdf | audio |
--     google_calendar | email | integration
--   NAO criar enum PostgreSQL (evita migration cara a cada novo valor).
--
-- ANALISE DE IMPACTO
--   * ALTER COLUMN date DROP NOT NULL: mudanca de catalogo, sem rewrite de
--     tabela; linhas existentes permanecem intactas (todas com data).
--   * ADD COLUMN origin com default constante: sem rewrite; linhas antigas
--     recebem 'manual' automaticamente.
--   * Nenhuma policy alterada (RLS por workspace/identidade nao depende de
--     date nem de origin). Idempotente.
--
-- Depende de: 0002 aplicada (schema base de tasks).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Data opcional: atividade pode existir sem data agendada.
-- ---------------------------------------------------------------------------
alter table public.tasks
  alter column date drop not null;

-- ---------------------------------------------------------------------------
-- 2) Origem (default 'manual'; enum-like em texto, validado na aplicacao).
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists origin text not null default 'manual';

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0007
-- Verificacao: rode 0007_tasks_tcore.verify.sql
-- Reverter:    rode 0007_tasks_tcore.rollback.sql (bloqueia se houver date NULL)
-- ===========================================================================
