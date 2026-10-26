-- Exercise slugs only (FIT-244, the contract step): no exercises table, no
-- exercise_id, no sync trigger. Workout Exercises and Workout Session
-- Exercises carry any slug string, unchecked (ADR 0010).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(10);

-- ------------------------------------------------------------
-- What the contract step dropped
-- ------------------------------------------------------------
select hasnt_table('public', 'exercises', 'the exercises table is gone');
select hasnt_column('public', 'workout_exercises', 'exercise_id',
  'workout_exercises.exercise_id is gone');
select hasnt_column('public', 'workout_session_exercises', 'exercise_id',
  'workout_session_exercises.exercise_id is gone');
select hasnt_function('public', 'sync_exercise_slug',
  'the sync trigger''s function is gone');

select col_not_null('public', 'workout_exercises', 'exercise_slug',
  'workout_exercises.exercise_slug is NOT NULL');
select col_not_null('public', 'workout_session_exercises', 'exercise_slug',
  'workout_session_exercises.exercise_slug is NOT NULL');
select col_hasnt_default('public', 'workout_exercises', 'exercise_slug',
  'workout_exercises.exercise_slug has no default');
select col_hasnt_default('public', 'workout_session_exercises', 'exercise_slug',
  'workout_session_exercises.exercise_slug has no default');

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.plans (id, user_id, goal, place, frequency) values
  ('a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 1, 'Day A', 'Legs');

select throws_ok(
  $$insert into public.workout_exercises (workout_id, "order")
    values ('b5000000-0000-0000-0000-000000000001', 1)$$,
  '23502',
  null,
  'a Workout Exercise without a slug is rejected'
);

-- ------------------------------------------------------------
-- Any slug string, written by the app as the User
-- ------------------------------------------------------------
insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  ('d5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2SlugsOwner000000000000","role":"authenticated"}';

insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order") values
  ('f5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
   'any-slug-at-all', 1);

select is(
  (select exercise_slug from public.workout_session_exercises
   where id = 'f5000000-0000-0000-0000-000000000001'),
  'any-slug-at-all',
  'a Workout Session Exercise takes any slug, unchecked'
);

select * from finish();

rollback;
