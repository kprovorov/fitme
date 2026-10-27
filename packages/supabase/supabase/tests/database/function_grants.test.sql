-- EXECUTE grants on the SECURITY DEFINER functions in public (FIT-326): they
-- run with their owner's rights, so anon (anyone holding the publishable key)
-- may call none of them but current_user_id(). Postgres grants EXECUTE to
-- PUBLIC by default and Supabase's default privileges grant it to anon too,
-- so a new one revokes both in its own migration and gets a line here. The
-- legacy RPCs are gone (20261027120000_drop_legacy_rpcs.sql, FIT-339).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(13);

select is(
  array(
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
    order by 1
  ),
  array[
    'current_user_id()'
  ],
  'every SECURITY DEFINER function in public is covered by this test'
);

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
  'PUBLIC has no EXECUTE on any other SECURITY DEFINER function'
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
  'anon has no EXECUTE on any other SECURITY DEFINER function'
);

-- The policy of every app table but arnold_sessions targets PUBLIC and calls
-- current_user_id(), and anon holds those tables' grants
-- (table_grants.test.sql), so without EXECUTE an anon read fails with
-- permission denied instead of finding no rows.
select ok(
  has_function_privilege('anon', 'public.current_user_id()', 'EXECUTE'),
  'anon keeps EXECUTE on current_user_id(), which the RLS policies call'
);

-- The legacy RPCs are gone: the services in packages/services are the only
-- implementation (20261027120000_drop_legacy_rpcs.sql, and
-- 20261014120000_drop_store_plan.sql before it).
select hasnt_function('public', 'activate_plan', 'activate_plan is dropped');
select hasnt_function('public', 'create_plan', 'create_plan is dropped');
select hasnt_function('public', 'update_plan', 'update_plan is dropped');
select hasnt_function('public', 'convert_measurement_system', 'convert_measurement_system is dropped');
select hasnt_function('public', 'start_workout_session', 'start_workout_session is dropped');
select hasnt_function('public', 'finish_workout_session', 'finish_workout_session is dropped');
select hasnt_function('public', 'workout_session_plan_changes', 'workout_session_plan_changes is dropped');
select hasnt_function('private', 'exercise_name_from_slug', 'exercise_name_from_slug is dropped');
select hasnt_function('public', 'store_plan', 'store_plan is dropped');

select * from finish();
rollback;
