-- Fix: workout_sessions should not be deleted when workout templates are updated.
--
-- Previously, update_plan RPC deleted all workouts and recreated them with new UUIDs.
-- Because workout_sessions.workout_id had ON DELETE CASCADE, this wiped all user progress.
--
-- Changes:
--   1. Add user_id to workout_sessions for direct ownership (needed for RLS when workout_id is NULL)
--   2. Add plan_id to workout_sessions (nullable, preserved even after workout is deleted)
--   3. Make workout_id nullable
--   4. Change workout_id FK from ON DELETE CASCADE to ON DELETE SET NULL
--   5. Update RLS policy to use user_id directly
--   6. Update start_workout_session RPC to populate user_id and plan_id

-- 1. Add user_id column (backfill from workout -> plan -> user)
ALTER TABLE public.workout_sessions
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.workout_sessions ws
SET user_id = p.user_id
FROM public.workouts w
JOIN public.plans p ON p.id = w.plan_id
WHERE w.id = ws.workout_id;

ALTER TABLE public.workout_sessions
  ALTER COLUMN user_id SET NOT NULL;

-- 2. Add plan_id column (nullable — preserved even if the plan is later deleted or the workout is nulled)
ALTER TABLE public.workout_sessions
  ADD COLUMN plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

UPDATE public.workout_sessions ws
SET plan_id = w.plan_id
FROM public.workouts w
WHERE w.id = ws.workout_id;

-- 3 & 4. Make workout_id nullable and change cascade behavior
ALTER TABLE public.workout_sessions
  ALTER COLUMN workout_id DROP NOT NULL;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT workout_sessions_workout_id_fkey;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_workout_id_fkey
    FOREIGN KEY (workout_id)
    REFERENCES public.workouts(id)
    ON DELETE SET NULL;

-- 5. Update RLS policies to own via user_id directly instead of the workout -> plan chain.
-- workout_session_exercises_all and workout_session_exercise_sets_all previously joined
-- through workout_sessions.workout_id, which is now nullable — those joins return no rows
-- when workout_id is NULL, silently blocking users from their own progress data.

DROP POLICY "workout_sessions_all" ON public.workout_sessions;
DROP POLICY "workout_session_exercises_all" ON public.workout_session_exercises;
DROP POLICY "workout_session_exercise_sets_all" ON public.workout_session_exercise_sets;

CREATE POLICY "workout_sessions_all" ON public.workout_sessions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "workout_session_exercises_all" ON public.workout_session_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = workout_session_exercises.workout_session_id
        AND ws.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_session_exercise_sets_all" ON public.workout_session_exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_exercises wse
      JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
      WHERE wse.id = workout_session_exercise_sets.workout_session_exercise_id
        AND ws.user_id = auth.uid()
    )
  );

-- Index to make the new user_id-based RLS checks fast
CREATE INDEX workout_sessions_user_id_idx ON public.workout_sessions(user_id);

-- 6. Update start_workout_session to populate user_id and plan_id
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

  -- Create session with user_id and plan_id
  INSERT INTO public.workout_sessions (workout_id, plan_id, user_id, started_at)
  VALUES (p_workout_id, v_plan_id, auth.uid(), now())
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
