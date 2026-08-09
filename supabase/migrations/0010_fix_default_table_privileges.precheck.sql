-- ===========================================================================
-- PRECHECK da migration 0010 (rode ANTES; nao altera nada) — 3 checks
-- ---------------------------------------------------------------------------
-- Fotografa o estado dos DEFAULT PRIVILEGES de TABELAS no schema public e
-- confirma sob qual papel o SQL Editor esta executando. Somente leitura.
-- ===========================================================================

-- 1) Sob qual papel estamos executando, e temos direito sobre supabase_admin?
--    A 0010 NAO altera defaults de supabase_admin — este check e informativo,
--    para registrar por que a entrada da plataforma permanece intacta.
select
  current_user                                          as executando_como,
  pg_has_role(current_user, 'supabase_admin', 'MEMBER') as e_membro_supabase_admin,
  (select rolsuper from pg_roles where rolname = current_user) as e_superuser,
  case
    when pg_has_role(current_user, 'supabase_admin', 'MEMBER')
    then 'PODE alterar defaults de supabase_admin (a 0010 ainda assim NAO altera)'
    else 'NAO PODE — entrada de supabase_admin fica intacta (esperado)'
  end                                                   as veredito;

-- 2) Estado ATUAL dos defaults de TABELAS em public, para anon/authenticated.
--    Esperado ANTES da 0010: linhas para postgres (o alvo da migration) e,
--    possivelmente, para supabase_admin (plataforma; fora do escopo).
select
  pg_get_userbyid(d.defaclrole)  as definido_por,
  n.nspname                      as schema,
  'tabelas'                      as tipo_objeto,
  acl.grantee::regrole::text     as beneficiado,
  string_agg(acl.privilege_type, ', ' order by acl.privilege_type) as privilegios,
  count(*)                       as qtd_privilegios
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) as acl
where n.nspname = 'public'
  and d.defaclobjtype = 'r'
  and acl.grantee::regrole::text in ('anon', 'authenticated')
group by 1, 2, 3, 4
order by beneficiado, definido_por;

-- 3) O que a 0010 vai efetivamente remover. Esperado: 1 ou 2 linhas
--    (postgres -> anon e/ou postgres -> authenticated). Zero linhas significa
--    que o estado desejado ja vigora e a migration sera um no-op.
select
  acl.grantee::regrole::text as sera_removido_de,
  string_agg(acl.privilege_type, ', ' order by acl.privilege_type) as privilegios_hoje
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) as acl
where n.nspname = 'public'
  and d.defaclobjtype = 'r'
  and pg_get_userbyid(d.defaclrole) = 'postgres'
  and acl.grantee::regrole::text in ('anon', 'authenticated')
group by 1
order by 1;
