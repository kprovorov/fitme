-- rekey_user (20261011120000_user_id_text_key.sql) and the retired-id rules:
-- rekey_user moves one User's rows across every User-owned table and leaves
-- other Users alone, only the service role can execute it, and a retired id
-- (deleted or rekeyed away) can't write data back. Deleting a User's data is
-- deleteUserData in packages/services, covered by its integration tests.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(37);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
-- Each User gets a Profile, a Plan with a Workout, exercise and set, a
-- Workout Session with an exercise and set, and a conversation with a message.
insert into public.exercises (id, name, slug) values
  ('f3e00000-0000-0000-0000-000000000001', 'Test Lunge', 'test-lunge-user-data-functions');

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

insert into public.workout_exercises (id, workout_id, exercise_id, "order")
select ('f3c00000-0000-0000-0000-00000000000' || n)::uuid, ('f3b00000-0000-0000-0000-00000000000' || n)::uuid,
  'f3e00000-0000-0000-0000-000000000001', 1
from test_users;

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
select ('f3c00000-0000-0000-0000-00000000000' || n)::uuid, 1, 8, 40, 90 from test_users;

insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at)
select ('f3500000-0000-0000-0000-00000000000' || n)::uuid, ('f3b00000-0000-0000-0000-00000000000' || n)::uuid,
  ('f3a00000-0000-0000-0000-00000000000' || n)::uuid, user_id, now()
from test_users;

insert into public.workout_session_exercises (id, workout_session_id, exercise_id, "order")
select ('f3600000-0000-0000-0000-00000000000' || n)::uuid, ('f3500000-0000-0000-0000-00000000000' || n)::uuid,
  'f3e00000-0000-0000-0000-000000000001', 1
from test_users;

insert into public.workout_session_exercise_sets (workout_session_exercise_id, "order", reps_completed)
select ('f3600000-0000-0000-0000-00000000000' || n)::uuid, 1, 8 from test_users;

insert into public.conversations (id, user_id)
select ('f3800000-0000-0000-0000-00000000000' || n)::uuid, user_id from test_users;

insert into public.messages (conversation_id, role, content)
select ('f3800000-0000-0000-0000-00000000000' || n)::uuid, 'user', 'hello' from test_users;

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
    + (select count(*) from public.conversations where user_id = p_user_id)
    + (select count(*) from public.messages m
       join public.conversations c on c.id = m.conversation_id where c.user_id = p_user_id)
  )::int
$$;

select is(pg_temp.owned_rows('user_2DeleteMe00000000000000'), 10, 'User 1 starts with ten owned rows');
select is(pg_temp.owned_rows('user_2Bystander000000000000'), 10, 'User 2 starts with ten owned rows');

-- ------------------------------------------------------------
-- Grants: service_role only
-- ------------------------------------------------------------
select hasnt_function('public', 'delete_user_data', 'delete_user_data is gone');
select ok(
  not has_function_privilege('anon', 'public.rekey_user(text, text)', 'EXECUTE'),
  'anon has no EXECUTE on rekey_user'
);
select ok(
  not has_function_privilege('authenticated', 'public.rekey_user(text, text)', 'EXECUTE'),
  'authenticated has no EXECUTE on rekey_user'
);
select ok(
  has_function_privilege('service_role', 'public.rekey_user(text, text)', 'EXECUTE'),
  'service_role has EXECUTE on rekey_user'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2DeleteMe00000000000000","role":"authenticated"}';

select throws_ok(
  $$select public.rekey_user('user_2Bystander000000000000', 'user_2DeleteMe00000000000000')$$,
  '42501', 'permission denied for function rekey_user',
  'a signed-in User cannot execute rekey_user'
);

reset role;

select is(pg_temp.owned_rows('user_2DeleteMe00000000000000'), 10, 'the rejected call changed nothing');

-- ------------------------------------------------------------
-- A deleted User: retired and their root rows removed, as deleteUserData
-- does it (as postgres here)
-- ------------------------------------------------------------
insert into private.retired_user_ids (user_id) values ('user_2DeleteMe00000000000000');
delete from public.workout_sessions where user_id = 'user_2DeleteMe00000000000000';
delete from public.plans where user_id = 'user_2DeleteMe00000000000000';
delete from public.conversations where user_id = 'user_2DeleteMe00000000000000';
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
  $$insert into public.conversations (user_id) values ('user_2DeleteMe00000000000000')$$,
  '42501', 'User id user_2DeleteMe00000000000000 is retired',
  'service_role can''t write under a deleted User id'
);

select throws_ok(
  $$select public.rekey_user('user_2DeleteMe00000000000000', 'user_2Resurrected00000000000')$$,
  '23505', 'User user_2DeleteMe00000000000000 is already retired',
  'a deleted User id can''t be rekeyed'
);

reset role;

-- ------------------------------------------------------------
-- rekey_user as service_role: legacy UUID -> Clerk id
-- ------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$select public.rekey_user('7a1b2c3d-0000-4000-8000-000000000003', 'user_2Rekeyed0000000000000000')$$,
  'service_role can rekey a User'
);

reset role;

select is(pg_temp.owned_rows('7a1b2c3d-0000-4000-8000-000000000003'), 0, 'nothing is left under the old id');
select is(pg_temp.owned_rows('user_2Rekeyed0000000000000000'), 10, 'every row moved to the new id');
select is(pg_temp.owned_rows('user_2Bystander000000000000'), 10, 'rekeying left the other User alone');

-- The rekeyed User reaches their data through RLS with the new sub
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2Rekeyed0000000000000000","role":"authenticated"}';

select is(
  (select count(*)::int from public.workout_session_exercise_sets),
  1,
  'the rekeyed User sees their Workout Session sets under the new sub'
);

-- The legacy token can't write rows the rekey would leave behind
set local request.jwt.claims = '{"sub":"7a1b2c3d-0000-4000-8000-000000000003","role":"authenticated"}';

select is_empty(
  $$select id from public.plans$$,
  'the legacy sub sees nothing after the rekey'
);

select throws_ok(
  $$insert into public.conversations (user_id) values ('7a1b2c3d-0000-4000-8000-000000000003')$$,
  '42501', null,
  'the legacy sub can''t write after the rekey'
);

reset role;

-- Rerunning is a no-op
set local role service_role;

select lives_ok(
  $$select public.rekey_user('7a1b2c3d-0000-4000-8000-000000000003', 'user_2Rekeyed0000000000000000')$$,
  'rerunning rekey_user is harmless'
);

select throws_ok(
  $$select public.rekey_user('7a1b2c3d-0000-4000-8000-000000000003', 'user_2SomeoneElse00000000000')$$,
  '23505', 'User 7a1b2c3d-0000-4000-8000-000000000003 is already retired',
  'a retry can''t point a rekeyed id at a different destination'
);

select throws_ok(
  $$select public.rekey_user('user_2Rekeyed0000000000000000', 'user_2Bystander000000000000')$$,
  '23505', 'User user_2Bystander000000000000 already owns data',
  'rekeying onto a User who already owns data fails'
);

reset role;

-- Not only the Profile unique key: the guard covers every User-owned table
delete from public.profiles where user_id = 'user_2Bystander000000000000';

set local role service_role;

select throws_ok(
  $$select public.rekey_user('user_2Rekeyed0000000000000000', 'user_2Bystander000000000000')$$,
  '23505', 'User user_2Bystander000000000000 already owns data',
  'rekeying onto a User who owns data but no Profile fails'
);

reset role;

-- A failure on the last table (conversations) undoes the tables already moved
create function pg_temp.fail_rekey() returns trigger language plpgsql as $$
begin
  raise exception 'forced rekey failure';
end;
$$;

create trigger fail_rekey before update on public.conversations
  for each row execute function pg_temp.fail_rekey();

set local role service_role;

select throws_ok(
  $$select public.rekey_user('user_2Rekeyed0000000000000000', 'user_2RekeyedAgain00000000000')$$,
  'P0001', 'forced rekey failure',
  'rekey_user fails when the last table can''t be updated'
);

reset role;

drop trigger fail_rekey on public.conversations;

select is(
  pg_temp.owned_rows('user_2Rekeyed0000000000000000'),
  10,
  'a failed rekey leaves every row under the old id'
);

select is(
  pg_temp.owned_rows('user_2RekeyedAgain00000000000'),
  0,
  'a failed rekey moves no rows at all'
);

-- Rekeying back to the legacy id (a rollback) makes it usable again
set local role service_role;

select lives_ok(
  $$select public.rekey_user('user_2Rekeyed0000000000000000', '7a1b2c3d-0000-4000-8000-000000000003')$$,
  'service_role can rekey a User back to the legacy id'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"7a1b2c3d-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.plans),
  1,
  'the legacy sub sees its Plan again after the rollback'
);

reset role;

-- A destination that owns rows is refused even when the source owns nothing
set local role service_role;

select throws_ok(
  $$select public.rekey_user('legacy-empty-source', '7a1b2c3d-0000-4000-8000-000000000003')$$,
  '23505', 'User 7a1b2c3d-0000-4000-8000-000000000003 already owns data',
  'rekey_user refuses an occupied destination when the source is empty'
);

reset role;

-- A -> B -> C: retrying A -> B leaves B -> C alone
insert into public.profiles (user_id, gender, age, weight, height) values
  ('legacy-chain-a', 'female', 25, 60, 165);

set local role service_role;

select lives_ok(
  $$select public.rekey_user('legacy-chain-a', 'user_2ChainB0000000000000000');
    select public.rekey_user('user_2ChainB0000000000000000', 'user_2ChainC0000000000000000');
    select public.rekey_user('legacy-chain-a', 'user_2ChainB0000000000000000')$$,
  'rekeying A -> B, B -> C, then retrying A -> B succeeds'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2ChainB0000000000000000","role":"authenticated"}';

select is(public.current_user_id(), null, 'the retry left B retired');

reset role;

-- An unrelated User can't be rekeyed onto B, which is retired and points at C
insert into public.profiles (user_id, gender, age, weight, height) values
  ('legacy-chain-d', 'female', 25, 60, 165);

set local role service_role;

select throws_ok(
  $$select public.rekey_user('legacy-chain-d', 'user_2ChainB0000000000000000')$$,
  '23505', 'User user_2ChainB0000000000000000 is already retired',
  'a User can''t be rekeyed onto another User''s retired id'
);

select throws_ok(
  $$select public.rekey_user('legacy-chain-d', 'user_2DeleteMe00000000000000')$$,
  '23505', 'User user_2DeleteMe00000000000000 is already retired',
  'a User can''t be rekeyed onto a deleted id'
);

reset role;

select * from finish();

rollback;
