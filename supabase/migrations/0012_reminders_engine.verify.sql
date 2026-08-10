-- ===========================================================================
-- VERIFICACAO da migration 0012 (rode apos aplicar) — 9 checks
-- ---------------------------------------------------------------------------
-- Todos os checks se auto-avaliam (OK / FALHOU). Onde o estado desejado e a
-- AUSENCIA de algo, a consulta parte de uma lista fixa em VALUES + LEFT JOIN,
-- para que a ausencia apareca como veredito explicito e nunca como resultado
-- vazio (que seria indistinguivel de uma query errada).
-- ===========================================================================

-- 1) COLUNAS NOVAS — tipo, nulidade e default. Sempre 5 linhas.
--    Esperado: TODAS 'OK'.
--      profiles.timezone           text,      NOT NULL, default 'America/Sao_Paulo'
--      reminders.recipient_id      uuid,      NULL
--      reminders.minutes_before    integer,   NULL
--      reminders.cancelled_at      timestamptz, NULL
--      notifications.user_id       uuid,      NULL
with esperado(tabela, coluna, tipo_ok, nulo_ok, tem_default) as (
  values
    ('profiles',      'timezone',       'text',                        'NO',  true),
    ('reminders',     'recipient_id',   'uuid',                        'YES', false),
    ('reminders',     'minutes_before', 'integer',                     'YES', false),
    ('reminders',     'cancelled_at',   'timestamp with time zone',    'YES', false),
    ('notifications', 'user_id',        'uuid',                        'YES', false)
)
select
  e.tabela, e.coluna,
  coalesce(c.data_type, '(ausente)')     as tipo_real,
  coalesce(c.is_nullable, '-')           as aceita_null,
  coalesce(c.column_default, '(sem default)') as padrao,
  case
    when c.column_name is null        then 'FALHOU (coluna ausente)'
    when c.data_type   <> e.tipo_ok   then 'FALHOU (tipo divergente)'
    when c.is_nullable <> e.nulo_ok   then 'FALHOU (nulidade divergente)'
    when e.tem_default and c.column_default is null then 'FALHOU (sem default)'
    else 'OK'
  end as veredito
from esperado e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = e.tabela and c.column_name = e.coluna
order by e.tabela, e.coluna;

-- 2) DEFAULT do timezone e exatamente 'America/Sao_Paulo'? Esperado: OK.
select
  coalesce(column_default, '(sem default)') as default_real,
  case when column_default like '%America/Sao_Paulo%' then 'OK' else 'FALHOU' end as veredito
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='timezone';

-- 3) FKs das colunas de destinatario apontam para profiles com ON DELETE SET
--    NULL (padrao do schema)? Sempre 2 linhas. Esperado: ambas 'OK'.
with esperado(tabela, coluna) as (
  values ('reminders','recipient_id'), ('notifications','user_id')
),
fks as (
  select c.relname as tabela, a.attname as coluna,
         con.conname, con.confdeltype,
         cf.relname as referencia
  from pg_constraint con
  join pg_class c   on c.oid  = con.conrelid
  join pg_class cf  on cf.oid = con.confrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
  where n.nspname='public' and con.contype='f'
    and c.relname in ('reminders','notifications')
)
select
  e.tabela, e.coluna,
  coalesce(f.referencia, '(sem FK)') as referencia,
  coalesce(case f.confdeltype when 'n' then 'set null' when 'c' then 'cascade'
                              else f.confdeltype::text end, '-') as on_delete,
  case
    when f.conname is null            then 'FALHOU (FK ausente)'
    when f.referencia <> 'profiles'   then 'FALHOU (referencia errada)'
    when f.confdeltype <> 'n'         then 'FALHOU (on delete diferente de set null)'
    else 'OK'
  end as veredito
from esperado e
left join fks f on f.tabela = e.tabela and f.coluna = e.coluna
order by e.tabela, e.coluna;

-- 4) INDICES DE IDEMPOTENCIA — sempre 3 linhas. Esperado: TODAS 'OK'.
--    uq_reminders_alive DEVE conter minutes_before (preserva multiplos
--    lembretes por task/canal) e ser PARCIAL nos vivos.
with esperado(indice, tabela, deve_ser_unico, trecho_obrigatorio) as (
  values
    ('uq_reminders_alive',              'reminders',     true,  'minutes_before'),
    ('idx_reminders_due_alive',         'reminders',     false, 'cancelled_at'),
    ('uq_notifications_reminder_channel','notifications', true,  'reminder_id')
)
select
  e.indice, e.tabela,
  coalesce(i.indexdef, '(ausente)') as definicao,
  case
    when i.indexname is null                                   then 'FALHOU (indice ausente)'
    when e.deve_ser_unico and i.indexdef not like 'CREATE UNIQUE%' then 'FALHOU (nao e unico)'
    when i.indexdef not like '%' || e.trecho_obrigatorio || '%' then 'FALHOU (coluna-chave ausente)'
    when i.indexdef not like '%WHERE%'                         then 'FALHOU (nao e parcial)'
    else 'OK'
  end as veredito
from esperado e
left join pg_indexes i
  on i.schemaname='public' and i.tablename = e.tabela and i.indexname = e.indice
order by e.tabela, e.indice;

-- 5) RLS continua HABILITADA nas 3 tabelas tocadas. Esperado: 3 + 'OK'.
select
  count(*) filter (where rowsecurity) as com_rls,
  count(*)                            as total,
  case when count(*) = 3 and count(*) filter (where rowsecurity) = 3
       then 'OK' else 'FALHOU' end    as veredito
from pg_tables
where schemaname='public' and tablename in ('profiles','reminders','notifications');

-- 6) GRANTS continuam EXATAMENTE dentro da matriz da 0011 (a 0012 nao os
--    altera). Sempre 4 linhas. Esperado: TODAS 'OK'.
--    anon deve seguir SEM acesso as duas tabelas do motor.
with esperado(tabela, papel, privilegios_ok) as (
  values
    ('reminders',     'authenticated', 'DELETE,INSERT,SELECT,UPDATE'),
    ('notifications', 'authenticated', 'SELECT'),
    ('reminders',     'anon', ''),
    ('notifications', 'anon', '')
),
real as (
  select table_name as tabela, grantee as papel,
         string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('reminders','notifications')
    and grantee in ('anon','authenticated')
  group by 1,2
)
select
  e.tabela, e.papel,
  coalesce(r.privs, '(nenhum)') as privilegios_atuais,
  coalesce(nullif(e.privilegios_ok,''), '(nenhum)') as privilegios_esperados,
  case when coalesce(r.privs,'') = e.privilegios_ok then 'OK' else 'FALHOU' end as veredito
from esperado e
left join real r on r.tabela = e.tabela and r.papel = e.papel
order by e.papel, e.tabela;

-- 7) POLICIES relevantes continuam existentes e inalteradas pela 0012.
--    Sempre 5 linhas. Esperado: TODAS 'OK (existe)'.
with esperado(tabela, policy, comando) as (
  values
    ('reminders','reminders_select','SELECT'), ('reminders','reminders_insert','INSERT'),
    ('reminders','reminders_update','UPDATE'), ('reminders','reminders_delete','DELETE'),
    ('notifications','notifications_select','SELECT')
)
select
  e.tabela, e.policy, e.comando as comando_esperado,
  coalesce(p.cmd, '(ausente)')  as comando_real,
  case
    when p.policyname is null then 'FALHOU (policy ausente)'
    when p.cmd <> e.comando   then 'FALHOU (comando divergente)'
    else 'OK (existe)'
  end as veredito
from esperado e
left join pg_policies p
  on p.schemaname='public' and p.tablename = e.tabela and p.policyname = e.policy
order by e.tabela, e.comando;

-- 8) NENHUMA TABELA FORA DO ESCOPO foi alterada.
--    A 0012 so podia tocar profiles/reminders/notifications. Este check
--    procura as colunas novas em QUALQUER outra tabela do schema public.
--    Esperado: 0 + 'OK'.
select
  count(*) as colunas_fora_do_escopo,
  coalesce(string_agg(table_name || '.' || column_name, ', '), '(nenhuma)') as quais,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from information_schema.columns
where table_schema='public'
  and column_name in ('timezone','recipient_id','minutes_before','cancelled_at')
  and table_name not in ('profiles','reminders','notifications');

-- 9) VEREDITO GLOBAL — consolida colunas, FKs, indices, RLS e grants.
--    Esperado: 0/0/0/0/0 e 'OK'.
with colunas_faltando as (
  select count(*) as n from (
    with esperado(tabela, coluna) as (
      values ('profiles','timezone'), ('reminders','recipient_id'),
             ('reminders','minutes_before'), ('reminders','cancelled_at'),
             ('notifications','user_id')
    )
    select 1 from esperado e
    left join information_schema.columns c
      on c.table_schema='public' and c.table_name=e.tabela and c.column_name=e.coluna
    where c.column_name is null
  ) x
),
indices_faltando as (
  select count(*) as n from (
    values ('uq_reminders_alive'), ('idx_reminders_due_alive'),
           ('uq_notifications_reminder_channel')
  ) v(indice)
  where not exists (
    select 1 from pg_indexes i
    where i.schemaname='public' and i.indexname = v.indice
  )
),
fks_faltando as (
  select count(*) as n from (
    values ('reminders','recipient_id'), ('notifications','user_id')
  ) v(tabela, coluna)
  where not exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    where n.nspname='public' and con.contype='f'
      and c.relname = v.tabela and a.attname = v.coluna
  )
),
rls_desabilitada as (
  select count(*) as n from pg_tables
  where schemaname='public'
    and tablename in ('profiles','reminders','notifications')
    and not rowsecurity
),
grants_divergentes as (
  select count(*) as n from (
    with esperado(tabela, papel, privilegios_ok) as (
      values ('reminders','authenticated','DELETE,INSERT,SELECT,UPDATE'),
             ('notifications','authenticated','SELECT'),
             ('reminders','anon',''), ('notifications','anon','')
    ),
    real as (
      select table_name as tabela, grantee as papel,
             string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
      where table_schema='public'
        and table_name in ('reminders','notifications')
        and grantee in ('anon','authenticated')
      group by 1,2
    )
    select 1 from esperado e
    left join real r on r.tabela = e.tabela and r.papel = e.papel
    where coalesce(r.privs,'') <> e.privilegios_ok
  ) y
)
select
  c.n as colunas_faltando,
  i.n as indices_faltando,
  f.n as fks_faltando,
  s.n as tabelas_sem_rls,
  g.n as grants_divergentes,
  case when c.n=0 and i.n=0 and f.n=0 and s.n=0 and g.n=0
       then 'OK' else 'FALHOU' end as veredito_global
from colunas_faltando c, indices_faltando i, fks_faltando f,
     rls_desabilitada s, grants_divergentes g;
