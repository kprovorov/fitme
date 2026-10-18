-- Table grants on public (FIT-95, 20261016120000_explicit_table_grants.sql):
-- the migrations grant them explicitly instead of relying on Supabase's
-- default privileges, which roles.sql drops on local stacks and CI. Without
-- grants, PostgREST and asUser fail with "permission denied" before RLS runs.
-- The expected grants are the hosted project's as of FIT-95; narrowing them
-- is a production change, made in a migration and here together.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(6);

-- A new table grants what it needs in its own migration, then gets a line
-- here (and in the checks below if it doesn't take the app tables' grants).
select is(
  array(
    select c.relname::text
    from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
    order by 1
  ),
  array[
    'coach_sessions',
    'exercises',
    'plans',
    'profiles',
    'workout_exercise_sets',
    'workout_exercises',
    'workout_session_exercise_sets',
    'workout_session_exercises',
    'workout_sessions',
    'workouts'
  ],
  'every table and view in public is covered by this test'
);

select is_empty(
  $$
    select r.role
    from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where not has_schema_privilege(r.role, 'public', 'usage')
  $$,
  'anon, authenticated and service_role can use the public schema'
);

-- Every table but coach_sessions, which narrows its own grants.
select is_empty(
  $$
    select c.relname, r.role, p.privilege
    from pg_catalog.pg_class c
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array[
      'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
    ]) as p(privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and c.relname <> 'coach_sessions'
      and not has_table_privilege(r.role, c.oid, p.privilege)
  $$,
  'anon, authenticated and service_role hold every privilege on the app tables'
);

-- coach_sessions (20261014160000_coach_sessions.sql): a User reads and
-- records their own sessions, anon nothing.
select is_empty(
  $$
    select acl.privilege_type
    from pg_catalog.pg_class c
    cross join lateral aclexplode(c.relacl) acl
    where c.oid = 'public.coach_sessions'::regclass
      and acl.grantee = 'anon'::regrole
  $$,
  'anon has no grants on coach_sessions'
);

select is(
  array(
    select acl.privilege_type::text
    from pg_catalog.pg_class c
    cross join lateral aclexplode(c.relacl) acl
    where c.oid = 'public.coach_sessions'::regclass
      and acl.grantee = 'authenticated'::regrole
    order by 1
  ),
  array['INSERT', 'SELECT'],
  'authenticated can only read and insert coach_sessions'
);

select is_empty(
  $$
    select p.privilege
    from unnest(array[
      'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
    ]) as p(privilege)
    where not has_table_privilege('service_role', 'public.coach_sessions', p.privilege)
  $$,
  'service_role holds every privilege on coach_sessions'
);

select * from finish();
rollback;
