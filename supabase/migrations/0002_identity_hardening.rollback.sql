-- ===========================================================================
-- ROLLBACK da migration 0002 — restaura o estado anterior (schema base).
-- Idempotente e seguro: recria as policies "<tabela>_all" e remove os DEFAULTs.
-- Nao altera dados. Nao apaga/renomeia tabelas.
-- ===========================================================================

begin;

-- 1) Remove os DEFAULT auth.uid() (volta a exigir o valor do cliente)
alter table public.tasks            alter column created_by drop default;
alter table public.links            alter column created_by drop default;
alter table public.categories       alter column created_by drop default;
alter table public.reminders        alter column created_by drop default;
alter table public.activity_logs    alter column actor_id   drop default;
alter table public.ai_conversations alter column user_id    drop default;

-- 2) Recria a policy combinada "<tabela>_all" (pertencimento) e remove as
--    policies por-comando criadas pela migration.
do $$
declare t text;
begin
  foreach t in array array[
    'tasks','links','categories','reminders','ai_conversations'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format('drop policy if exists %I on public.%I;', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all '
      || 'using (public.is_workspace_member(workspace_id)) '
      || 'with check (public.is_workspace_member(workspace_id));',
      t || '_all', t
    );
  end loop;
end $$;

-- activity_logs: no schema base tinha select + insert (sem update/delete).
drop policy if exists activity_logs_select on public.activity_logs;
drop policy if exists activity_logs_insert on public.activity_logs;
drop policy if exists activity_logs_all    on public.activity_logs;
create policy activity_logs_all on public.activity_logs
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

commit;

-- ===========================================================================
-- FIM DO ROLLBACK 0002
-- ===========================================================================
