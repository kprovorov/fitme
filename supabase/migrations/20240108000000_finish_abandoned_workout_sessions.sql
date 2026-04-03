-- finish_abandoned_workout_sessions: finds in-progress sessions idle for >3 hours
-- and marks them as finished, rotating the workout to the end of its plan queue
-- (mirrors the logic in finish_workout_session but bypasses auth.uid() for cron use).
CREATE OR REPLACE FUNCTION public.finish_abandoned_workout_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_plan_id uuid;
  v_max_order integer;
  v_count integer := 0;
BEGIN
  -- "last activity" = most recent logged_at across all sets in the session,
  -- falling back to started_at when no sets have been logged yet.
  FOR v_session IN
    SELECT ws.id, ws.workout_id
    FROM public.workout_sessions ws
    WHERE ws.finished_at IS NULL
      AND COALESCE(
        (
          SELECT MAX(wses.logged_at)
          FROM public.workout_session_exercise_sets wses
          JOIN public.workout_session_exercises wse
            ON wse.id = wses.workout_session_exercise_id
          WHERE wse.workout_session_id = ws.id
            AND wses.logged_at IS NOT NULL
        ),
        ws.started_at
      ) < now() - INTERVAL '3 hours'
  LOOP
    -- Mark session finished
    UPDATE public.workout_sessions
    SET finished_at = now(),
        updated_at  = now()
    WHERE id = v_session.id;

    -- Resolve plan
    SELECT plan_id INTO v_plan_id
    FROM public.workouts
    WHERE id = v_session.workout_id;

    -- Push the completed workout to the end of the plan queue
    SELECT MAX("order") INTO v_max_order
    FROM public.workouts
    WHERE plan_id = v_plan_id;

    UPDATE public.workouts
    SET "order" = v_max_order + 1
    WHERE id = v_session.workout_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Run every 30 minutes via pg_cron (available on all Supabase projects).
SELECT cron.schedule(
  'finish-abandoned-workouts',
  '*/30 * * * *',
  $$SELECT public.finish_abandoned_workout_sessions()$$
);
