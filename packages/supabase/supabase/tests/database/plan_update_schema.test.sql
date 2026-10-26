-- What the Plan Update service (packages/services/src/plan-update.ts) reads
-- and writes, from 20261021120000_workout_session_plan_changes.sql: the
-- applied stamp and the indexes its lookups go through.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(4);

select has_column('public', 'workout_sessions', 'plan_changes_applied_at',
  'workout_sessions has plan_changes_applied_at');
select has_index('public', 'workout_exercises', 'workout_exercises_workout_id_idx', array['workout_id'],
  'workout_exercises is indexed by workout_id');
select has_index('public', 'workout_exercise_sets', 'workout_exercise_sets_exercise_id_idx', array['workout_exercise_id'],
  'workout_exercise_sets is indexed by workout_exercise_id');
select has_index('public', 'workout_session_exercise_sets', 'workout_session_exercise_sets_exercise_id_idx', array['workout_session_exercise_id'],
  'workout_session_exercise_sets is indexed by workout_session_exercise_id');

select * from finish();

rollback;
