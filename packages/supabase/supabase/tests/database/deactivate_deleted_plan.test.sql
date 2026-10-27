-- The deactivate_deleted_plan trigger: a soft-deleted Plan is never active
-- (issue #50), whatever writes it.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(4);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
-- Owner: one active Plan and one soft-deleted Plan.
insert into public.plans (id, user_id, goal, place, frequency, is_active, deleted_at) values
  ('d5a00000-0000-0000-0000-000000000001', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, true,  null),
  ('d5a00000-0000-0000-0000-000000000003', 'user_2DeletedPlansOwner00000', 'strength', 'gym', 3, false, now());

-- ------------------------------------------------------------
-- Direct writes through RLS, as the owner
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_2DeletedPlansOwner00000","role":"authenticated"}';

update public.plans
set deleted_at = now()
where id = 'd5a00000-0000-0000-0000-000000000001';

select is(
  (select is_active from public.plans where id = 'd5a00000-0000-0000-0000-000000000001'),
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
