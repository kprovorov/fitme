-- At most one open Workout Session per User (ADR 0013, FIT-380), replacing
-- the one open session per Workout of 20261003000000_one_open_session_per_workout.sql.
--
--   1. private.close_extra_open_workout_sessions(): the cleanup, the earlier
--      migration's recipe per User instead of per Workout. Kept as a function
--      so the pgTAP suite can run it over seeded duplicates; nobody but its
--      owner may call it.
--   2. Run it, with workout_sessions locked against writes, so no start slips
--      in a second open session before the index exists (one DO block, so
--      one transaction).
--   3. Swap the per-Workout partial unique index for a per-User one, which
--      startWorkoutSession (@fitme/services) inserts against.

-- 1. For every User with more than one open Workout Session, keep the most
-- recently started one (tiebreak: created_at, then id). Of the others, those
-- without a single logged set are deleted (their exercises and sets cascade),
-- so they don't show up as empty Workouts in History; the rest are closed with
-- a plain finished_at, which keeps their logged sets in History. No rotation
-- and no Plan Update: finishWorkoutSession would move a Workout to the end of
-- its Plan once per closed session. Sessions whose Workout is gone
-- (workout_id NULL) count too: they're still open sessions of the User.
CREATE FUNCTION private.close_extra_open_workout_sessions()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id
        ORDER BY started_at DESC, created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.workout_sessions
    WHERE finished_at IS NULL
  )
  DELETE FROM public.workout_sessions ws
  USING ranked
  WHERE ws.id = ranked.id
    AND ranked.rn > 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.workout_session_exercises wse
      JOIN public.workout_session_exercise_sets wses
        ON wses.workout_session_exercise_id = wse.id
      WHERE wse.workout_session_id = ws.id
        AND (
          wses.logged_at IS NOT NULL
          OR wses.reps_completed IS NOT NULL
          OR wses.weight_completed IS NOT NULL
        )
    );

  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id
        ORDER BY started_at DESC, created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.workout_sessions
    WHERE finished_at IS NULL
  )
  UPDATE public.workout_sessions ws
  SET finished_at = now()
  FROM ranked
  WHERE ws.id = ranked.id
    AND ranked.rn > 1;
$$;

REVOKE EXECUTE ON FUNCTION private.close_extra_open_workout_sessions()
  FROM PUBLIC, anon, authenticated, service_role;

-- 2 and 3 in one statement, so one transaction even where the migration
-- runner sends each statement on its own: writers wait until the new index is
-- in place (readers don't), so no start slips in a second open session between
-- the cleanup and the index.
DO $$
BEGIN
  LOCK TABLE public.workout_sessions IN SHARE ROW EXCLUSIVE MODE;

  PERFORM private.close_extra_open_workout_sessions();

  -- 3. One open session per User.
  DROP INDEX public.workout_sessions_one_open_per_workout_idx;

  CREATE UNIQUE INDEX workout_sessions_one_open_per_user_idx
    ON public.workout_sessions (user_id)
    WHERE finished_at IS NULL;
END
$$;
