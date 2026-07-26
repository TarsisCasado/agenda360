-- ===========================================================================
-- PRECHECK da migration 0008 (rode ANTES; nao altera nada)
-- ---------------------------------------------------------------------------
-- Vinculo Inbox <-> Task: cria a tabela public.inbox_task_links.
-- Somente leitura.
-- ===========================================================================

-- 1) Pre-requisitos: inbox_items e tasks existem? Esperado: 2 nao-nulos.
select
  to_regclass('public.inbox_items') is not null as tem_inbox_items,
  to_regclass('public.tasks')       is not null as tem_tasks;

-- 2) A tabela de vinculo ja existe? Esperado: NULL na 1a aplicacao.
select to_regclass('public.inbox_task_links') as inbox_task_links_regclass;
