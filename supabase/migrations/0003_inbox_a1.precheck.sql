-- ===========================================================================
-- PRECHECK da migration 0003 (rode ANTES de aplicar; nao altera nada)
-- Confere que os pre-requisitos existem e que a tabela ainda nao foi criada.
-- ===========================================================================

-- 1) Pre-requisitos do schema base (0001). Esperado: 3 linhas (todas true).
select
  to_regclass('public.workspaces') is not null            as tem_workspaces,
  to_regclass('public.profiles')   is not null            as tem_profiles,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_workspace_member') > 0
                                                            as tem_is_workspace_member,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at') > 0
                                                            as tem_set_updated_at;

-- 2) A tabela ja existe? Esperado: NULL (ainda nao criada) na primeira aplicacao.
--    (A migration e idempotente; se retornar preenchido, ja foi aplicada.)
select to_regclass('public.inbox_items') as inbox_items_regclass;
