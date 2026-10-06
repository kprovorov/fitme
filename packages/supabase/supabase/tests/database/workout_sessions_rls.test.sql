-- workout_sessions RLS: sessions may only reference the caller's own workout
-- and plan (issue #53).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(20);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@rls.test.local'),
  ('22222222-2222-2222-2222-222222222222', 'other@rls.test.local');

insert into public.exercises (id, name, slug) values
  ('e1000000-0000-0000-0000-000000000001', 'Test Squat', 'test-squat-sessions-rls');

-- a1: owner's plan, a2: other user's plan, a3: owner's soft-deleted plan
insert into public.plans (id, user_id, goal, place, frequency, deleted_at) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'strength', 'gym', 3, null),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'strength', 'gym', 3, null),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'strength', 'gym', 3, now());

insert into public.workouts (id, plan_id, "order", name, description) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'Owner A', 'Legs'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 1, 'Other A', 'Legs'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 1, 'Deleted A', 'Legs'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 2, 'Owner B', 'Push');

insert into public.workout_exercises (id, workout_id, exercise_id, "order") values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', 1);

insert into public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
values
  ('c1000000-0000-0000-0000-000000000001', 1, 5, 100, 120);

-- Owner's finished session on the soft-deleted plan
insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at, finished_at) values
  ('d1000000-0000-0000-0000-000000000099', 'b1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', now(), now());

-- ------------------------------------------------------------
-- Inserts as the owner
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at)
    values (
      'd1000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      '11111111-1111-1111-1111-111111111111',
      now()
    )$$,
  'owner can insert a session for their own workout and plan'
);

select lives_ok(
  $$insert into public.workout_sessions (id, workout_id, plan_id, user_id, started_at)
    values (
      'd1000000-0000-0000-0000-000000000002',
      null,
      null,
      '11111111-1111-1111-1111-111111111111',
      now()
    )$$,
  'owner can insert a session with NULL workout_id and plan_id'
);

select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      'b1000000-0000-0000-0000-000000000002',
      null,
      '11111111-1111-1111-1111-111111111111',
      now()
    )$$,
  '42501',
  null,
  'owner cannot insert a session pointing at another user''s workout'
);

select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      null,
      'a1000000-0000-0000-0000-000000000002',
      '11111111-1111-1111-1111-111111111111',
      now()
    )$$,
  '42501',
  null,
  'owner cannot insert a session pointing at another user''s plan'
);

select throws_ok(
  $$insert into public.workout_sessions (workout_id, plan_id, user_id, started_at)
    values (
      null,
      null,
      '22222222-2222-2222-2222-222222222222',
      now()
    )$$,
  '42501',
  null,
  'owner cannot insert a session owned by another user'
);

-- ------------------------------------------------------------
-- Updates as the owner
-- ------------------------------------------------------------
select throws_ok(
  $$update public.workout_sessions
    set workout_id = 'b1000000-0000-0000-0000-000000000002'
    where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'owner cannot repoint their session at another user''s workout'
);

select throws_ok(
  $$update public.workout_sessions
    set plan_id = 'a1000000-0000-0000-0000-000000000002'
    where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'owner cannot repoint their session at another user''s plan'
);

select throws_ok(
  $$update public.workout_sessions
    set user_id = '22222222-2222-2222-2222-222222222222'
    where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'owner cannot hand their session over to another user'
);

select lives_ok(
  $$update public.workout_sessions
    set finished_at = now()
    where id = 'd1000000-0000-0000-0000-000000000001'$$,
  'owner can finish their session with a plain update'
);

select isnt(
  (select finished_at from public.workout_sessions
   where id = 'd1000000-0000-0000-0000-000000000001'),
  null,
  'the plain update changed the row'
);

select lives_ok(
  $$update public.workout_sessions
    set updated_at = now(), finished_at = finished_at + interval '1 minute'
    where id = 'd1000000-0000-0000-0000-000000000099'$$,
  'owner can update a session of their soft-deleted plan'
);

select is(
  (select finished_at > started_at from public.workout_sessions
   where id = 'd1000000-0000-0000-0000-000000000099'),
  true,
  'the soft-deleted plan session row changed'
);

-- ------------------------------------------------------------
-- RPC regression: start/finish still work for the owner
-- ------------------------------------------------------------
select set_config(
  'test.rpc_session',
  public.start_workout_session('b1000000-0000-0000-0000-000000000004')::text,
  true
);

select is(
  (select plan_id from public.workout_sessions
   where id = current_setting('test.rpc_session')::uuid),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'start_workout_session creates a session for the owner'
);

select lives_ok(
  format(
    'select public.finish_workout_session(%L::uuid)',
    current_setting('test.rpc_session')
  ),
  'finish_workout_session succeeds for the owner'
);

select isnt(
  (select finished_at from public.workout_sessions
   where id = current_setting('test.rpc_session')::uuid),
  null,
  'finish_workout_session sets finished_at'
);

-- ------------------------------------------------------------
-- Another user cannot see, update or delete the owner's sessions
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.workout_sessions
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'another user cannot see the owner''s sessions'
);

select is_empty(
  $$update public.workout_sessions
    set finished_at = null
    where id = 'd1000000-0000-0000-0000-000000000001'
    returning id$$,
  'another user''s update affects no rows'
);

select is_empty(
  $$delete from public.workout_sessions
    where id = 'd1000000-0000-0000-0000-000000000001'
    returning id$$,
  'another user''s delete affects no rows'
);

-- Verify as postgres that the owner's session was left untouched
reset role;

select is(
  (select count(*)::int from public.workout_sessions
   where id = 'd1000000-0000-0000-0000-000000000001'
     and finished_at is not null),
  1,
  'the owner''s session still exists and is still finished'
);

select is(
  (select count(*)::int from public.workout_sessions
   where workout_id = 'b1000000-0000-0000-0000-000000000002'
      or plan_id = 'a1000000-0000-0000-0000-000000000002'),
  0,
  'no session references the other user''s workout or plan'
);

select * from finish();

rollback;
