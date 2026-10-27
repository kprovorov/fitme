-- The plan_id foreign key indexes from 20261027130000_plan_id_indexes.sql
-- (FIT-344): the advisor's unindexed_foreign_keys lint lists neither.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(2);

select has_index('public', 'workouts', 'workouts_plan_id_idx', array['plan_id'],
  'workouts is indexed by plan_id');
select has_index('public', 'workout_sessions', 'workout_sessions_plan_id_idx', array['plan_id'],
  'workout_sessions is indexed by plan_id');

select * from finish();

rollback;
