-- Index the two plan_id foreign keys the performance advisor lists as
-- unindexed (FIT-344, lint 0001_unindexed_foreign_keys). Plan reads
-- (getPlan, listPlans, getActivePlan), the Plan delete cascade,
-- finishWorkoutSession's rotation and the Plan Update all look up Workouts by
-- plan_id, and deleting a Plan sets workout_sessions.plan_id to null, which
-- scanned the whole table for each one.
CREATE INDEX IF NOT EXISTS workouts_plan_id_idx
  ON public.workouts(plan_id);
CREATE INDEX IF NOT EXISTS workout_sessions_plan_id_idx
  ON public.workout_sessions(plan_id);
