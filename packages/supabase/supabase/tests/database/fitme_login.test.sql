-- The fitme login (20261014130000_fitme_login.sql, ADR 0003) and the rule
-- that every public table has RLS: a table without it keeps Supabase's
-- default grants, so anyone switching to authenticated could read all of it.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(9);

select has_role('fitme', 'the fitme role exists');

select ok(
  (select rolcanlogin and not rolinherit from pg_catalog.pg_roles where rolname = 'fitme'),
  'fitme is a NOINHERIT login'
);

select ok(
  (
    select not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)
    from pg_catalog.pg_roles where rolname = 'fitme'
  ),
  'fitme has no superuser, BYPASSRLS, CREATEROLE, CREATEDB or REPLICATION'
);

select is(
  array(
    select granted.rolname::text
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles granted on granted.oid = m.roleid
    join pg_catalog.pg_roles member on member.oid = m.member
    where member.rolname = 'fitme'
    order by 1
  ),
  array['authenticated', 'service_role'],
  'fitme can switch to authenticated and service_role only'
);

-- Straight from the ACLs: information_schema hides grants on objects the
-- session's roles don't own.
select is_empty(
  $$
    select n.nspname, c.relname, acl.privilege_type
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) acl
    where acl.grantee = 'fitme'::regrole
  $$,
  'fitme has no direct table grants'
);

select ok(
  not has_table_privilege('fitme', 'public.profiles', 'select'),
  'fitme itself can''t read a User table'
);

select ok(
  not has_schema_privilege('fitme', 'private', 'usage'),
  'fitme itself can''t use the private schema'
);

select ok(
  not exists (select from pg_catalog.pg_roles where rolname = 'fitme' and rolconfig is not null),
  'fitme has no role-level settings'
);

select is_empty(
  $$
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has RLS enabled'
);

select * from finish();
rollback;
