-- Weekly streaks read only the current consecutive run, one local week at
-- a time. Keep each range read independent of the User's older history;
-- stop after the (at most seven) qualifying sessions needed for its goal.
-- This also serves every lookup supported by the old User-only index.
-- Replace that redundant index so a stale per-User row estimate cannot
-- choose a User-only scan and filter their entire history for each week.
CREATE INDEX workout_sessions_user_started_idx
  ON public.workout_sessions (user_id, started_at);
DROP INDEX public.workout_sessions_user_id_idx;
