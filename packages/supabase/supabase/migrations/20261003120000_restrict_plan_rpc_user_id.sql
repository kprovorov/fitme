-- store_plan and update_plan are SECURITY DEFINER and trusted the caller's
-- p_user_id, so any signed-in user could create or overwrite plans in another
-- account. p_user_id must now match auth.uid(); only the service role may
-- pass a different user. Anonymous callers lose EXECUTE altogether.

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
  -- Only the service role may act on behalf of another user
  IF p_user_id IS NULL
    OR (
      p_user_id IS DISTINCT FROM auth.uid()
      AND coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

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
  -- Only the service role may act on behalf of another user
  IF p_user_id IS NULL
    OR (
      p_user_id IS DISTINCT FROM auth.uid()
      AND coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    )
  THEN
    RAISE EXCEPTION 'Plan not found or access denied' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.store_plan(jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_plan(uuid, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.store_plan(jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_plan(uuid, jsonb, uuid) TO authenticated, service_role;
