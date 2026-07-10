-- ===========================================================================
-- VERIFICACAO da migration 0002 (rode no SQL Editor apos aplicar a migration)
-- ===========================================================================

-- 1) DEFAULT auth.uid() aplicado nas 6 colunas de identidade?
--    Esperado: cada linha com column_default contendo "auth.uid()".
select table_name, column_name, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'tasks'            and column_name = 'created_by') or
    (table_name = 'links'            and column_name = 'created_by') or
    (table_name = 'categories'       and column_name = 'created_by') or
    (table_name = 'reminders'        and column_name = 'created_by') or
    (table_name = 'activity_logs'    and column_name = 'actor_id')   or
    (table_name = 'ai_conversations' and column_name = 'user_id')
  )
order by table_name;

-- 2) Policies por-comando criadas? (INSERT deve conter a checagem de identidade)
--    Esperado: para cada tabela, policies *_select/_insert/_update/_delete
--    (activity_logs sem update/delete). O with_check do _insert deve mencionar
--    "auth.uid()".
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in
      ('tasks','links','categories','reminders','activity_logs','ai_conversations')
order by tablename, cmd, policyname;

-- 3) A policy antiga "<tabela>_all" NAO deve mais existir nessas tabelas.
--    Esperado: 0 linhas.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname like '%\_all' escape '\'
  and tablename in
      ('tasks','links','categories','reminders','activity_logs','ai_conversations');

-- 4) RLS continua habilitada em todas as tabelas? Esperado: rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in
      ('tasks','links','categories','reminders','activity_logs','ai_conversations')
order by tablename;

-- 5) (Opcional/manual) Teste de spoofing — deve FALHAR para a sessao autenticada
--    ao tentar inserir com created_by de outro usuario:
--      insert into public.tasks (workspace_id, created_by, title, date)
--      values ('<SEU_WS>', '<OUTRO_USER_ID>', 'spoof', current_date);
--    Resultado esperado: violacao de RLS (new row violates row-level security).
