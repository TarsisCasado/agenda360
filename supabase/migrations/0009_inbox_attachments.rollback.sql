-- ===========================================================================
-- ROLLBACK da migration 0009 (volta ao estado do 0008)
-- ---------------------------------------------------------------------------
-- SEGURANCA DO BUCKET:
--   * NUNCA apaga arquivos silenciosamente.
--   * NUNCA remove um bucket que contenha objetos — nesse caso o bucket e
--     PRESERVADO (com aviso), e o rollback do restante segue normalmente.
--   * So remove o bucket 'captures' se ele estiver VAZIO.
-- A tabela inbox_attachments guarda apenas descritores (metadados); removê-la
-- NAO apaga binarios do Storage.
-- ===========================================================================

begin;

-- 1) Policies de storage.objects deste bucket.
drop policy if exists "captures objects select" on storage.objects;
drop policy if exists "captures objects insert" on storage.objects;
drop policy if exists "captures objects delete" on storage.objects;

-- 2) Policies + tabela de descritores.
drop policy if exists inbox_attachments_select on public.inbox_attachments;
drop policy if exists inbox_attachments_insert on public.inbox_attachments;
drop policy if exists inbox_attachments_delete on public.inbox_attachments;
drop table if exists public.inbox_attachments;

-- 3) Bucket: remover SOMENTE se vazio; preservar (sem erro) se houver objetos.
do $$
declare
  n_objs bigint;
begin
  if exists (select 1 from storage.buckets where id = 'captures') then
    select count(*) into n_objs from storage.objects where bucket_id = 'captures';
    if n_objs > 0 then
      raise notice 'Bucket "captures" PRESERVADO: contem % objeto(s). Nenhum arquivo foi apagado.', n_objs;
    else
      delete from storage.buckets where id = 'captures';
      raise notice 'Bucket "captures" removido (estava vazio).';
    end if;
  end if;
end $$;

commit;

-- ===========================================================================
-- FIM DO ROLLBACK 0009
-- ===========================================================================
