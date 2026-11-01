begin;
select plan(5);
select set_config('request.jwt.claims', '{"sub":"user_goalBounds","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.weekly_goal_changes (user_id, target) values ('user_goalBounds', 1)$$,
  'minimum Weekly goal remains valid');
select lives_ok($$insert into public.weekly_goal_changes (user_id, target) values ('user_goalBounds', 7)$$,
  'maximum Weekly goal remains valid');
select lives_ok($$insert into public.weekly_goal_changes (user_id, target) values ('user_goalBounds', null)$$,
  'unknown Weekly goal remains valid');
select throws_ok($$insert into public.weekly_goal_changes (user_id, target) values ('user_goalBounds', 8)$$,
  '23514', null, 'direct writes cannot exceed the goal cap');
select throws_ok($$insert into public.weekly_goal_changes (user_id, target) values ('user_goalBounds', 32767)$$,
  '23514', null, 'smallint maximum cannot become a Session scan limit');
reset role;
select * from finish();
rollback;
