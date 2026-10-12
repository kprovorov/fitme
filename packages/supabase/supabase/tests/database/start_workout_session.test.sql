-- start_workout_session: at most one open session per workout (issue #52).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(13);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.exercises (id, name, slug) values
  ('e0000000-0000-0000-0000-000000000001', 'Test Squat', 'test-squat-start-session'),
  ('e0000000-0000-0000-0000-000000000002', 'Test Press', 'test-press-start-session');

insert into public.plans (id, user_id, goal, place, frequency) values
  ('a0000000-0000-0000-0000-000000000001', 'user_2StartOwner000000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 'Day A', 'Legs'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2, 'Day B', 'Push');

insert into public.workout_exercises (id, workout_id, exercise_id, "order") values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 2);

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values
  ('c0000000-0000-0000-0000-000000000001', 1, 5, 100, 120),
  ('c0000000-0000-0000-0000-000000000001', 2, 5, 100, 120),
  ('c0000000-0000-0000-0000-000000000002', 1, 8, 60, 90);

-- ------------------------------------------------------------
-- Owner starts the same workout twice
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2StartOwner000000000000","role":"authenticated"}';

select set_config(
  'test.first_session',
  public.start_workout_session('b0000000-0000-0000-0000-000000000001')::text,
  true
);
select set_config(
  'test.second_session',
  public.start_workout_session('b0000000-0000-0000-0000-000000000001')::text,
  true
);

select is(
  current_setting('test.second_session'),
  current_setting('test.first_session'),
  'starting a workout with an open session returns the existing session id'
);

select is(
  (select count(*)::int from public.workout_sessions
   where workout_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'only one session row exists after two starts'
);

select is(
  (select count(*)::int from public.workout_session_exercises
   where workout_session_id = current_setting('test.first_session')::uuid),
  2,
  'exercises are cloned once'
);

select is(
  (select count(*)::int
   from public.workout_session_exercise_sets s
   join public.workout_session_exercises e on e.id = s.workout_session_exercise_id
   where e.workout_session_id = current_setting('test.first_session')::uuid),
  3,
  'sets are cloned once'
);

-- ------------------------------------------------------------
-- After finishing, a new start creates a fresh session
-- ------------------------------------------------------------
select lives_ok(
  format(
    'select public.finish_workout_session(%L::uuid)',
    current_setting('test.first_session')
  ),
  'finish_workout_session closes the open session'
);

select set_config(
  'test.third_session',
  public.start_workout_session('b0000000-0000-0000-0000-000000000001')::text,
  true
);

select isnt(
  current_setting('test.third_session'),
  current_setting('test.first_session'),
  'starting after finishing returns a new session id'
);

select is(
  (select count(*)::int from public.workout_sessions
   where workout_id = 'b0000000-0000-0000-0000-000000000001'
     and finished_at is null),
  1,
  'exactly one open session exists for the workout'
);

select is(
  (select count(*)::int from public.workout_session_exercises
   where workout_session_id = current_setting('test.third_session')::uuid),
  2,
  'the new session gets its own cloned exercises'
);

-- Closing via a plain UPDATE also frees the slot
update public.workout_sessions
set finished_at = now()
where id = current_setting('test.third_session')::uuid;

select isnt(
  public.start_workout_session('b0000000-0000-0000-0000-000000000001')::text,
  current_setting('test.third_session'),
  'starting after a manual finish returns a new session id'
);

-- ------------------------------------------------------------
-- Unauthorized caller
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2StartIntruder000000000","role":"authenticated"}';

select throws_ok(
  $$select public.start_workout_session('b0000000-0000-0000-0000-000000000002')$$,
  'P0001',
  'Workout not found or not authorized',
  'a user who does not own the workout cannot start it'
);

-- ------------------------------------------------------------
-- Index behaviour (as postgres)
-- ------------------------------------------------------------
reset role;

select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      'b0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'user_2StartOwner000000000000',
      now()
    )$$,
  '23505',
  null,
  'a second open session for the same workout violates the unique index'
);

select lives_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values
      (null, 'a0000000-0000-0000-0000-000000000001', 'user_2StartOwner000000000000', now()),
      (null, 'a0000000-0000-0000-0000-000000000001', 'user_2StartOwner000000000000', now())$$,
  'open sessions with a NULL workout_id (deleted workout) do not collide'
);

select lives_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at, finished_at)
    values (
      'b0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'user_2StartOwner000000000000',
      now(),
      now()
    )$$,
  'finished sessions for the same workout are unrestricted'
);

select * from finish();

rollback;
