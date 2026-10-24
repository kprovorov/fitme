-- Every RPC checks ownership against the current User id from the sub claim
-- (20261011120000_user_id_text_key.sql): a caller can't act on a Plan,
-- Workout or Workout Session owned by another User.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(22);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS): User A owns everything
-- ------------------------------------------------------------
insert into public.profiles (user_id, gender, age, weight, height, measurement_system) values
  ('user_2RpcOwnerA0000000000000', 'male', 30, 100, 200, 'metric'),
  ('user_2RpcIntruderB0000000000', 'male', 30, 100, 200, 'metric');

insert into public.plans (id, user_id, goal, place, frequency, is_active) values
  ('f2a00000-0000-0000-0000-000000000001', 'user_2RpcOwnerA0000000000000', 'strength', 'gym', 3, true),
  ('f2a00000-0000-0000-0000-000000000002', 'user_2RpcOwnerA0000000000000', 'strength', 'gym', 3, false);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('f2b00000-0000-0000-0000-000000000001', 'f2a00000-0000-0000-0000-000000000001', 1, 'A Day', 'Pull');

insert into public.workout_exercises (id, workout_id, exercise_slug, "order") values
  ('f2c00000-0000-0000-0000-000000000001', 'f2b00000-0000-0000-0000-000000000001', 'test-row-rpc-ownership', 1);

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values
  ('f2c00000-0000-0000-0000-000000000001', 1, 5, 100, 120);

-- A second workout of User A whose open session belongs to another id, as
-- after a rekey that committed while start_workout_session was running
insert into public.workouts (id, plan_id, "order", name, description) values
  ('f2b00000-0000-0000-0000-000000000002', 'f2a00000-0000-0000-0000-000000000001', 2, 'A Day 2', 'Push');

insert into public.workout_sessions (workout_id, plan_id, user_id, started_at) values
  ('f2b00000-0000-0000-0000-000000000002', 'f2a00000-0000-0000-0000-000000000001', 'user_2RpcElsewhere000000000', now());

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  ('f2500000-0000-0000-0000-000000000001', null,
   'f2a00000-0000-0000-0000-000000000001', 'user_2RpcOwnerA0000000000000', now());

-- ------------------------------------------------------------
-- User B against User A's data
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2RpcIntruderB0000000000","role":"authenticated"}';

select throws_ok(
  $$select public.activate_plan('f2a00000-0000-0000-0000-000000000002')$$,
  'P0001', 'Not authorized',
  'activate_plan rejects another User''s Plan'
);

select throws_ok(
  $$select public.update_plan(
      'f2a00000-0000-0000-0000-000000000001',
      '{"name": "Hijacked", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )$$,
  'P0001', 'Plan not found or access denied',
  'update_plan rejects another User''s Plan'
);

select throws_ok(
  $$select public.update_plan(
      'f2a00000-0000-0000-0000-000000000001',
      '{"name": "Hijacked", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb,
      'user_2RpcOwnerA0000000000000'
    )$$,
  '42501', 'Plan not found or access denied',
  'update_plan rejects another User''s id'
);

select throws_ok(
  $$select public.start_workout_session('f2b00000-0000-0000-0000-000000000001')$$,
  'P0001', 'Workout not found or not authorized',
  'start_workout_session rejects another User''s Workout'
);

select throws_ok(
  $$select public.finish_workout_session('f2500000-0000-0000-0000-000000000001')$$,
  'P0001', 'Session not found or not authorized',
  'finish_workout_session rejects another User''s Workout Session'
);

-- convert_measurement_system only touches the caller's own rows
select lives_ok(
  $$select public.convert_measurement_system('us')$$,
  'convert_measurement_system succeeds for User B'
);

-- create_plan creates the Plan for the caller and activates it
select lives_ok(
  $$select public.create_plan(
      '{"name": "B created", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )$$,
  'create_plan succeeds for User B'
);

reset role;

select is(
  (select user_id from public.plans where name = 'B created'),
  'user_2RpcIntruderB0000000000',
  'create_plan keys the Plan by the caller''s sub'
);

select is(
  (select is_active from public.plans where name = 'B created'),
  true,
  'create_plan activates the caller''s new Plan'
);

select is(
  (select is_active from public.plans where id = 'f2a00000-0000-0000-0000-000000000001'),
  true,
  'User A''s active Plan stayed active'
);

select is(
  (select count(*)::int from public.workout_sessions
   where workout_id = 'f2b00000-0000-0000-0000-000000000001'),
  0,
  'no Workout Session was started on User A''s Workout'
);

select is(
  (select finished_at from public.workout_sessions where id = 'f2500000-0000-0000-0000-000000000001'),
  null,
  'User A''s Workout Session is still open'
);

select is(
  (select measurement_system || ':' || weight from public.profiles
   where user_id = 'user_2RpcOwnerA0000000000000'),
  'metric:100.00',
  'User A''s Profile was not converted'
);

select is(
  (select weight_recommended from public.workout_exercise_sets
   where workout_exercise_id = 'f2c00000-0000-0000-0000-000000000001'),
  100.00,
  'User A''s set weights were not converted'
);

select is(
  (select measurement_system from public.profiles
   where user_id = 'user_2RpcIntruderB0000000000'),
  'us',
  'User B''s Profile was converted'
);

-- ------------------------------------------------------------
-- User A: the RPCs work for the owner, one open session per Workout
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2RpcOwnerA0000000000000","role":"authenticated"}';

select lives_ok(
  $$select public.activate_plan('f2a00000-0000-0000-0000-000000000002')$$,
  'activate_plan succeeds for the owner'
);

select is(
  (select array_agg(id::text order by id) from public.plans where is_active),
  array['f2a00000-0000-0000-0000-000000000002'],
  'only the activated Plan is active for the owner'
);

select set_config(
  'test.first_session',
  public.start_workout_session('f2b00000-0000-0000-0000-000000000001')::text,
  true
);

select is(
  public.start_workout_session('f2b00000-0000-0000-0000-000000000001')::text,
  current_setting('test.first_session'),
  'starting the same Workout again resumes the open Workout Session'
);

select is(
  (select user_id from public.workout_sessions
   where id = current_setting('test.first_session')::uuid),
  'user_2RpcOwnerA0000000000000',
  'start_workout_session keys the Workout Session by the caller''s sub'
);

select throws_ok(
  $$select public.start_workout_session('f2b00000-0000-0000-0000-000000000002')$$,
  'P0001', 'Workout not found or not authorized',
  'start_workout_session doesn''t resume an open session owned by another id'
);

select lives_ok(
  $$select public.finish_workout_session('f2500000-0000-0000-0000-000000000001')$$,
  'finish_workout_session succeeds for the owner'
);

select lives_ok(
  $$select public.update_plan(
      'f2a00000-0000-0000-0000-000000000002',
      '{"name": "A renamed", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )$$,
  'update_plan succeeds for the owner'
);

select * from finish();

rollback;
