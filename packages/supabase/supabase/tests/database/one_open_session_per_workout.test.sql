-- At most one open Workout Session per Workout (issue #52): the partial
-- unique index startWorkoutSession inserts against.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(3);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.plans (id, user_id, goal, place, frequency) values
  ('a0000000-0000-0000-0000-000000000001', 'user_2StartOwner000000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 'Day A', 'Legs');

insert into public.workout_sessions (workout_id, plan_id, user_id, started_at) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'user_2StartOwner000000000000', now());

-- ------------------------------------------------------------
-- Index behaviour
-- ------------------------------------------------------------
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
