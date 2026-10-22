-- Exercise slugs beside exercise_id (FIT-235, the expand step): every row
-- carries both, and a write that sends only one gets the other.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(21);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.exercises (id, name, slug) values
  ('e5000000-0000-0000-0000-000000000001', 'Test Squat', 'test-squat-slugs'),
  ('e5000000-0000-0000-0000-000000000002', 'Test Press', 'test-press-slugs');

insert into public.plans (id, user_id, goal, place, frequency) values
  ('a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', 'strength', 'gym', 3);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 1, 'Day A', 'Legs');

-- ------------------------------------------------------------
-- The columns
-- ------------------------------------------------------------
select col_not_null('public', 'workout_exercises', 'exercise_slug',
  'workout_exercises.exercise_slug is NOT NULL');
select col_not_null('public', 'workout_session_exercises', 'exercise_slug',
  'workout_session_exercises.exercise_slug is NOT NULL');

select is(
  (select count(*)::int from public.workout_exercises we
   join public.exercises e on e.id = we.exercise_id
   where we.exercise_slug is distinct from e.slug)
  + (select count(*)::int from public.workout_session_exercises wse
     join public.exercises e on e.id = wse.exercise_id
     where wse.exercise_slug is distinct from e.slug),
  0,
  'every existing row''s slug matches its exercise_id'
);

-- ------------------------------------------------------------
-- workout_exercises: a write with one form gets the other
-- ------------------------------------------------------------
insert into public.workout_exercises (id, workout_id, exercise_id, "order") values
  ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001', 1);

select is(
  (select exercise_slug from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000001'),
  'test-squat-slugs',
  'a Workout Exercise inserted with only exercise_id gets its slug'
);

insert into public.workout_exercises (id, workout_id, exercise_slug, "order") values
  ('c5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000001',
   'test-press-slugs', 2);

select is(
  (select exercise_id from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000002'),
  'e5000000-0000-0000-0000-000000000002'::uuid,
  'a Workout Exercise inserted with only exercise_slug gets its uuid'
);

update public.workout_exercises
set exercise_id = 'e5000000-0000-0000-0000-000000000002'
where id = 'c5000000-0000-0000-0000-000000000001';

select is(
  (select exercise_slug from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000001'),
  'test-press-slugs',
  'updating only exercise_id updates the slug'
);

update public.workout_exercises
set exercise_slug = 'test-squat-slugs'
where id = 'c5000000-0000-0000-0000-000000000002';

select is(
  (select exercise_id from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000002'),
  'e5000000-0000-0000-0000-000000000001'::uuid,
  'updating only exercise_slug updates the uuid'
);

update public.workout_exercises
set "order" = 3
where id = 'c5000000-0000-0000-0000-000000000002';

select is(
  (select exercise_slug || ' ' || exercise_id from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000002'),
  'test-squat-slugs e5000000-0000-0000-0000-000000000001',
  'an update that touches neither keeps both'
);

update public.workout_exercises
set exercise_slug = 'library-only-slug'
where id = 'c5000000-0000-0000-0000-000000000002';

select is(
  (select exercise_slug || ' ' || exercise_id from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000002'),
  'library-only-slug e5000000-0000-0000-0000-000000000001',
  'updating to a slug the exercises table doesn''t know keeps the uuid'
);

select throws_ok(
  $$insert into public.workout_exercises (workout_id, exercise_slug, "order")
    values ('b5000000-0000-0000-0000-000000000001', 'no-such-exercise', 4)$$,
  '23502',
  null,
  'a slug the exercises table doesn''t know is rejected'
);

-- ------------------------------------------------------------
-- workout_session_exercises, written by the app as the User
-- ------------------------------------------------------------
insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at) values
  ('d5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2SlugsOwner000000000000","role":"authenticated"}';

insert into public.workout_session_exercises (id, workout_session_id, exercise_id, "order") values
  ('f5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001', 1);

select is(
  (select exercise_slug from public.workout_session_exercises
   where id = 'f5000000-0000-0000-0000-000000000001'),
  'test-squat-slugs',
  'a Workout Session Exercise inserted with only exercise_id gets its slug'
);

insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order") values
  ('f5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000001',
   'test-press-slugs', 2);

select is(
  (select exercise_id from public.workout_session_exercises
   where id = 'f5000000-0000-0000-0000-000000000002'),
  'e5000000-0000-0000-0000-000000000002'::uuid,
  'a Workout Session Exercise inserted with only exercise_slug gets its uuid'
);

update public.workout_session_exercises
set exercise_id = 'e5000000-0000-0000-0000-000000000002'
where id = 'f5000000-0000-0000-0000-000000000001';

select is(
  (select exercise_slug from public.workout_session_exercises
   where id = 'f5000000-0000-0000-0000-000000000001'),
  'test-press-slugs',
  'replacing a Workout Session Exercise by exercise_id updates the slug'
);

update public.workout_session_exercises
set exercise_slug = 'test-squat-slugs'
where id = 'f5000000-0000-0000-0000-000000000002';

select is(
  (select exercise_id from public.workout_session_exercises
   where id = 'f5000000-0000-0000-0000-000000000002'),
  'e5000000-0000-0000-0000-000000000001'::uuid,
  'replacing a Workout Session Exercise by exercise_slug updates the uuid'
);

-- ------------------------------------------------------------
-- RPCs take an Exercise in either form and copy both columns
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
          'exercise_id', 'e5000000-0000-0000-0000-000000000001',
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
  (select string_agg(we.exercise_slug || ' ' || we.exercise_id, ', ' order by we."order")
   from public.workout_exercises we
   join public.workouts w on w.id = we.workout_id
   where w.plan_id = current_setting('test.plan_id')::uuid),
  'test-squat-slugs e5000000-0000-0000-0000-000000000001, '
    || 'test-press-slugs e5000000-0000-0000-0000-000000000002',
  'create_plan stores both columns from an exercise_id or an exercise_slug'
);

select lives_ok(
  format(
    $$select public.update_plan(%L::uuid, jsonb_build_object(
      'name', 'Slugs', 'goal', 'strength', 'place', 'gym', 'frequency', 3,
    'experience_level', 'intermediate', 'workout_duration', 60,
      'workouts', jsonb_build_array(jsonb_build_object(
        'name', 'Day A', 'description', 'Legs',
        'exercises', jsonb_build_array(
          jsonb_build_object('exercise_slug', 'test-squat-slugs', 'sets', '[]'::jsonb),
          jsonb_build_object(
            'exercise_id', 'e5000000-0000-0000-0000-000000000002',
            'sets', '[]'::jsonb
          )
        )
      ))
    ))$$,
    current_setting('test.plan_id')
  ),
  'update_plan takes Exercises in either form'
);

select is(
  (select string_agg(we.exercise_slug || ' ' || we.exercise_id, ', ' order by we."order")
   from public.workout_exercises we
   join public.workouts w on w.id = we.workout_id
   where w.plan_id = current_setting('test.plan_id')::uuid),
  'test-squat-slugs e5000000-0000-0000-0000-000000000001, '
    || 'test-press-slugs e5000000-0000-0000-0000-000000000002',
  'update_plan stores both columns from an exercise_slug or an exercise_id'
);

reset role;

-- A row whose slug the exercises table doesn't know (a write that sends both
-- keeps both): only a copy of both columns carries it into the session
insert into public.workouts (id, plan_id, "order", name, description) values
  ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 2, 'Day B', 'Push');

insert into public.workout_exercises (workout_id, exercise_id, exercise_slug, "order") values
  ('b5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001',
   'library-only-slug', 1);

select is(
  (select exercise_slug from public.workout_exercises
   where workout_id = 'b5000000-0000-0000-0000-000000000002'),
  'library-only-slug',
  'a write that sends both columns keeps both as sent'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2SlugsOwner000000000000","role":"authenticated"}';

select set_config(
  'test.session_id',
  public.start_workout_session('b5000000-0000-0000-0000-000000000002')::text,
  true
);

select is(
  (select exercise_slug || ' ' || exercise_id from public.workout_session_exercises
   where workout_session_id = current_setting('test.session_id')::uuid),
  'library-only-slug e5000000-0000-0000-0000-000000000001',
  'start_workout_session copies both columns into the Workout Session'
);

reset role;

-- workout_session_plan_changes: a session Exercise whose slug differs is a
-- replacement even with the same exercise_id, and applying it stores the slug
-- (the trigger then resolves its uuid)
insert into public.workouts (id, plan_id, "order", name, description) values
  ('b5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 3, 'Day C', 'Pull');

insert into public.workout_exercises (id, workout_id, exercise_id, "order") values
  ('c5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003',
   'e5000000-0000-0000-0000-000000000001', 1);

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values ('c5000000-0000-0000-0000-000000000003', 1, 5, 100, 120);

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at, finished_at) values
  ('d5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000003',
   'a5000000-0000-0000-0000-000000000001', 'user_2SlugsOwner000000000000', now(), now());

insert into public.workout_session_exercises
  (id, workout_session_id, exercise_id, exercise_slug, "order")
values
  ('f5000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000003',
   'e5000000-0000-0000-0000-000000000001', 'test-press-slugs', 1);

insert into public.workout_session_exercise_sets
  (workout_session_exercise_id, "order", reps_recommended, weight_recommended,
   rest_recommended, reps_completed, weight_completed)
values ('f5000000-0000-0000-0000-000000000003', 1, 5, 100, 120, 8, 40);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2SlugsOwner000000000000","role":"authenticated"}';

select is(
  public.workout_session_plan_changes('d5000000-0000-0000-0000-000000000003', true)
    -> 'changes' -> 0 ->> 'kind',
  'replace_exercise',
  'workout_session_plan_changes compares Exercises by slug'
);

select is(
  (select exercise_slug || ' ' || exercise_id from public.workout_exercises
   where id = 'c5000000-0000-0000-0000-000000000003'),
  'test-press-slugs e5000000-0000-0000-0000-000000000002',
  'applying a replacement stores the session Exercise''s slug and its uuid'
);

reset role;

select * from finish();

rollback;
