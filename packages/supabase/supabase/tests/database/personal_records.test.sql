-- A non-backend login (like Data API authenticator) can read own awards,
-- but only the fitme login through asUser can write retained evidence.
begin;
select plan(5);

insert into public.workout_sessions (id, user_id, started_at, finished_at)
values ('11111111-4650-4000-8000-000000000001', 'user_prPolicy', now(), now());
insert into public.personal_records (user_id, workout_session_id, exercise_slug, kind, weight, reps)
values ('user_prPolicy', '11111111-4650-4000-8000-000000000001', 'pull-up', 'reps', 0, 12);

select set_config('request.jwt.claims', '{"sub":"user_prPolicy","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.personal_records), 1::bigint, 'Data API User reads own awards');
select throws_ok(
  $$insert into public.personal_records (user_id, workout_session_id, exercise_slug, kind, weight, reps)
    values ('user_prPolicy', '11111111-4650-4000-8000-000000000001', 'squat', 'weight', 999, 1)$$,
  '42501', null, 'Data API User cannot forge an award'
);
with changed as (update public.personal_records set reps = 999 returning id)
select is((select count(*) from changed), 0::bigint, 'Data API User cannot edit an award');
with removed as (delete from public.personal_records returning id)
select is((select count(*) from removed), 0::bigint, 'Data API User cannot remove an award');

reset role;
select set_config('request.jwt.claims', '{"sub":"user_otherPrPolicy","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.personal_records), 0::bigint, 'other Users cannot read awards');
reset role;
select * from finish();
rollback;
