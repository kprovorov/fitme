-- Fix: allow at most one open (unfinished) workout session per workout.
--
-- start_workout_session always inserted a new session, so two concurrent starts
-- (e.g. the mobile app and the MCP server) or a repeated tap could leave several
-- sessions with finished_at IS NULL for the same workout. The app only surfaces
-- one of them (workout.sessions.find(s => !s.finished_at)), so the others stayed
-- "in progress" forever.
--
-- Changes:
--   1. Clean up duplicate open sessions left over from before this fix (delete
--      empty ones, close the ones with logged sets)
--   2. Add a partial unique index: one open session per workout_id
--   3. Make start_workout_session idempotent: return the existing open session
--      instead of creating a second one, and survive a concurrent start

-- 1. Dedupe existing open sessions.
-- For every workout with more than one open session, keep the most recently
-- started one (tiebreak: created_at, then id). Of the other duplicates, those
-- without a single logged set are deleted (their exercises and sets cascade),
-- so they don't show up as empty "completed" workouts in the history. The
-- remaining ones are closed by setting finished_at, which keeps their logged
-- sets in the user's history. This is a plain UPDATE on purpose:
-- finish_workout_session would also rotate the workout to the end of the plan
-- queue once per closed duplicate.
DELETE FROM public.workout_sessions ws
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workout_id
      ORDER BY started_at DESC, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.workout_sessions
  WHERE finished_at IS NULL
    AND workout_id IS NOT NULL
) ranked
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

UPDATE public.workout_sessions ws
SET finished_at = now()
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workout_id
      ORDER BY started_at DESC, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.workout_sessions
  WHERE finished_at IS NULL
    AND workout_id IS NOT NULL
) ranked
WHERE ws.id = ranked.id
  AND ranked.rn > 1;

-- 2. At most one open session per workout. Sessions whose workout was deleted
-- have workout_id NULL (FK is ON DELETE SET NULL); NULLs are distinct in a
-- unique index, so orphaned open sessions never collide with each other.
CREATE UNIQUE INDEX workout_sessions_one_open_per_workout_idx
  ON public.workout_sessions (workout_id)
  WHERE finished_at IS NULL;

-- 3. start_workout_session: atomically clones a workout template into a live
-- session, populating user_id and plan_id. If the workout already has an open
-- session (finished_at IS NULL), that session's id is returned instead and
-- nothing is inserted or cloned. Concurrent callers are serialized by the
-- partial unique index: the loser of the race gets the winner's session id.
CREATE OR REPLACE FUNCTION public.start_workout_session(p_workout_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_plan_id uuid;
  v_exercise RECORD;
  v_session_exercise_id uuid;
BEGIN
  -- Verify caller owns the workout and grab plan_id
  SELECT w.plan_id INTO v_plan_id
  FROM public.workouts w
  JOIN public.plans p ON p.id = w.plan_id
  WHERE w.id = p_workout_id
    AND p.user_id = auth.uid();

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Workout not found or not authorized';
  END IF;

  LOOP
    -- Resume the open session if there already is one
    SELECT ws.id INTO v_session_id
    FROM public.workout_sessions ws
    WHERE ws.workout_id = p_workout_id
      AND ws.finished_at IS NULL;

    IF v_session_id IS NOT NULL THEN
      RETURN v_session_id;
    END IF;

    -- Create session with user_id and plan_id
    INSERT INTO public.workout_sessions (workout_id, plan_id, user_id, started_at)
    VALUES (p_workout_id, v_plan_id, auth.uid(), now())
    ON CONFLICT (workout_id) WHERE finished_at IS NULL DO NOTHING
    RETURNING id INTO v_session_id;

    EXIT WHEN v_session_id IS NOT NULL;

    -- Lost a race with a concurrent start: loop to return the session it
    -- created (already cloned by that call). If that session was finished in
    -- the meantime, the next iteration inserts a fresh one.
  END LOOP;

  -- Clone each exercise and its sets
  FOR v_exercise IN
    SELECT we.id, we.exercise_id, we."order"
    FROM public.workout_exercises we
    WHERE we.workout_id = p_workout_id
    ORDER BY we."order"
  LOOP
    INSERT INTO public.workout_session_exercises (workout_session_id, exercise_id, "order")
    VALUES (v_session_id, v_exercise.exercise_id, v_exercise."order")
    RETURNING id INTO v_session_exercise_id;

    INSERT INTO public.workout_session_exercise_sets
      (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
    SELECT
      v_session_exercise_id,
      wes."order",
      wes.reps_recommended,
      wes.weight_recommended,
      wes.rest_recommended
    FROM public.workout_exercise_sets wes
    WHERE wes.workout_exercise_id = v_exercise.id
    ORDER BY wes."order";
  END LOOP;

  RETURN v_session_id;
END;
$$;
