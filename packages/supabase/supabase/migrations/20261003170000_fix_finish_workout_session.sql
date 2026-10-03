-- Fix finish_workout_session:
--   1. Idempotent: a second call on an already finished session is a no-op
--      instead of overwriting finished_at and rotating the workout again.
--   2. Works for sessions whose workout template was deleted (workout_id is
--      NULL since 20260417000000_fix_workout_sessions_cascade.sql): the session
--      is finished and the rotation is skipped.
--   3. Ownership is checked via workout_sessions.user_id instead of the
--      workout -> plan chain.
--   4. updated_at is set on the session.
--   5. The finished workout still moves to the end of the plan queue, but the
--      plan's workouts are renumbered 1..N instead of order = max + 1, so
--      "order" stays contiguous and no longer grows without bound.
CREATE OR REPLACE FUNCTION public.finish_workout_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workout_id uuid;
  v_plan_id uuid;
BEGIN
  -- Lock the plan before the session, the same order update_plan takes its
  -- locks in (plan, then workouts, then sessions via ON DELETE SET NULL), so
  -- a finish racing a plan edit waits instead of deadlocking
  SELECT plan_id INTO v_plan_id
  FROM public.workout_sessions
  WHERE id = p_session_id
    AND user_id = auth.uid();

  IF v_plan_id IS NOT NULL THEN
    PERFORM 1
    FROM public.plans
    WHERE id = v_plan_id
    FOR NO KEY UPDATE;
  END IF;

  -- Atomically claim the session: only the owner can finish it, and only once
  UPDATE public.workout_sessions
  SET finished_at = now(),
      updated_at = now()
  WHERE id = p_session_id
    AND user_id = auth.uid()
    AND finished_at IS NULL
  RETURNING workout_id INTO v_workout_id;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.workout_sessions
      WHERE id = p_session_id
        AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Session not found or not authorized';
    END IF;

    -- Already finished: nothing to do
    RETURN;
  END IF;

  -- Workout template was deleted: nothing to rotate
  IF v_workout_id IS NULL THEN
    RETURN;
  END IF;

  -- Resolve plan_id
  SELECT plan_id INTO v_plan_id
  FROM public.workouts
  WHERE id = v_workout_id;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock the plan's workouts so concurrent finishes of the same plan
  -- renumber one after another
  PERFORM 1
  FROM public.workouts
  WHERE plan_id = v_plan_id
  ORDER BY id
  FOR UPDATE;

  -- Push the completed workout to the end of the queue and renumber the
  -- plan's workouts from 1, preserving the relative order of the others
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY (id = v_workout_id), "order", created_at, id
      ) AS new_order
    FROM public.workouts
    WHERE plan_id = v_plan_id
  )
  UPDATE public.workouts w
  SET "order" = ranked.new_order
  FROM ranked
  WHERE w.id = ranked.id
    AND w."order" <> ranked.new_order;
END;
$$;
