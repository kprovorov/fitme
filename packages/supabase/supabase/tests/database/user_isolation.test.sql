-- Two Users cannot read or write each other's data, with Users identified by
-- a Clerk-style text sub claim (20261011120000_user_id_text_key.sql).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(37);

-- ------------------------------------------------------------
-- Schema: text User id, no link to Supabase Auth
-- ------------------------------------------------------------
select col_type_is('public', 'profiles', 'user_id', 'text', 'profiles.user_id is text');
select col_type_is('public', 'plans', 'user_id', 'text', 'plans.user_id is text');
select col_type_is('public', 'workout_sessions', 'user_id', 'text', 'workout_sessions.user_id is text');
select col_not_null('public', 'workout_sessions', 'user_id', 'workout_sessions.user_id stays NOT NULL');

select is(
  (select count(*)::int from pg_constraint
   where confrelid = 'auth.users'::regclass
     and connamespace = 'public'::regnamespace),
  0,
  'no public table references auth.users'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') ilike '%auth.uid%' or coalesce(with_check, '') ilike '%auth.uid%')),
  0,
  'no policy references auth.uid()'
);

select is(
  (select count(*)::int from pg_proc
   where pronamespace = 'public'::regnamespace
     and (prosrc ilike '%auth.uid%' or coalesce(pg_get_function_arguments(oid), '') ilike '%auth.uid%')),
  0,
  'no public function references auth.uid()'
);

select is(
  (select count(*)::int from pg_constraint
   where connamespace = 'public'::regnamespace
     and pg_get_constraintdef(oid) ilike '%auth.uid%'),
  0,
  'no constraint references auth.uid()'
);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS): everything belongs to User A
-- ------------------------------------------------------------
insert into public.exercises (id, name, slug) values
  ('f1e00000-0000-0000-0000-000000000001', 'Test Bench', 'test-bench-user-isolation');

insert into public.profiles (id, user_id, gender, age, weight, height) values
  ('f1f00000-0000-0000-0000-000000000001', 'user_2IsolationA000000000000', 'male', 30, 80, 180);

insert into public.plans (id, user_id, goal, place, frequency) values
  ('f1a00000-0000-0000-0000-000000000001', 'user_2IsolationA000000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('f1b00000-0000-0000-0000-000000000001', 'f1a00000-0000-0000-0000-000000000001', 1, 'A Day', 'Push');

insert into public.workout_exercises (id, workout_id, exercise_id, "order") values
  ('f1c00000-0000-0000-0000-000000000001', 'f1b00000-0000-0000-0000-000000000001', 'f1e00000-0000-0000-0000-000000000001', 1);

insert into public.workout_exercise_sets
  (id, workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values
  ('f1d00000-0000-0000-0000-000000000001', 'f1c00000-0000-0000-0000-000000000001', 1, 5, 100, 120);

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  ('f1500000-0000-0000-0000-000000000001', 'f1b00000-0000-0000-0000-000000000001',
   'f1a00000-0000-0000-0000-000000000001', 'user_2IsolationA000000000000', now());

insert into public.workout_session_exercises (id, workout_session_id, exercise_id, "order") values
  ('f1600000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000001', 'f1e00000-0000-0000-0000-000000000001', 1);

insert into public.workout_session_exercise_sets (id, workout_session_exercise_id, "order", reps_recommended) values
  ('f1700000-0000-0000-0000-000000000001', 'f1600000-0000-0000-0000-000000000001', 1, 5);

-- ------------------------------------------------------------
-- User A sees their own rows
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2IsolationA000000000000","role":"authenticated"}';

select is(public.current_user_id(), 'user_2IsolationA000000000000', 'current_user_id() returns the sub claim');

select is(
  (select
     (select count(*) from public.profiles)
     + (select count(*) from public.plans)
     + (select count(*) from public.workouts)
     + (select count(*) from public.workout_exercises)
     + (select count(*) from public.workout_exercise_sets)
     + (select count(*) from public.workout_sessions)
     + (select count(*) from public.workout_session_exercises)
     + (select count(*) from public.workout_session_exercise_sets))::int,
  8,
  'User A sees one row in each of their eight tables'
);

-- ------------------------------------------------------------
-- User B can't read User A's rows
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2IsolationB000000000000","role":"authenticated"}';

select is_empty($$select id from public.profiles$$, 'User B cannot read User A''s Profile');
select is_empty($$select id from public.plans$$, 'User B cannot read User A''s Plans');
select is_empty($$select id from public.workouts$$, 'User B cannot read User A''s Workouts');
select is_empty($$select id from public.workout_exercises$$, 'User B cannot read User A''s workout exercises');
select is_empty($$select id from public.workout_exercise_sets$$, 'User B cannot read User A''s sets');
select is_empty($$select id from public.workout_sessions$$, 'User B cannot read User A''s Workout Sessions');
select is_empty($$select id from public.workout_session_exercises$$, 'User B cannot read User A''s session exercises');
select is_empty($$select id from public.workout_session_exercise_sets$$, 'User B cannot read User A''s session sets');

-- ------------------------------------------------------------
-- User B can't update or delete User A's rows
-- ------------------------------------------------------------
select is_empty(
  $$update public.profiles set age = 99 returning id$$,
  'User B cannot update User A''s Profile'
);
select is_empty(
  $$update public.plans set name = 'hijacked' returning id$$,
  'User B cannot update User A''s Plans'
);
select is_empty(
  $$update public.workout_exercise_sets set reps_recommended = 99 returning id$$,
  'User B cannot update User A''s sets'
);
select is_empty(
  $$update public.workout_sessions set finished_at = now() returning id$$,
  'User B cannot update User A''s Workout Sessions'
);
select is_empty(
  $$update public.workout_session_exercise_sets set reps_completed = 99 returning id$$,
  'User B cannot update User A''s session sets'
);
select is_empty(
  $$delete from public.workouts returning id$$,
  'User B cannot delete User A''s Workouts'
);

-- ------------------------------------------------------------
-- User B can't write rows into User A's data
-- ------------------------------------------------------------
select throws_ok(
  $$insert into public.profiles (user_id, gender, age, weight, height)
    values ('user_2IsolationA000000000000', 'male', 30, 80, 180)$$,
  '42501', null,
  'User B cannot create a Profile for User A'
);
select throws_ok(
  $$insert into public.plans (user_id, goal, place, frequency)
    values ('user_2IsolationA000000000000', 'strength', 'gym', 3)$$,
  '42501', null,
  'User B cannot create a Plan for User A'
);
select throws_ok(
  $$insert into public.workouts (plan_id, "order", name, description)
    values ('f1a00000-0000-0000-0000-000000000001', 2, 'Intruder', 'x')$$,
  '42501', null,
  'User B cannot add a Workout to User A''s Plan'
);
select throws_ok(
  $$insert into public.workout_exercise_sets
      (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
    values ('f1c00000-0000-0000-0000-000000000001', 2, 1, 1, 1)$$,
  '42501', null,
  'User B cannot add a set to User A''s Workout'
);
select throws_ok(
  $$insert into public.workout_sessions (user_id, started_at)
    values ('user_2IsolationA000000000000', now())$$,
  '42501', null,
  'User B cannot create a Workout Session for User A'
);
select throws_ok(
  $$insert into public.workout_session_exercise_sets (workout_session_exercise_id, "order")
    values ('f1600000-0000-0000-0000-000000000001', 2)$$,
  '42501', null,
  'User B cannot add a set to User A''s Workout Session'
);

-- User B can still write their own rows
select lives_ok(
  $$insert into public.plans (user_id, goal, place, frequency)
    values ('user_2IsolationB000000000000', 'strength', 'gym', 3)$$,
  'User B can create their own Plan'
);

-- ------------------------------------------------------------
-- No sub claim: nothing is visible
-- ------------------------------------------------------------
set local request.jwt.claims = '{"role":"authenticated"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL without a sub claim');
select is_empty($$select id from public.plans$$, 'a token without sub sees no Plans');

-- ------------------------------------------------------------
-- User A's rows are untouched
-- ------------------------------------------------------------
reset role;

select is(
  (select age from public.profiles where id = 'f1f00000-0000-0000-0000-000000000001'),
  30,
  'User A''s Profile is unchanged'
);
select is(
  (select name from public.plans where id = 'f1a00000-0000-0000-0000-000000000001'),
  null,
  'User A''s Plan is unchanged'
);
select is(
  (select finished_at from public.workout_sessions where id = 'f1500000-0000-0000-0000-000000000001'),
  null,
  'User A''s Workout Session is unchanged'
);
select is(
  (select count(*)::int from public.workouts where plan_id = 'f1a00000-0000-0000-0000-000000000001'),
  1,
  'User A''s Plan still has exactly its one Workout'
);

select * from finish();

rollback;
