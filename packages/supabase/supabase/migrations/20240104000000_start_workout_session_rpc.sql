-- start_workout_session: atomically clones a workout template into a live session.
-- Creates the session row, clones all exercises and their sets in one transaction.
-- Returns the new session's UUID.
CREATE OR REPLACE FUNCTION public.start_workout_session(p_workout_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_exercise RECORD;
  v_session_exercise_id uuid;
BEGIN
  -- Verify caller owns the workout
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts w
    JOIN public.plans p ON p.id = w.plan_id
    WHERE w.id = p_workout_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Workout not found or not authorized';
  END IF;

  -- Create session
  INSERT INTO public.workout_sessions (workout_id, started_at)
  VALUES (p_workout_id, now())
  RETURNING id INTO v_session_id;

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
