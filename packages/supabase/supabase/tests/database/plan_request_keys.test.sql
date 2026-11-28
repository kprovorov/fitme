-- Request keys on Plans (20261128120000_plan_request_keys.sql, FIT-899):
-- a nullable key, unique per User where it is set, so a repeated create of
-- an accepted Plan Proposal finds the Plan the first one made.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(12);

-- ------------------------------------------------------------
-- Shape
-- ------------------------------------------------------------
select has_column('public', 'plans', 'request_key', 'a Plan has a request key');
select col_is_null('public', 'plans', 'request_key', 'the request key is nullable');
select col_type_is('public', 'plans', 'request_key', 'text', 'the request key is text');
select col_hasnt_default('public', 'plans', 'request_key', 'the request key has no default');

select is(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'plans_user_id_request_key_key'),
  'CREATE UNIQUE INDEX plans_user_id_request_key_key ON public.plans USING btree (user_id, request_key) WHERE (request_key IS NOT NULL)',
  'a partial unique index over the User and the key'
);

-- RLS, its one policy and the retired-id trigger stay as they were
select policies_are('public', 'plans', array['plans_all'], 'no new policy on Plans');
select is(
  (select relrowsecurity from pg_class where oid = 'public.plans'::regclass),
  true,
  'RLS stays on for Plans'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.plans'::regclass
      and tgfoid = 'private.reject_retired_user_id'::regproc
      and not tgisinternal
  ),
  'the retired-id trigger stays on Plans'
);

-- ------------------------------------------------------------
-- Uniqueness (as postgres)
-- ------------------------------------------------------------
insert into public.plans (id, user_id, name, frequency, request_key)
values ('89900000-0000-4000-8000-000000000001', 'user_planKeyOwner', 'A', 3, 'key-1');

select throws_ok(
  $$insert into public.plans (user_id, name, frequency, request_key)
    values ('user_planKeyOwner', 'B', 3, 'key-1')$$,
  '23505',
  null,
  'two Plans of one User can''t share a request key'
);

select lives_ok(
  $$insert into public.plans (user_id, name, frequency, request_key)
    values ('user_planKeyOther', 'A', 3, 'key-1')$$,
  'another User can use the same request key'
);

select lives_ok(
  $$insert into public.plans (user_id, name, frequency)
    values ('user_planKeyOwner', 'C', 3), ('user_planKeyOwner', 'D', 3),
           ('user_planKeyOwner', 'E', 3)$$,
  'Plans without a request key are unlimited'
);

select is(
  (select count(*)::int from public.plans
   where user_id = 'user_planKeyOwner' and request_key is null),
  3,
  'a Plan created without a key keeps none'
);

select * from finish();

rollback;
