-- The retired-id rules (20261011120000_user_id_text_key.sql): a retired id,
-- deleted or rekeyed away by the Supabase Auth -> Clerk migration (FIT-73),
-- can't read or write data, through RLS or around it. rekey_user, which did
-- the rekeying, was dropped with the migration tooling (FIT-77); production
-- keeps the retired ids it left behind. Deleting a User's data is
-- deleteUserData in packages/services, covered by its integration tests.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(18);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
-- Each User gets a Profile, a Plan with a Workout, exercise and set, a
-- Workout Session with an exercise and set.
create temporary table test_users (n int, user_id text) on commit drop;
insert into test_users values
  (1, 'user_2DeleteMe00000000000000'),
  (2, 'user_2Bystander000000000000'),
  (3, '7a1b2c3d-0000-4000-8000-000000000003');

insert into public.profiles (user_id, gender, age, weight, height)
select user_id, 'female', 25, 60, 165 from test_users;

insert into public.plans (id, user_id, goal, place, frequency)
select ('f3a00000-0000-0000-0000-00000000000' || n)::uuid, user_id, 'strength', 'gym', 3 from test_users;

insert into public.workouts (id, plan_id, "order", name, description)
select ('f3b00000-0000-0000-0000-00000000000' || n)::uuid, ('f3a00000-0000-0000-0000-00000000000' || n)::uuid, 1, 'Day', 'Legs'
from test_users;

insert into public.workout_exercises (id, workout_id, exercise_slug, "order")
select ('f3c00000-0000-0000-0000-00000000000' || n)::uuid, ('f3b00000-0000-0000-0000-00000000000' || n)::uuid,
  'test-lunge-user-data-functions', 1
from test_users;

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
select ('f3c00000-0000-0000-0000-00000000000' || n)::uuid, 1, 8, 40, 90 from test_users;

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at)
select ('f3500000-0000-0000-0000-00000000000' || n)::uuid, ('f3b00000-0000-0000-0000-00000000000' || n)::uuid,
  ('f3a00000-0000-0000-0000-00000000000' || n)::uuid, user_id, now()
from test_users;

insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order")
select ('f3600000-0000-0000-0000-00000000000' || n)::uuid, ('f3500000-0000-0000-0000-00000000000' || n)::uuid,
  'test-lunge-user-data-functions', 1
from test_users;

insert into public.workout_session_exercise_sets (workout_session_exercise_id, "order", reps_completed)
select ('f3600000-0000-0000-0000-00000000000' || n)::uuid, 1, 8 from test_users;

-- Rows of every User-owned table reachable from a User id
create function pg_temp.owned_rows(p_user_id text)
returns int
language sql
as $$
  select (
    (select count(*) from public.profiles where user_id = p_user_id)
    + (select count(*) from public.plans where user_id = p_user_id)
    + (select count(*) from public.workouts w
       join public.plans p on p.id = w.plan_id where p.user_id = p_user_id)
    + (select count(*) from public.workout_exercises we
       join public.workouts w on w.id = we.workout_id
       join public.plans p on p.id = w.plan_id where p.user_id = p_user_id)
    + (select count(*) from public.workout_exercise_sets wes
       join public.workout_exercises we on we.id = wes.workout_exercise_id
       join public.workouts w on w.id = we.workout_id
       join public.plans p on p.id = w.plan_id where p.user_id = p_user_id)
    + (select count(*) from public.workout_sessions where user_id = p_user_id)
    + (select count(*) from public.workout_session_exercises wse
       join public.workout_sessions ws on ws.id = wse.workout_session_id where ws.user_id = p_user_id)
    + (select count(*) from public.workout_session_exercise_sets wses
       join public.workout_session_exercises wse on wse.id = wses.workout_session_exercise_id
       join public.workout_sessions ws on ws.id = wse.workout_session_id where ws.user_id = p_user_id)
  )::int
$$;

select is(pg_temp.owned_rows('user_2DeleteMe00000000000000'), 8, 'User 1 starts with eight owned rows');
select is(pg_temp.owned_rows('user_2Bystander000000000000'), 8, 'User 2 starts with eight owned rows');

-- delete_user_data was dropped: deleteUserData in packages/services
select hasnt_function('public', 'delete_user_data', 'delete_user_data is gone');

-- rekey_user was dropped with the migration tooling
select hasnt_function('public', 'rekey_user', 'rekey_user is gone');

-- ------------------------------------------------------------
-- A deleted User: retired and their root rows removed, as deleteUserData
-- does it (as postgres here)
-- ------------------------------------------------------------
insert into private.retired_user_ids (user_id) values ('user_2DeleteMe00000000000000');
delete from public.workout_sessions where user_id = 'user_2DeleteMe00000000000000';
delete from public.plans where user_id = 'user_2DeleteMe00000000000000';
delete from public.profiles where user_id = 'user_2DeleteMe00000000000000';

-- The deleted User's token is still valid until it expires, but the id is
-- retired: it can't write anything back
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2DeleteMe00000000000000","role":"authenticated"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for a deleted User');

select throws_ok(
  $$insert into public.plans (user_id, goal, place, frequency)
    values ('user_2DeleteMe00000000000000', 'strength', 'gym', 3)$$,
  '42501', null,
  'a deleted User can''t create a Plan with their old token'
);

select throws_ok(
  $$insert into public.profiles (user_id, gender, age, weight, height)
    values ('user_2DeleteMe00000000000000', 'male', 30, 80, 180)$$,
  '42501', null,
  'a deleted User can''t create a Profile with their old token'
);

-- create_plan keys the Plan by current_user_id(), NULL here, so the insert
-- hits plans.user_id NOT NULL
select throws_ok(
  $$select public.create_plan(
      '{"name": "Ghost", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )$$,
  '23502', null,
  'a deleted User can''t create a Plan through the RPC'
);

select throws_ok(
  $$select user_id from private.retired_user_ids$$,
  '42501', null,
  'a signed-in User can''t read the retired ids'
);

-- Writes that bypass RLS are stopped too
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select throws_ok(
  $$insert into public.plans (user_id, goal, place, frequency)
    values ('user_2DeleteMe00000000000000', 'strength', 'gym', 3)$$,
  '42501', 'User id user_2DeleteMe00000000000000 is retired',
  'service_role can''t create a Plan under a deleted User id'
);

select throws_ok(
  $$insert into public.workout_sessions (user_id, started_at)
    values ('user_2DeleteMe00000000000000', now())$$,
  '42501', 'User id user_2DeleteMe00000000000000 is retired',
  'service_role can''t create a Workout Session under a deleted User id'
);

reset role;

-- ------------------------------------------------------------
-- A User rekeyed away: legacy UUID -> Clerk id, as rekey_user left it in
-- production (as postgres here)
-- ------------------------------------------------------------
update public.profiles set user_id = 'user_2Rekeyed0000000000000000'
  where user_id = '7a1b2c3d-0000-4000-8000-000000000003';
update public.plans set user_id = 'user_2Rekeyed0000000000000000'
  where user_id = '7a1b2c3d-0000-4000-8000-000000000003';
update public.workout_sessions set user_id = 'user_2Rekeyed0000000000000000'
  where user_id = '7a1b2c3d-0000-4000-8000-000000000003';
insert into private.retired_user_ids (user_id, rekeyed_to)
  values ('7a1b2c3d-0000-4000-8000-000000000003', 'user_2Rekeyed0000000000000000');

select is(pg_temp.owned_rows('user_2Rekeyed0000000000000000'), 8, 'every row is under the Clerk id');

-- The rekeyed User reaches their data through RLS with the Clerk sub
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2Rekeyed0000000000000000","role":"authenticated"}';

select is(
  (select count(*)::int from public.workout_session_exercise_sets),
  1,
  'the rekeyed User sees their Workout Session sets under the Clerk sub'
);

-- A token for the legacy id reads and writes nothing
set local request.jwt.claims = '{"sub":"7a1b2c3d-0000-4000-8000-000000000003","role":"authenticated"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for a rekeyed-away id');

select is_empty(
  $$select id from public.plans$$,
  'the legacy sub sees nothing'
);

select throws_ok(
  $$insert into public.workout_sessions (user_id, started_at)
    values ('7a1b2c3d-0000-4000-8000-000000000003', now())$$,
  '42501', null,
  'the legacy sub can''t write'
);

-- Writes that bypass RLS are stopped too
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select throws_ok(
  $$insert into public.profiles (user_id, gender, age, weight, height)
    values ('7a1b2c3d-0000-4000-8000-000000000003', 'male', 30, 80, 180)$$,
  '42501', 'User id 7a1b2c3d-0000-4000-8000-000000000003 is retired',
  'service_role can''t write under a rekeyed-away id'
);

reset role;

select is(pg_temp.owned_rows('user_2Bystander000000000000'), 8, 'the other User was left alone');

select * from finish();

rollback;
