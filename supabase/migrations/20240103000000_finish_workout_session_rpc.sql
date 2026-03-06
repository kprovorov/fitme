-- finish_workout_session: atomically marks a session as finished and rotates
-- the completed workout to the end of the plan queue (order = max + 1).
CREATE OR REPLACE FUNCTION public.finish_workout_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workout_id uuid;
  v_plan_id uuid;
  v_max_order integer;
BEGIN
  -- Resolve workout_id while verifying caller owns this session
  SELECT ws.workout_id INTO v_workout_id
  FROM public.workout_sessions ws
  JOIN public.workouts w ON w.id = ws.workout_id
  JOIN public.plans p ON p.id = w.plan_id
  WHERE ws.id = p_session_id
    AND p.user_id = auth.uid();

  IF v_workout_id IS NULL THEN
    RAISE EXCEPTION 'Session not found or not authorized';
  END IF;

  -- Resolve plan_id
  SELECT plan_id INTO v_plan_id
  FROM public.workouts
  WHERE id = v_workout_id;

  -- Mark session finished
  UPDATE public.workout_sessions
  SET finished_at = now()
  WHERE id = p_session_id;

  -- Find the current highest order value across all workouts in the plan
  SELECT MAX("order") INTO v_max_order
  FROM public.workouts
  WHERE plan_id = v_plan_id;

  -- Push the completed workout to the end of the queue
  UPDATE public.workouts
  SET "order" = v_max_order + 1
  WHERE id = v_workout_id;
END;
$$;
