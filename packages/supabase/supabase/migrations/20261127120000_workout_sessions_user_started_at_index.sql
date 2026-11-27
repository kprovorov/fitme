-- Index a User's Workout Sessions in start order (FIT-851). The Previous sets
-- lookup (ADR 0025, getPreviousSets in @fitme/services) asks, per Exercise
-- slug, for the User's most recent Workout Session that started before the one
-- being read and has that Exercise. Without this index it read every one of
-- the User's Workout Sessions and their Exercises for each slug (about 17,000
-- buffers and 50-100 ms for a User with 500 finished sessions); with it the
-- planner walks them newest first and stops at the first match (about 730
-- buffers, 10-15 ms). Exercise history and the History list order the same
-- way. workout_sessions_user_id_idx stays: RLS and the other per-User reads
-- use it, and dropping it is its own change.
CREATE INDEX IF NOT EXISTS workout_sessions_user_id_started_at_idx
  ON public.workout_sessions(user_id, started_at, id);
