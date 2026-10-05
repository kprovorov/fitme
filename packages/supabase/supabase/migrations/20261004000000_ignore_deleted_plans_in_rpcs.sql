-- Fix: soft-deleted plans (plans.deleted_at IS NOT NULL) were still usable
-- through RPCs.
--
-- activate_plan and start_workout_session only checked that the caller owns
-- the plan, so a deleted plan could be activated again and a session could be
-- started on a workout of a deleted plan. Soft delete also only set
-- deleted_at, so a deleted plan could stay is_active = true.
--
-- Changes:
--   1. activate_plan refuses deleted plans ('Not authorized', as before for
--      plans the caller doesn't own).
--   2. start_workout_session refuses workouts of deleted plans ('Workout not
--      found or not authorized'). The body is otherwise unchanged from
--      20261003000000_one_open_session_per_workout.sql.
--   3. A trigger on plans forces is_active = false on every deleted row, for
--      every caller (mobile, web, MCP, direct API): soft delete deactivates the
--      plan, and a deleted plan can't be set active by a direct UPDATE.
--   4. Backfill: deactivate plans that were already deleted while active.

-- 1. activate_plan: atomic plan activation (SECURITY DEFINER so it can UPDATE
-- across all user plans in one transaction). Only non-deleted plans the caller
-- owns can be activated.
CREATE OR REPLACE FUNCTION public.activate_plan(plan_id uuid)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.plans;
BEGIN
  -- Verify caller owns the plan and it isn't deleted
  IF NOT EXISTS (
    SELECT 1 FROM public.plans
    WHERE id = plan_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Deactivate all plans for this user
  UPDATE public.plans
  SET is_active = false
  WHERE user_id = auth.uid();

  -- Activate the target plan
  UPDATE public.plans
  SET is_active = true
  WHERE id = plan_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 2. start_workout_session: atomically clones a workout template into a live
-- session, populating user_id and plan_id. If the workout already has an open
-- session (finished_at IS NULL), that session's id is returned instead and
-- nothing is inserted or cloned. Concurrent callers are serialized by the
-- partial unique index: the loser of the race gets the winner's session id.
-- Workouts of deleted plans are rejected.
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
  -- Verify caller owns the workout, its plan isn't deleted, and grab plan_id
  SELECT w.plan_id INTO v_plan_id
  FROM public.workouts w
  JOIN public.plans p ON p.id = w.plan_id
  WHERE w.id = p_workout_id
    AND p.user_id = auth.uid()
    AND p.deleted_at IS NULL;

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

-- 3. A deleted plan is never active, whoever writes the row.
CREATE OR REPLACE FUNCTION public.deactivate_deleted_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_active := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deactivate_deleted_plan ON public.plans;
CREATE TRIGGER deactivate_deleted_plan
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NOT NULL AND NEW.is_active)
  EXECUTE FUNCTION public.deactivate_deleted_plan();

-- 4. Backfill plans deleted while active.
UPDATE public.plans
SET is_active = false
WHERE deleted_at IS NOT NULL
  AND is_active;
