-- current_user_id() (20261013120000_current_user_id_requires_authenticated_role.sql):
-- the caller's User id is the sub claim of an authenticated token only.
-- Supabase trusts every token Clerk signs, including role-less OAuth access
-- tokens given to third parties; those must not resolve to a User.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(9);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
insert into public.plans (id, user_id, goal, place, frequency) values
  ('f4a00000-0000-0000-0000-000000000001', 'user_2RoleOwner0000000000000', 'strength', 'gym', 3);

insert into private.retired_user_ids (user_id) values ('user_2RoleRetired00000000000');

-- The database role is authenticated throughout, so only the claims decide
set local role authenticated;

-- ------------------------------------------------------------
-- role = authenticated: the sub claim
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2RoleOwner0000000000000","role":"authenticated"}';

select is(public.current_user_id(), 'user_2RoleOwner0000000000000', 'current_user_id() is the sub of an authenticated token');
select isnt_empty($$select id from public.plans$$, 'an authenticated token sees its own Plans');

-- ------------------------------------------------------------
-- No role claim (a Clerk OAuth access token): NULL
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2RoleOwner0000000000000"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for a token without a role claim');
select is_empty($$select id from public.plans$$, 'a token without a role claim sees no Plans');

-- ------------------------------------------------------------
-- role = anon: NULL
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2RoleOwner0000000000000","role":"anon"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for an anon token');
select is_empty($$select id from public.plans$$, 'an anon token sees no Plans');

-- ------------------------------------------------------------
-- Any other role: NULL
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2RoleOwner0000000000000","role":"service_role"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for a service_role token');

set local request.jwt.claims = '{"sub":"user_2RoleOwner0000000000000","role":"Authenticated"}';

select is(public.current_user_id(), null, 'the role check is exact');

-- ------------------------------------------------------------
-- Retired User id: still NULL with role = authenticated (ADR 0001)
-- ------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_2RoleRetired00000000000","role":"authenticated"}';

select is(public.current_user_id(), null, 'current_user_id() is NULL for a retired User id');

select * from finish();

rollback;
