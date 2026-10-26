-- EXECUTE grants on the SECURITY DEFINER functions in public (FIT-326,
-- 20261026120000_revoke_anon_rpc_execute.sql): they run with their owner's
-- rights, so anon (anyone holding the publishable key) may call none of them
-- but current_user_id(). Postgres grants EXECUTE to PUBLIC by default and
-- Supabase's default privileges grant it to anon too, so a new one revokes
-- both in its own migration and gets a line here.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(7);

select is(
  array(
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
    order by 1
  ),
  array[
    'activate_plan(uuid)',
    'convert_measurement_system(text)',
    'create_plan(jsonb)',
    'current_user_id()',
    'finish_workout_session(uuid)',
    'start_workout_session(uuid)',
    'update_plan(uuid,jsonb,text)',
    'workout_session_plan_changes(uuid,boolean)'
  ],
  'every SECURITY DEFINER function in public is covered by this test'
);

-- The RPCs installed builds still call as authenticated (until the minimum
-- version gate cuts them off; packages/services).
select is_empty(
  $$
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname <> 'current_user_id'
      and acl.grantee = 0
  $$,
  'PUBLIC has no EXECUTE on the RPCs'
);

select is_empty(
  $$
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname <> 'current_user_id'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon has no EXECUTE on the RPCs'
);

select is_empty(
  $$
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname <> 'current_user_id'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  'authenticated keeps EXECUTE on the RPCs'
);

-- workout_session_plan_changes is authenticated only
-- (20261021120000_workout_session_plan_changes.sql).
select is_empty(
  $$
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname not in ('current_user_id', 'workout_session_plan_changes')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  $$,
  'service_role keeps EXECUTE on the RPCs but workout_session_plan_changes'
);

-- Every app table's policy targets PUBLIC and calls current_user_id(), and
-- anon holds the table grants (table_grants.test.sql), so without EXECUTE an
-- anon read fails with permission denied instead of finding no rows.
select ok(
  has_function_privilege('anon', 'public.current_user_id()', 'EXECUTE'),
  'anon keeps EXECUTE on current_user_id(), which the RLS policies call'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$select public.activate_plan('f5a00000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'anon cannot call an RPC'
);

select * from finish();
rollback;
