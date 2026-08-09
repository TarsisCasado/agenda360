-- ===========================================================================
-- VERIFICACAO da migration 0009 (rode apos aplicar) — 12 checks
-- ---------------------------------------------------------------------------
-- Os checks 11 e 12 (grants) se auto-avaliam e devolvem veredito OK|FALHOU:
-- conferir listas de privilegios a olho foi exatamente o que deixou passar o
-- UPDATE/TRUNCATE herdados das default privileges.
-- ===========================================================================

-- 1) Tabela criada? Esperado: nao-nulo.
select to_regclass('public.inbox_attachments') as inbox_attachments_regclass;

-- 2) 12 colunas esperadas? Esperado: 12.
select count(*) as colunas_ok
from information_schema.columns
where table_schema='public' and table_name='inbox_attachments'
  and column_name in ('id','workspace_id','inbox_item_id','kind','storage_bucket',
    'storage_path','mime','bytes','width','height','created_by','created_at');

-- 3) FKs com ON DELETE correto? Esperado:
--    workspace_id=c (cascade), inbox_item_id=c (cascade), created_by=n (set null).
select conname, confdeltype
from pg_constraint
where conrelid='public.inbox_attachments'::regclass and contype='f'
order by conname;

-- 4) created_by com DEFAULT auth.uid()? Esperado: default contendo 'auth.uid()'.
select column_default
from information_schema.columns
where table_schema='public' and table_name='inbox_attachments' and column_name='created_by';

-- 5) Unique (storage_bucket, storage_path)? Esperado: 1 linha.
select conname from pg_constraint
where conrelid='public.inbox_attachments'::regclass and contype='u';

-- 6) Indices esperados? Esperado: idx_inbox_attachments_item e _ws.
select indexname from pg_indexes
where schemaname='public' and tablename='inbox_attachments'
order by indexname;

-- 7) RLS habilitada? Esperado: true.
select rowsecurity from pg_tables
where schemaname='public' and tablename='inbox_attachments';

-- 8) Policies da TABELA: apenas select/insert/delete (imutavel — SEM update).
--    Esperado: 3 linhas (select, insert, delete).
select policyname, cmd
from pg_policies
where schemaname='public' and tablename='inbox_attachments'
order by cmd, policyname;

-- 9) Bucket privado 'captures'? Esperado: 1 linha, public=false.
select id, public from storage.buckets where id='captures';

-- 10) Policies de storage.objects do bucket: select/insert/delete (SEM update).
--     Esperado: 3 linhas.
select policyname, cmd
from pg_policies
where schemaname='storage' and tablename='objects' and policyname like 'captures %'
order by cmd, policyname;

-- 11) Grants de `authenticated`: EXATAMENTE SELECT, INSERT, DELETE (sem UPDATE
--     nem TRUNCATE). Esperado: veredito = 'OK'.
select
  coalesce(string_agg(privilege_type, ',' order by privilege_type), '(nenhum)') as privilegios,
  case
    when coalesce(string_agg(privilege_type, ',' order by privilege_type), '') = 'DELETE,INSERT,SELECT'
    then 'OK' else 'FALHOU'
  end as veredito
from information_schema.role_table_grants
where table_schema='public' and table_name='inbox_attachments' and grantee='authenticated';

-- 12) `anon` NAO pode ter privilegio nenhum nesta tabela.
--     Esperado: veredito = 'OK' (privilegios_anon = 0).
select
  count(*) as privilegios_anon,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from information_schema.role_table_grants
where table_schema='public' and table_name='inbox_attachments' and grantee='anon';
