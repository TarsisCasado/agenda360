-- ===========================================================================
-- ROLLBACK da migration 0008 (volta ao estado do 0007)
-- ---------------------------------------------------------------------------
-- Remove APENAS a tabela de vinculo. As Tasks e os InboxItems permanecem
-- intactos (o vinculo e metadado de proveniencia, nao os dados em si).
-- Use somente diante de falha real na aplicacao desta migration.
-- ===========================================================================

begin;

drop table if exists public.inbox_task_links;

commit;
