begin;
select plan(5);

insert into public.personal_record_initializations (user_id)
values ('user_prInitializationPolicy');

select set_config('request.jwt.claims', '{"sub":"user_prInitializationPolicy","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.personal_record_initializations), 1::bigint, 'User reads own completion');
select throws_ok(
  $$insert into public.personal_record_initializations (user_id) values ('user_foreignPrInitialization')$$,
  '42501', null, 'Data API cannot mark another User initialized'
);
select throws_ok(
  $$delete from public.personal_record_initializations$$,
  '42501', null, 'Data API cannot reset completion'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"user_otherPrInitializationPolicy","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.personal_record_initializations), 0::bigint, 'other Users cannot read completion');
select throws_ok(
  $$insert into public.personal_record_initializations (user_id) values ('user_otherPrInitializationPolicy')$$,
  '42501', null, 'Data API cannot forge own completion either'
);
reset role;
select * from finish();
rollback;
