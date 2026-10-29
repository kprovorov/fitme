-- At most one open Workout Session per User (ADR 0013, FIT-380): the partial
-- unique index startWorkoutSession inserts against, and the cleanup of
-- 20261029120000_one_open_session_per_user.sql run over seeded duplicates.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(15);

select has_index('public', 'workout_sessions', 'workout_sessions_one_open_per_user_idx',
  array['user_id'], 'workout_sessions has the one-open-per-User index');
select hasnt_index('public', 'workout_sessions', 'workout_sessions_one_open_per_workout_idx',
  'the one-open-per-Workout index is gone');

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.plans (id, user_id, goal, place, frequency) values
  ('a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', 'strength', 'gym', 3),
  ('a8000000-0000-0000-0000-000000000002', 'user_2OneOpenOther0000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 1, 'Day A', 'Legs'),
  ('b8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000001', 2, 'Day B', 'Push'),
  ('b8000000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-000000000001', 3, 'Day C', 'Pull'),
  ('b8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000002', 1, 'Day A', 'Legs');

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  ('c8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001',
   'a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', now());

-- ------------------------------------------------------------
-- Index behaviour
-- ------------------------------------------------------------
select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      'b8000000-0000-0000-0000-000000000002',
      'a8000000-0000-0000-0000-000000000001',
      'user_2OneOpenOwner0000000000',
      now()
    )$$,
  '23505',
  null,
  'a second open session of the User, for another Workout, violates the unique index'
);

select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (null, 'a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', now())$$,
  '23505',
  null,
  'an open session whose Workout is gone counts too'
);

select lives_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      'b8000000-0000-0000-0000-000000000004',
      'a8000000-0000-0000-0000-000000000002',
      'user_2OneOpenOther0000000000',
      now()
    )$$,
  'another User''s open session does not collide'
);

select lives_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at, finished_at)
    values (
      'b8000000-0000-0000-0000-000000000002',
      'a8000000-0000-0000-0000-000000000001',
      'user_2OneOpenOwner0000000000',
      now(),
      now()
    )$$,
  'finished sessions of the User are unrestricted'
);

-- ------------------------------------------------------------
-- The cleanup, over duplicates seeded with the index dropped (rolled back)
-- ------------------------------------------------------------
drop index public.workout_sessions_one_open_per_user_idx;

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  -- Older, nothing logged: deleted
  ('c8000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000002',
   'a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', now() - interval '2 days'),
  -- Older, a set logged: closed
  ('c8000000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000003',
   'a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', now() - interval '3 days'),
  -- Older, its Workout gone, nothing logged: deleted
  ('c8000000-0000-0000-0000-000000000004', null,
   'a8000000-0000-0000-0000-000000000001', 'user_2OneOpenOwner0000000000', now() - interval '4 days');

insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order") values
  ('d8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000002', 'bench-press', 1),
  ('d8000000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-000000000003', 'barbell-row', 1);

insert into public.workout_session_exercise_sets
  (workout_session_exercise_id, "order", reps_recommended, weight_recommended, reps_completed, weight_completed, logged_at)
values
  ('d8000000-0000-0000-0000-000000000002', 1, 8, 60, null, null, null),
  ('d8000000-0000-0000-0000-000000000003', 1, 8, 50, 8, 50, now());

select private.close_extra_open_workout_sessions();

select results_eq(
  $$select id from public.workout_sessions
    where user_id = 'user_2OneOpenOwner0000000000' and finished_at is null$$,
  $$values ('c8000000-0000-0000-0000-000000000001'::uuid)$$,
  'only the most recently started open session stays open'
);

select is_empty(
  $$select 1 from public.workout_sessions where id in (
    'c8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000004')$$,
  'the older open sessions with nothing logged are deleted'
);

select is_empty(
  $$select 1 from public.workout_session_exercises
    where id = 'd8000000-0000-0000-0000-000000000002'$$,
  'their Exercises go with them'
);

select isnt(
  (select finished_at from public.workout_sessions where id = 'c8000000-0000-0000-0000-000000000003'),
  null,
  'the older open session with a logged set is closed'
);

select is(
  (select count(*)::int from public.workout_session_exercise_sets wses
    join public.workout_session_exercises wse on wse.id = wses.workout_session_exercise_id
    where wse.workout_session_id = 'c8000000-0000-0000-0000-000000000003'
      and wses.logged_at is not null),
  1,
  'its logged set stays in History'
);

select results_eq(
  $$select id from public.workouts
    where plan_id = 'a8000000-0000-0000-0000-000000000001' order by "order"$$,
  $$values
    ('b8000000-0000-0000-0000-000000000001'::uuid),
    ('b8000000-0000-0000-0000-000000000002'::uuid),
    ('b8000000-0000-0000-0000-000000000003'::uuid)$$,
  'no Workout is rotated'
);

select is(
  (select plan_changes_applied_at from public.workout_sessions
    where id = 'c8000000-0000-0000-0000-000000000003'),
  null,
  'no Plan Update is applied to the closed session'
);

select results_eq(
  $$select count(*)::int from public.workout_sessions
    where user_id = 'user_2OneOpenOther0000000000' and finished_at is null$$,
  $$values (1)$$,
  'another User''s single open session is left alone'
);

select is(
  array(
    select r
    from unnest(array['public', 'anon', 'authenticated', 'service_role']) r
    where has_function_privilege(
      r, 'private.close_extra_open_workout_sessions()', 'execute')
  ),
  array[]::text[],
  'nobody but its owner may run the cleanup'
);

select * from finish();

rollback;
