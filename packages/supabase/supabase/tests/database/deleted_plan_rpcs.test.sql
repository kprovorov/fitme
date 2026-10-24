-- Soft-deleted plans are unusable through RPCs and never active (issue #50).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(13);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
-- Owner: one active plan, one live inactive plan, one soft-deleted plan.
-- Other user: one live plan.
insert into public.plans (id, user_id, goal, place, frequency, is_active, deleted_at) values
  ('d5a00000-0000-0000-0000-000000000001', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, true,  null),
  ('d5a00000-0000-0000-0000-000000000002', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, false, null),
  ('d5a00000-0000-0000-0000-000000000003', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, false, now()),
  ('d5a00000-0000-0000-0000-000000000004', 'user_2DeletedPlansOther00000', 'strength', 'gym', 3, false, null);

insert into public.workouts (id, plan_id, "order", name, description) values
  ('d5b00000-0000-0000-0000-000000000002', 'd5a00000-0000-0000-0000-000000000002', 1, 'Live Day', 'Pull'),
  ('d5b00000-0000-0000-0000-000000000003', 'd5a00000-0000-0000-0000-000000000003', 1, 'Deleted Day', 'Pull');

insert into public.workout_exercises (id, workout_id, exercise_slug, "order") values
  ('d5c00000-0000-0000-0000-000000000002', 'd5b00000-0000-0000-0000-000000000002', 'test-deadlift-deleted-plans', 1),
  ('d5c00000-0000-0000-0000-000000000003', 'd5b00000-0000-0000-0000-000000000003', 'test-deadlift-deleted-plans', 1);

-- ------------------------------------------------------------
-- activate_plan
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2DeletedPlansOwner00000","role":"authenticated"}';

select throws_ok(
  $$select public.activate_plan('d5a00000-0000-0000-0000-000000000003')$$,
  'P0001',
  'Not authorized',
  'activate_plan rejects the caller''s own soft-deleted plan'
);

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000001'),
  true,
  'a rejected activation of a deleted plan leaves the currently active plan active'
);

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000003'),
  false,
  'the deleted plan stays inactive after the rejected activation'
);

select throws_ok(
  $$select public.activate_plan('d5a00000-0000-0000-0000-000000000004')$$,
  'P0001',
  'Not authorized',
  'activate_plan still rejects another user''s plan'
);

select is(
  (public.activate_plan('d5a00000-0000-0000-0000-000000000002')).is_active,
  true,
  'activate_plan on the caller''s own live plan returns it active'
);

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000001'),
  false,
  'activating a live plan deactivates the previously active plan'
);

-- ------------------------------------------------------------
-- start_workout_session
-- ------------------------------------------------------------
select throws_ok(
  $$select public.start_workout_session('d5b00000-0000-0000-0000-000000000003')$$,
  'P0001',
  'Workout not found or not authorized',
  'start_workout_session rejects a workout of the caller''s own deleted plan'
);

select is(
  (select count(*)::int from public.workout_sessions
   where workout_id = 'd5b00000-0000-0000-0000-000000000003'),
  0,
  'no session row is created for a workout of a deleted plan'
);

select isnt(
  public.start_workout_session('d5b00000-0000-0000-0000-000000000002'),
  null,
  'start_workout_session on a live plan''s workout returns a session id'
);

-- ------------------------------------------------------------
-- deactivate_deleted_plan trigger (direct writes through RLS)
-- ------------------------------------------------------------

-- Plan 2 is now active; soft delete it with a plain UPDATE
update public.plans
set deleted_at = now()
where id = 'd5a00000-0000-0000-0000-000000000002';

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000002'),
  false,
  'soft deleting an active plan via direct UPDATE deactivates it'
);

update public.plans
set is_active = true
where id = 'd5a00000-0000-0000-0000-000000000003';

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000003'),
  false,
  'a direct UPDATE cannot set a deleted plan active'
);

insert into public.plans (id, user_id, goal, place, frequency, is_active, deleted_at) values
  ('d5a00000-0000-0000-0000-000000000005', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, true, now());

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000005'),
  false,
  'inserting a deleted plan as active stores it inactive'
);

select is(
  (select count(*)::int from public.plans
   where user_id = 'user_2DeletedPlansOwner00000'
     and deleted_at is not null
     and is_active),
  0,
  'the owner has no deleted plan marked active'
);

select * from finish();

rollback;
