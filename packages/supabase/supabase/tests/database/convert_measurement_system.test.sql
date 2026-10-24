-- convert_measurement_system: converts every Workout Session set of the
-- caller, whether its Workout still exists or not (FIT-267), and nobody
-- else's. Run with `pnpm db test:db` (supabase test db).
begin;

select plan(7);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.profiles (user_id, age, gender, height, weight, measurement_system) values
  ('user_2ConvertOwner0000000000', 30, 'male', 180, 100, 'metric'),
  ('user_2ConvertOther0000000000', 30, 'male', 180, 100, 'metric');

insert into public.plans (id, user_id, goal, place, frequency) values
  ('a1000000-0000-0000-0000-000000000001', 'user_2ConvertOwner0000000000', 'strength', 'gym', 3),
  ('a1000000-0000-0000-0000-000000000002', 'user_2ConvertOther0000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'Day A', 'Pull');

-- Linked: its Workout exists. Detached: its Plan's Workouts were replaced.
-- Other: another User's detached session.
insert into public.workout_sessions (id, user_id, plan_id, workout_id, started_at, finished_at) values
  ('d1000000-0000-0000-0000-000000000001', 'user_2ConvertOwner0000000000',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   '2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z'),
  ('d1000000-0000-0000-0000-000000000002', 'user_2ConvertOwner0000000000',
   'a1000000-0000-0000-0000-000000000001', null,
   '2026-09-01T00:00:00Z', '2026-09-01T01:00:00Z'),
  ('d1000000-0000-0000-0000-000000000003', 'user_2ConvertOther0000000000',
   'a1000000-0000-0000-0000-000000000002', null,
   '2026-09-01T00:00:00Z', '2026-09-01T01:00:00Z');

insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order") values
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'test-row-convert-system', 1),
  ('c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'test-row-convert-system', 1),
  ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'test-row-convert-system', 1);

insert into public.workout_session_exercise_sets
  (id, workout_session_exercise_id, "order", weight_recommended, weight_completed)
values
  ('f1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 1, 60, 57.5),
  ('f1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 1, 60, 57.5),
  ('f1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 2, 62.5, null),
  ('f1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 1, 60, 57.5);

-- ------------------------------------------------------------
-- The owner switches to US units
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2ConvertOwner0000000000","role":"authenticated"}';

select lives_ok(
  $$select public.convert_measurement_system('us')$$,
  'convert_measurement_system succeeds for the owner'
);

reset role;

select is(
  (select row(weight_recommended, weight_completed)::text
   from public.workout_session_exercise_sets
   where id = 'f1000000-0000-0000-0000-000000000001'),
  '(132.28,126.77)',
  'a set of a session whose Workout exists is converted'
);

select is(
  (select row(weight_recommended, weight_completed)::text
   from public.workout_session_exercise_sets
   where id = 'f1000000-0000-0000-0000-000000000002'),
  '(132.28,126.77)',
  'a set of a session whose Workout is gone is converted'
);

select is(
  (select row(weight_recommended, weight_completed)::text
   from public.workout_session_exercise_sets
   where id = 'f1000000-0000-0000-0000-000000000003'),
  '(137.79,)',
  'an unlogged set of a detached session keeps its NULL completed weight'
);

select is(
  (select row(weight_recommended, weight_completed)::text
   from public.workout_session_exercise_sets
   where id = 'f1000000-0000-0000-0000-000000000004'),
  '(60.00,57.50)',
  'another User''s detached session is left alone'
);

select is(
  (select measurement_system from public.profiles
   where user_id = 'user_2ConvertOther0000000000'),
  'metric',
  'another User''s Profile is left alone'
);

-- ------------------------------------------------------------
-- Converting back restores the detached session's values
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2ConvertOwner0000000000","role":"authenticated"}';

select public.convert_measurement_system('metric');

reset role;

select is(
  (select row(weight_recommended, weight_completed)::text
   from public.workout_session_exercise_sets
   where id = 'f1000000-0000-0000-0000-000000000002'),
  '(60.00,57.50)',
  'converting back to metric restores the detached session''s weights'
);

select * from finish();
rollback;
