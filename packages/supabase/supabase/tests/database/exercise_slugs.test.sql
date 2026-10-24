-- Exercise slugs only (FIT-244, the contract step): no exercises table, no
-- exercise_id, no sync trigger. Workout Exercises and Workout Session
-- Exercises carry any slug string, unchecked (ADR 0010), and the RPCs take and
-- copy slugs only.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(20);

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

-- ------------------------------------------------------------
-- RPCs take and copy slugs only
-- ------------------------------------------------------------
select set_config(
  'test.plan_id',
  public.create_plan(jsonb_build_object(
    'name', 'Slugs', 'goal', 'strength', 'place', 'gym', 'frequency', 3,
    'experience_level', 'intermediate', 'workout_duration', 60,
    'workouts', jsonb_build_array(jsonb_build_object(
      'name', 'Day A', 'description', 'Legs',
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'exercise_slug', 'test-squat-slugs',
          'sets', jsonb_build_array(jsonb_build_object('reps_recommended', 5, 'weight_recommended', 60, 'rest_recommended', 90))
        ),
        jsonb_build_object(
          'exercise_slug', 'test-press-slugs',
          'sets', jsonb_build_array(jsonb_build_object('reps_recommended', 8, 'weight_recommended', 60, 'rest_recommended', 90))
        )
      )
    ))
  ))::text,
  true
);

select is(
  (select string_agg(we.exercise_slug, ', ' order by we."order")
   from public.workout_exercises we
   join public.workouts w on w.id = we.workout_id
   where w.plan_id = current_setting('test.plan_id')::uuid),
  'test-squat-slugs, test-press-slugs',
  'create_plan stores each Exercise''s slug'
);

select throws_ok(
  $$select public.create_plan(jsonb_build_object(
    'name', 'Legacy', 'goal', 'strength', 'place', 'gym', 'frequency', 3,
    'workouts', jsonb_build_array(jsonb_build_object(
      'name', 'Day A', 'description', 'Legs',
      'exercises', jsonb_build_array(jsonb_build_object(
        'exercise_id', 'e5000000-0000-0000-0000-000000000001',
        'sets', '[]'::jsonb
      ))
    ))
  ))$$,
  '23502',
  null,
  'create_plan rejects an Exercise sent as an exercise_id only'
);

select lives_ok(
  format(
    $$select public.update_plan(%L::uuid, jsonb_build_object(
      'name', 'Slugs', 'goal', 'strength', 'place', 'gym', 'frequency', 3,
      'experience_level', 'intermediate', 'workout_duration', 60,
      'workouts', jsonb_build_array(jsonb_build_object(
        'name', 'Day A', 'description', 'Legs',
        'exercises', jsonb_build_array(
          jsonb_build_object('exercise_slug', 'test-press-slugs', 'sets', '[]'::jsonb),
          jsonb_build_object('exercise_slug', 'library-only-slug', 'sets', '[]'::jsonb)
        )
      ))
    ))$$,
    current_setting('test.plan_id')
  ),
  'update_plan takes Exercises by slug'
);

select is(
  (select string_agg(we.exercise_slug, ', ' order by we."order")
   from public.workout_exercises we
   join public.workouts w on w.id = we.workout_id
   where w.plan_id = current_setting('test.plan_id')::uuid),
  'test-press-slugs, library-only-slug',
  'update_plan stores each Exercise''s slug'
);

select throws_ok(
  format(
    $$select public.update_plan(%L::uuid, jsonb_build_object(
      'name', 'Slugs', 'goal', 'strength', 'place', 'gym', 'frequency', 3,
      'workouts', jsonb_build_array(jsonb_build_object(
        'name', 'Day A', 'description', 'Legs',
        'exercises', jsonb_build_array(jsonb_build_object(
          'exercise_id', 'e5000000-0000-0000-0000-000000000001',
          'sets', '[]'::jsonb
        ))
      ))
    ))$$,
    current_setting('test.plan_id')
  ),
  '23502',
  null,
  'update_plan rejects an Exercise sent as an exercise_id only'
);

select set_config(
  'test.session_id',
  public.start_workout_session(
    (select w.id from public.workouts w
     where w.plan_id = current_setting('test.plan_id')::uuid)
  )::text,
  true
);

select is(
  (select string_agg(exercise_slug, ', ' order by "order")
   from public.workout_session_exercises
   where workout_session_id = current_setting('test.session_id')::uuid),
  'test-press-slugs, library-only-slug',
  'start_workout_session copies each slug into the Workout Session'
);

reset role;

-- workout_session_plan_changes: a session Exercise with another slug is a
-- replacement, answered as its slug and a name made from it, and applying it
-- stores the slug
insert into public.workouts (id, plan_id, "order", name, description) values
  ('b5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 3, 'Day C', 'Pull');

insert into public.workout_exercises (id, workout_id, exercise_slug, "order") values
  ('c5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003',
   'barbell-back-squat', 1);

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values ('c5000000-0000-0000-0000-000000000003', 1, 5, 100, 120);

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at, finished_at) values
  ('d5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003',
   'a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', now(), now());

insert into public.workout_session_exercises
  (id, workout_session_id, exercise_slug, "order")
values
  ('f5000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000003',
   'dumbbell--press-', 1);

insert into public.workout_session_exercise_sets
  (workout_session_exercise_id, "order", reps_recommended, weight_recommended,
   rest_recommended, reps_completed, weight_completed)
values ('f5000000-0000-0000-0000-000000000003', 1, 5, 100, 120, 8, 40);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2SlugsOwner000000000000","role":"authenticated"}';

select is(
  public.workout_session_plan_changes('d5000000-0000-0000-0000-000000000003')
    -> 'changes' -> 0,
  jsonb_build_object(
    'kind', 'replace_exercise',
    'exercise', jsonb_build_object('slug', 'dumbbell--press-', 'name', 'Dumbbell press'),
    'replaced_exercise', jsonb_build_object('slug', 'barbell-back-squat', 'name', 'Barbell back squat'),
    'sets', jsonb_build_array(jsonb_build_object('reps', 8, 'weight', 40))
  ),
  'workout_session_plan_changes compares by slug and names Exercises from their slugs'
);

select lives_ok(
  $$select public.workout_session_plan_changes('d5000000-0000-0000-0000-000000000003', true)$$,
  'workout_session_plan_changes applies a replacement'
);

select is(
  (select exercise_slug from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000003'),
  'dumbbell--press-',
  'applying a replacement stores the session Exercise''s slug'
);

reset role;

select is(
  private.exercise_name_from_slug('--'),
  '--',
  'a slug with no words is its own name'
);

select * from finish();

rollback;
