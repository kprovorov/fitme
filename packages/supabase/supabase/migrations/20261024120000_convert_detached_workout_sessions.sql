-- convert_measurement_system: convert every Workout Session set of the User
-- (FIT-267). Sessions were reached through their Workout, so one whose Workout
-- is gone (workout_id NULL after its Plan's Workouts were replaced) kept its
-- old-unit weights through every later conversion, and every reader labelled
-- them with the Profile's new unit. Sessions are now found by their own
-- user_id. Change it together with updateProfile in packages/services.
--
-- Sessions already skewed by earlier conversions stay as they are: the data
-- doesn't record which unit they were logged in, so a backfill would be a
-- guess.
--
-- Conversion constants:
--   metric -> imperial: weight * 2.20462 (kg -> lbs), height * 0.393701 (cm -> in)
--   imperial -> metric: weight / 2.20462, height / 0.393701
--   us <-> uk: no value conversion (both use lbs/inches), only field update
CREATE OR REPLACE FUNCTION public.convert_measurement_system(p_new_system text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_system text;
  v_weight_factor numeric;
  v_height_factor numeric;
BEGIN
  IF p_new_system NOT IN ('metric', 'us', 'uk') THEN
    RAISE EXCEPTION 'Invalid measurement system: %', p_new_system;
  END IF;

  SELECT measurement_system INTO v_current_system
  FROM public.profiles
  WHERE user_id = public.current_user_id();

  IF v_current_system IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- No-op if already on this system
  IF v_current_system = p_new_system THEN
    RETURN;
  END IF;

  -- us <-> uk: both use lbs/inches, no numeric conversion needed
  IF v_current_system IN ('us', 'uk') AND p_new_system IN ('us', 'uk') THEN
    UPDATE public.profiles
    SET measurement_system = p_new_system
    WHERE user_id = public.current_user_id();
    RETURN;
  END IF;

  -- Determine conversion direction
  IF v_current_system = 'metric' THEN
    -- metric -> imperial
    v_weight_factor := 2.20462;
    v_height_factor := 0.393701;
  ELSE
    -- imperial -> metric
    v_weight_factor := 1.0 / 2.20462;
    v_height_factor := 1.0 / 0.393701;
  END IF;

  -- 1. Convert profile weight, height, and update measurement_system
  UPDATE public.profiles
  SET
    weight = ROUND(weight * v_weight_factor, 2),
    height = ROUND(height * v_height_factor, 2),
    measurement_system = p_new_system
  WHERE user_id = public.current_user_id();

  -- 2. Convert workout_exercise_sets.weight_recommended across all user plans
  UPDATE public.workout_exercise_sets wes
  SET weight_recommended = ROUND(wes.weight_recommended * v_weight_factor, 2)
  FROM public.workout_exercises we
  JOIN public.workouts w ON w.id = we.workout_id
  JOIN public.plans p ON p.id = w.plan_id
  WHERE we.id = wes.workout_exercise_id
    AND p.user_id = public.current_user_id();

  -- 3. Convert workout_session_exercise_sets.weight_recommended (where NOT NULL)
  --    of every Workout Session of the user, whether its Workout exists or not
  UPDATE public.workout_session_exercise_sets wses
  SET weight_recommended = ROUND(wses.weight_recommended * v_weight_factor, 2)
  FROM public.workout_session_exercises wse
  JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
  WHERE wse.id = wses.workout_session_exercise_id
    AND ws.user_id = public.current_user_id()
    AND wses.weight_recommended IS NOT NULL;

  -- 4. Convert workout_session_exercise_sets.weight_completed (where NOT NULL)
  --    of every Workout Session of the user, whether its Workout exists or not
  UPDATE public.workout_session_exercise_sets wses
  SET weight_completed = ROUND(wses.weight_completed * v_weight_factor, 2)
  FROM public.workout_session_exercises wse
  JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
  WHERE wse.id = wses.workout_session_exercise_id
    AND ws.user_id = public.current_user_id()
    AND wses.weight_completed IS NOT NULL;
END;
$$;
