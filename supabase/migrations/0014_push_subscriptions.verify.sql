-- ===========================================================================
-- VERIFICACAO da migration 0014 (rode apos aplicar) — 5 checks
-- Todos os checks se auto-avaliam (OK / FALHOU).
-- ===========================================================================

-- 1) TABELA e COLUNAS — tipos e nulidade esperados.
with esperado(coluna, tipo_ok, nulo_ok) as (
  values
    ('id',              'uuid',                      'NO'),
    ('user_id',         'uuid',                      'NO'),
    ('endpoint',        'text',                       'NO'),
    ('p256dh',          'text',                       'NO'),
    ('auth',            'text',                       'NO'),
    ('user_agent',      'text',                       'YES'),
    ('created_at',      'timestamp with time zone',   'NO'),
    ('last_seen_at',    'timestamp with time zone',   'NO'),
    ('disabled_at',     'timestamp with time zone',   'YES'),
    ('disabled_reason', 'text',                       'YES')
)
select
  e.coluna,
  coalesce(c.data_type, '(ausente)') as tipo_real,
  coalesce(c.is_nullable, '-')       as aceita_null,
  case
    when c.column_name is null      then 'FALHOU (coluna ausente)'
    when c.data_type   <> e.tipo_ok then 'FALHOU (tipo divergente)'
    when c.is_nullable <> e.nulo_ok then 'FALHOU (nulidade divergente)'
    else 'OK'
  end as veredito
from esperado e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'push_subscriptions' and c.column_name = e.coluna
order by e.coluna;

-- 2) FK user_id -> profiles(id) ON DELETE CASCADE. Esperado: 1 linha 'OK'.
select
  con.conname,
  case when con.confdeltype = 'c' then 'OK' else 'FALHOU (' || con.confdeltype || ')' end as veredito
from pg_constraint con
join pg_class c  on c.oid  = con.conrelid and c.relname = 'push_subscriptions'
join pg_class cf on cf.oid = con.confrelid and cf.relname = 'profiles'
where con.contype = 'f';

-- 3) INDICES esperados. Esperado: as 2 linhas presentes.
select indexname,
  case when indexname in ('uq_push_subscriptions_endpoint','idx_push_subscriptions_user_alive')
       then 'OK' else 'INESPERADO' end as veredito
from pg_indexes
where schemaname = 'public' and tablename = 'push_subscriptions'
  and indexname not like '%_pkey';

-- 4) RLS ligado + 4 policies por-comando, todas restritas a user_id = auth.uid().
select relrowsecurity as rls_habilitado,
  case when relrowsecurity then 'OK' else 'FALHOU (RLS desligado)' end as veredito
from pg_class where relname = 'push_subscriptions' and relnamespace = 'public'::regnamespace;

select policyname, cmd,
  case when qual like '%auth.uid()%' or with_check like '%auth.uid()%' then 'OK' else 'FALHOU' end as veredito
from pg_policies
where schemaname = 'public' and tablename = 'push_subscriptions'
order by policyname;

-- 5) GRANTS — authenticated com CRUD completo; anon ausente.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privilegios,
  case
    when grantee = 'authenticated' and string_agg(privilege_type, ',' order by privilege_type) = 'DELETE,INSERT,SELECT,UPDATE' then 'OK'
    else 'REVISAR'
  end as veredito
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'push_subscriptions'
  and grantee in ('anon','authenticated')
group by grantee
order by grantee;
