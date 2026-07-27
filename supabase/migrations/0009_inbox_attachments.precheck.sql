-- ===========================================================================
-- PRECHECK da migration 0009 (rode ANTES; nao altera nada)
-- ---------------------------------------------------------------------------
-- Assets de captura: tabela public.inbox_attachments + bucket privado
-- 'captures' + policies de storage.objects. Somente leitura.
-- ===========================================================================

-- 1) Pre-requisitos. Esperado: todos true.
select
  to_regclass('public.workspaces')  is not null as tem_workspaces,
  to_regclass('public.profiles')    is not null as tem_profiles,
  to_regclass('public.inbox_items') is not null as tem_inbox_items,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='is_workspace_member') > 0
                                                 as tem_is_workspace_member;

-- 2) A tabela ja existe? Esperado: NULL na 1a aplicacao.
select to_regclass('public.inbox_attachments') as inbox_attachments_regclass;

-- 3) O bucket ja existe? Esperado: 0 linhas na 1a aplicacao.
select id, public from storage.buckets where id = 'captures';

-- 4) Ja existem policies de storage para o bucket? Esperado: 0.
select policyname from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'captures %';
