CREATE OR REPLACE FUNCTION public.update_plan(
  p_plan_id uuid,
  p_plan_data jsonb,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_workout_id uuid;
  v_workout_exercise_id uuid;
  v_workout jsonb;
  v_exercise jsonb;
  v_set jsonb;
BEGIN
  UPDATE public.plans
  SET
    name = p_plan_data->>'name',
    description = p_plan_data->>'description',
    goal = p_plan_data->>'goal',
    place = p_plan_data->>'place',
    frequency = (p_plan_data->>'frequency')::integer,
    experience_level = p_plan_data->>'experience_level',
    workout_duration = (p_plan_data->>'workout_duration')::integer,
    note = p_plan_data->>'note',
    updated_at = now()
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING id INTO v_plan_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan not found or access denied';
  END IF;

  DELETE FROM public.workouts
  WHERE plan_id = v_plan_id;

  FOR v_workout IN SELECT * FROM jsonb_array_elements(p_plan_data->'workouts')
  LOOP
    INSERT INTO public.workouts (plan_id, name, description, "order")
    VALUES (
      v_plan_id,
      v_workout->>'name',
      v_workout->>'description',
      (v_workout->>'order')::integer
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO public.workout_exercises (workout_id, exercise_id, "order")
      VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'order')::integer
      )
      RETURNING id INTO v_workout_exercise_id;

      FOR v_set IN SELECT * FROM jsonb_array_elements(v_exercise->'sets')
      LOOP
        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        VALUES (
          v_workout_exercise_id,
          (v_set->>'order')::integer,
          (v_set->>'reps_recommended')::integer,
          (v_set->>'weight_recommended')::numeric,
          (v_set->>'rest_recommended')::integer
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_plan_id;
END;
$$;
