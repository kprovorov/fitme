-- The index the Previous sets lookup walks, from
-- 20261127120000_workout_sessions_user_started_at_index.sql (FIT-851).
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(1);

select has_index('public', 'workout_sessions', 'workout_sessions_user_id_started_at_idx',
  array['user_id', 'started_at', 'id'],
  'workout_sessions is indexed by user_id, started_at, id');

select * from finish();

rollback;
