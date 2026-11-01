begin;
select plan(12);

select has_index('public', 'workout_session_progress', 'workout_session_progress_qualifying_idx',
  array['user_id', 'started_at', 'finished_at'], 'qualification and both time bounds are indexed');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname in ('sync_workout_session_progress',
     'sync_workout_session_exercise_progress', 'count_workout_session_logged_sets', 'count_workout_session_progress')
   and p.prosecdef and p.proconfig @> array['search_path=""']),
  4::bigint, 'all cache triggers are owner-run with an empty search path');
select ok(not has_function_privilege('authenticated', 'private.count_workout_session_progress()', 'EXECUTE'),
  'callers cannot invoke the owner-run trigger function');
select ok(not has_table_privilege('authenticated', 'private.workout_session_exercise_progress', 'SELECT'),
  'private Exercise counters are not readable through the Data API');
select ok(not has_table_privilege('service_role', 'public.workout_session_progress', 'UPDATE'),
  'only the triggers, including under the backend role, update counters');

insert into public.workout_sessions (id, user_id, started_at, finished_at)
values ('11111111-4640-4000-8000-000000000001', 'user_progressPolicy', now(), now());
insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order")
values ('11111111-4640-4000-8000-000000000002', '11111111-4640-4000-8000-000000000001', 'progress', 1);
insert into public.workout_session_exercise_sets (workout_session_exercise_id, "order", reps_completed)
values ('11111111-4640-4000-8000-000000000002', 1, 8);
select set_config('request.jwt.claims', '{"sub":"user_progressPolicy","role":"authenticated"}', true);
set local role authenticated;
select is((select completed_set_count from public.workout_session_progress), 1::bigint,
  'caller reads own trigger-maintained Session count');
select throws_ok($$insert into public.workout_session_progress (workout_session_id, user_id, started_at)
  values ('11111111-4640-4000-8000-000000000001', 'user_progressPolicy', now())$$,
  '42501', null, 'caller cannot insert aggregate rows');
select throws_ok($$update public.workout_session_progress set completed_set_count = 999$$,
  '42501', null, 'caller cannot forge a counter');
select throws_ok($$delete from public.workout_session_progress$$,
  '42501', null, 'caller cannot remove aggregate rows');
reset role;
select set_config('request.jwt.claims', '{"sub":"user_otherProgressPolicy","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.workout_session_progress), 0::bigint, 'another User sees no aggregates');
reset role;
delete from public.workout_session_exercises where id = '11111111-4640-4000-8000-000000000002';
select is((select completed_set_count from public.workout_session_progress where user_id = 'user_progressPolicy'), 0::bigint,
  'deleting an Exercise cascades its cached count exactly once');
delete from public.workout_sessions where user_id = 'user_progressPolicy';
select is((select count(*) from public.workout_session_progress where user_id = 'user_progressPolicy'), 0::bigint,
  'deleting a Session cascades its aggregate');
select * from finish();
rollback;
