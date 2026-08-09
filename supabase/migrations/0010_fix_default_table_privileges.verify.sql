-- ===========================================================================
-- VERIFICACAO da migration 0010 (rode apos aplicar) — 2 checks
-- ---------------------------------------------------------------------------
-- Os dois checks se auto-avaliam (OK / FALHOU / INFORMATIVO).
--
-- DETALHE IMPORTANTE do check 1: o estado DESEJADO e a AUSENCIA de linha em
-- pg_default_acl. Por isso a matriz parte de uma lista fixa de 4 pares e usa
-- LEFT JOIN — a ausencia aparece explicitamente como '(nenhum)' + 'OK', nunca
-- como linha faltando (que seria indistinguivel de uma query mal escrita).
-- ===========================================================================

-- 1) Matriz completa: SEMPRE 4 linhas, uma por (definido_por x beneficiado).
--    Esperado apos a 0010:
--      postgres       -> anon / authenticated : '(nenhum)'  + 'OK (sem default)'
--      supabase_admin -> anon / authenticated : (o que houver) + 'INFORMATIVO'
--    supabase_admin e da PLATAFORMA: fora do escopo da 0010, nunca 'FALHOU'.
with esperado(definido_por, beneficiado, sob_nosso_controle) as (
  values ('postgres',       'anon',          true),
         ('postgres',       'authenticated', true),
         ('supabase_admin', 'anon',          false),
         ('supabase_admin', 'authenticated', false)
),
real as (
  select
    pg_get_userbyid(d.defaclrole) as definido_por,
    acl.grantee::regrole::text    as beneficiado,
    string_agg(acl.privilege_type, ', ' order by acl.privilege_type) as privilegios
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) as acl
  where n.nspname = 'public'
    and d.defaclobjtype = 'r'
  group by 1, 2
)
select
  e.definido_por,
  e.beneficiado,
  coalesce(r.privilegios, '(nenhum)') as privilegios,
  case
    when r.privilegios is null    then 'OK (sem default)'
    when e.sob_nosso_controle     then 'FALHOU (residual sob nosso controle)'
    else 'INFORMATIVO (plataforma — fora do escopo da 0010)'
  end                               as veredito
from esperado e
left join real r
  on  r.definido_por = e.definido_por
  and r.beneficiado  = e.beneficiado
order by e.definido_por, e.beneficiado;

-- 2) Veredito GLOBAL: nenhum default residual sob NOSSO controle (papel
--    postgres) para anon/authenticated em tabelas de public.
--    Esperado: residuais_postgres = 0 e veredito = 'OK'.
select
  count(*) as residuais_postgres,
  case when count(*) = 0 then 'OK' else 'FALHOU' end as veredito
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) as acl
where n.nspname = 'public'
  and d.defaclobjtype = 'r'
  and pg_get_userbyid(d.defaclrole) = 'postgres'
  and acl.grantee::regrole::text in ('anon', 'authenticated');
