-- Plan RPCs derive "order" from each item's position in the payload arrays
-- (1-based) instead of trusting an "order" field. The AI plan schema no
-- longer asks the model for order, and clients may send 0-based values.

CREATE OR REPLACE FUNCTION public.create_plan(p_plan_data jsonb)
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
  v_workout_order integer;
  v_exercise_order integer;
  v_set_order integer;
BEGIN
  -- Insert plan
  INSERT INTO public.plans (
    user_id, name, description, goal, place, frequency,
    experience_level, workout_duration, note
  ) VALUES (
    auth.uid(),
    p_plan_data->>'name',
    p_plan_data->>'description',
    p_plan_data->>'goal',
    p_plan_data->>'place',
    (p_plan_data->>'frequency')::integer,
    p_plan_data->>'experience_level',
    (p_plan_data->>'workout_duration')::integer,
    p_plan_data->>'note'
  )
  RETURNING id INTO v_plan_id;

  -- Insert workouts
  FOR v_workout, v_workout_order IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_plan_data->'workouts') WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    INSERT INTO public.workouts (plan_id, name, description, "order")
    VALUES (
      v_plan_id,
      v_workout->>'name',
      v_workout->>'description',
      v_workout_order
    )
    RETURNING id INTO v_workout_id;

    -- Insert exercises
    FOR v_exercise, v_exercise_order IN
      SELECT value, ordinality
      FROM jsonb_array_elements(v_workout->'exercises') WITH ORDINALITY
      ORDER BY ordinality
    LOOP
      INSERT INTO public.workout_exercises (workout_id, exercise_id, "order")
      VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::uuid,
        v_exercise_order
      )
      RETURNING id INTO v_workout_exercise_id;

      -- Insert sets
      FOR v_set, v_set_order IN
        SELECT value, ordinality
        FROM jsonb_array_elements(v_exercise->'sets') WITH ORDINALITY
        ORDER BY ordinality
      LOOP
        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        VALUES (
          v_workout_exercise_id,
          v_set_order,
          (v_set->>'reps_recommended')::integer,
          (v_set->>'weight_recommended')::numeric,
          (v_set->>'rest_recommended')::integer
        );
      END LOOP;
    END LOOP;
  END LOOP;

  -- Activate the new plan (deactivates all others atomically)
  PERFORM public.activate_plan(v_plan_id);

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_plan(
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
  v_workout_order integer;
  v_exercise_order integer;
  v_set_order integer;
BEGIN
  INSERT INTO public.plans (
    user_id, name, description, goal, place, frequency,
    experience_level, workout_duration, note
  ) VALUES (
    p_user_id,
    p_plan_data->>'name',
    p_plan_data->>'description',
    p_plan_data->>'goal',
    p_plan_data->>'place',
    (p_plan_data->>'frequency')::integer,
    p_plan_data->>'experience_level',
    (p_plan_data->>'workout_duration')::integer,
    p_plan_data->>'note'
  )
  RETURNING id INTO v_plan_id;

  FOR v_workout, v_workout_order IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_plan_data->'workouts') WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    INSERT INTO public.workouts (plan_id, name, description, "order")
    VALUES (
      v_plan_id,
      v_workout->>'name',
      v_workout->>'description',
      v_workout_order
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise, v_exercise_order IN
      SELECT value, ordinality
      FROM jsonb_array_elements(v_workout->'exercises') WITH ORDINALITY
      ORDER BY ordinality
    LOOP
      INSERT INTO public.workout_exercises (workout_id, exercise_id, "order")
      VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::uuid,
        v_exercise_order
      )
      RETURNING id INTO v_workout_exercise_id;

      FOR v_set, v_set_order IN
        SELECT value, ordinality
        FROM jsonb_array_elements(v_exercise->'sets') WITH ORDINALITY
        ORDER BY ordinality
      LOOP
        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        VALUES (
          v_workout_exercise_id,
          v_set_order,
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
  v_workout_order integer;
  v_exercise_order integer;
  v_set_order integer;
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

  FOR v_workout, v_workout_order IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_plan_data->'workouts') WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    INSERT INTO public.workouts (plan_id, name, description, "order")
    VALUES (
      v_plan_id,
      v_workout->>'name',
      v_workout->>'description',
      v_workout_order
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise, v_exercise_order IN
      SELECT value, ordinality
      FROM jsonb_array_elements(v_workout->'exercises') WITH ORDINALITY
      ORDER BY ordinality
    LOOP
      INSERT INTO public.workout_exercises (workout_id, exercise_id, "order")
      VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::uuid,
        v_exercise_order
      )
      RETURNING id INTO v_workout_exercise_id;

      FOR v_set, v_set_order IN
        SELECT value, ordinality
        FROM jsonb_array_elements(v_exercise->'sets') WITH ORDINALITY
        ORDER BY ordinality
      LOOP
        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        VALUES (
          v_workout_exercise_id,
          v_set_order,
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
