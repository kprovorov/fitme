-- User id becomes a text key read from the JWT sub claim (ADR 0001).
--
-- Expand step of the Clerk migration: Clerk User ids are text (user_...) and
-- Clerk's sub claim can't carry the legacy UUID, so the database stops
-- depending on Supabase Auth for identity before Clerk tokens are trusted.
-- Supabase Auth tokens also carry sub, and the existing UUIDs stay valid text
-- ids, so the released app keeps working unchanged. Schema and code only, no
-- data is moved.
--
-- Changes:
--   1. public.current_user_id(): the one helper that returns the current User
--      id from the JWT sub claim. auth.uid() is no longer used anywhere.
--      Retired User ids (private.retired_user_ids) resolve to NULL, so a
--      still-valid token of a deleted or rekeyed User can't read or write.
--   2. Drop every policy (they reference user_id or auth.uid(), and a column
--      used in a policy can't change type) and the plan RPCs whose
--      p_user_id uuid DEFAULT auth.uid() parameter changes type.
--   3. Drop the foreign keys to auth.users and convert user_id to text on
--      profiles, plans, workout_sessions and conversations (agent messages).
--      workout_sessions.user_id stays NOT NULL.
--   4. Recreate the policies on top of the helper, same rules as before.
--   5. Recreate every RPC that checked ownership with auth.uid(); bodies are
--      otherwise unchanged from their latest migration.
--   6. delete_user_data(user_id): retires the id and removes every row the
--      User owns. Without the cascade from auth.users, account deletion has
--      to call it. Refuses ids that were rekeyed away.
--   7. rekey_user(old_id, new_id): retires old_id and moves every row of one
--      User to new_id in one transaction, for the Supabase -> Clerk migration
--      script. Dropped later together with the legacy auth rows.
--   8. Both are executable by service_role only.

-- ------------------------------------------------------------
-- 1. Current User id
-- ------------------------------------------------------------
-- Without the foreign key to auth.users nothing stops a token that is still
-- valid (until it expires) from writing under an id whose data was deleted or
-- moved. Retiring the id here blocks it in every policy and RPC at once.
CREATE SCHEMA IF NOT EXISTS private;

-- rekeyed_to records where rekey_user moved the id's rows: it pins retries to
-- the same destination and makes delete_user_data refuse the old id
CREATE TABLE private.retired_user_ids (
  user_id text PRIMARY KEY,
  rekeyed_to text,
  retired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.retired_user_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.retired_user_ids FROM PUBLIC, anon, authenticated;

-- Backstop for writes that don't go through RLS (SECURITY DEFINER RPCs,
-- service_role): no row may be written under a retired id. VOLATILE, so the
-- lookup sees ids retired by a deletion or rekey that committed while the
-- write waited for its table lock.
CREATE FUNCTION private.reject_retired_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'User id % is retired', NEW.user_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- SECURITY DEFINER so it can read the retired ids the caller can't see
CREATE FUNCTION public.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT claims.sub
  FROM (SELECT nullif(auth.jwt() ->> 'sub', '') AS sub) claims
  WHERE NOT EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = claims.sub
  )
$$;

-- ------------------------------------------------------------
-- 2. Drop what depends on the uuid user_id columns
-- ------------------------------------------------------------
DROP POLICY "profiles_all" ON public.profiles;
DROP POLICY "plans_all" ON public.plans;
DROP POLICY "workouts_all" ON public.workouts;
DROP POLICY "workout_exercises_all" ON public.workout_exercises;
DROP POLICY "workout_exercise_sets_all" ON public.workout_exercise_sets;
DROP POLICY "workout_sessions_all" ON public.workout_sessions;
DROP POLICY "workout_session_exercises_all" ON public.workout_session_exercises;
DROP POLICY "workout_session_exercise_sets_all" ON public.workout_session_exercise_sets;
DROP POLICY "Users can manage their own conversations" ON public.conversations;
DROP POLICY "Users can manage messages in their conversations" ON public.messages;

DROP FUNCTION public.store_plan(jsonb, uuid);
DROP FUNCTION public.update_plan(uuid, jsonb, uuid);

-- ------------------------------------------------------------
-- 3. user_id becomes text, no foreign key to auth.users
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_fkey;
ALTER TABLE public.plans DROP CONSTRAINT plans_user_id_fkey;
ALTER TABLE public.workout_sessions DROP CONSTRAINT workout_sessions_user_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT conversations_user_id_fkey;

ALTER TABLE public.profiles ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.plans ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.workout_sessions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.conversations ALTER COLUMN user_id TYPE text USING user_id::text;

-- conversations had no index on user_id; RLS and delete_user_data filter on it
CREATE INDEX conversations_user_id_idx ON public.conversations(user_id);

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.plans
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();

-- ------------------------------------------------------------
-- 4. Policies
-- ------------------------------------------------------------
-- The helper is wrapped in a scalar subquery so it is evaluated once per
-- statement instead of once per row.

-- profiles: own row only
CREATE POLICY "profiles_all" ON public.profiles
  FOR ALL USING (user_id = (SELECT public.current_user_id()))
  WITH CHECK (user_id = (SELECT public.current_user_id()));

-- plans: own rows only
CREATE POLICY "plans_all" ON public.plans
  FOR ALL USING (user_id = (SELECT public.current_user_id()))
  WITH CHECK (user_id = (SELECT public.current_user_id()));

-- workouts: user must own the parent plan
CREATE POLICY "workouts_all" ON public.workouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = workouts.plan_id
        AND plans.user_id = (SELECT public.current_user_id())
    )
  );

-- workout_exercises: ownership via workout -> plan
CREATE POLICY "workout_exercises_all" ON public.workout_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      JOIN public.plans p ON p.id = w.plan_id
      WHERE w.id = workout_exercises.workout_id
        AND p.user_id = (SELECT public.current_user_id())
    )
  );

-- workout_exercise_sets: ownership via workout_exercise -> workout -> plan
CREATE POLICY "workout_exercise_sets_all" ON public.workout_exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      JOIN public.plans p ON p.id = w.plan_id
      WHERE we.id = workout_exercise_sets.workout_exercise_id
        AND p.user_id = (SELECT public.current_user_id())
    )
  );

-- workout_sessions: own rows only, and writes may only reference the
-- caller's own workout and plan (NULL references stay allowed)
CREATE POLICY "workout_sessions_all" ON public.workout_sessions
  FOR ALL USING (user_id = (SELECT public.current_user_id()))
  WITH CHECK (
    user_id = (SELECT public.current_user_id())
    AND (
      workout_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.workouts w
        JOIN public.plans p ON p.id = w.plan_id
        WHERE w.id = workout_sessions.workout_id
          AND p.user_id = (SELECT public.current_user_id())
      )
    )
    AND (
      plan_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plans p
        WHERE p.id = workout_sessions.plan_id
          AND p.user_id = (SELECT public.current_user_id())
      )
    )
  );

-- workout_session_exercises: ownership via session
CREATE POLICY "workout_session_exercises_all" ON public.workout_session_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = workout_session_exercises.workout_session_id
        AND ws.user_id = (SELECT public.current_user_id())
    )
  );

-- workout_session_exercise_sets: ownership via session_exercise -> session
CREATE POLICY "workout_session_exercise_sets_all" ON public.workout_session_exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_exercises wse
      JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
      WHERE wse.id = workout_session_exercise_sets.workout_session_exercise_id
        AND ws.user_id = (SELECT public.current_user_id())
    )
  );

-- conversations: own rows only
CREATE POLICY "Users can manage their own conversations" ON public.conversations
  FOR ALL USING (user_id = (SELECT public.current_user_id()));

-- messages: ownership via conversation
CREATE POLICY "Users can manage messages in their conversations" ON public.messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE user_id = (SELECT public.current_user_id())
    )
  );

-- ------------------------------------------------------------
-- 5. RPCs
-- ------------------------------------------------------------

-- activate_plan: atomic plan activation (SECURITY DEFINER so it can UPDATE
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
      AND user_id = public.current_user_id()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Deactivate all plans for this user
  UPDATE public.plans
  SET is_active = false
  WHERE user_id = public.current_user_id();

  -- Activate the target plan. Ownership is checked again: if the caller's id
  -- was retired while this call waited for the plans lock, nothing matches
  UPDATE public.plans
  SET is_active = true
  WHERE id = plan_id
    AND user_id = public.current_user_id()
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN result;
END;
$$;

-- convert_measurement_system: atomically converts all stored weight/height
-- values for the current user when they change their measurement system
-- preference.
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
  UPDATE public.workout_session_exercise_sets wses
  SET weight_recommended = ROUND(wses.weight_recommended * v_weight_factor, 2)
  FROM public.workout_session_exercises wse
  JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
  JOIN public.workouts w ON w.id = ws.workout_id
  JOIN public.plans p ON p.id = w.plan_id
  WHERE wse.id = wses.workout_session_exercise_id
    AND p.user_id = public.current_user_id()
    AND wses.weight_recommended IS NOT NULL;

  -- 4. Convert workout_session_exercise_sets.weight_completed (where NOT NULL)
  UPDATE public.workout_session_exercise_sets wses
  SET weight_completed = ROUND(wses.weight_completed * v_weight_factor, 2)
  FROM public.workout_session_exercises wse
  JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
  JOIN public.workouts w ON w.id = ws.workout_id
  JOIN public.plans p ON p.id = w.plan_id
  WHERE wse.id = wses.workout_session_exercise_id
    AND p.user_id = public.current_user_id()
    AND wses.weight_completed IS NOT NULL;
END;
$$;

-- create_plan: creates a plan for the current user from a JSON payload and
-- activates it. "order" is derived from each item's position (1-based).
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
    public.current_user_id(),
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

-- store_plan / update_plan: p_user_id must match the current User; only the
-- service role may act on behalf of another User.
CREATE FUNCTION public.store_plan(
  p_plan_data jsonb,
  p_user_id text DEFAULT public.current_user_id()
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
      p_user_id IS DISTINCT FROM public.current_user_id()
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

CREATE FUNCTION public.update_plan(
  p_plan_id uuid,
  p_plan_data jsonb,
  p_user_id text DEFAULT public.current_user_id()
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
      p_user_id IS DISTINCT FROM public.current_user_id()
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

REVOKE EXECUTE ON FUNCTION public.store_plan(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_plan(uuid, jsonb, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.store_plan(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_plan(uuid, jsonb, text) TO authenticated, service_role;

-- start_workout_session: atomically clones a workout template into a live
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
  v_session_user_id text;
  v_plan_id uuid;
  v_exercise RECORD;
  v_session_exercise_id uuid;
BEGIN
  -- Verify caller owns the workout, its plan isn't deleted, and grab plan_id
  SELECT w.plan_id INTO v_plan_id
  FROM public.workouts w
  JOIN public.plans p ON p.id = w.plan_id
  WHERE w.id = p_workout_id
    AND p.user_id = public.current_user_id()
    AND p.deleted_at IS NULL;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Workout not found or not authorized';
  END IF;

  LOOP
    -- Resume the open session if there already is one. Its owner is checked
    -- again: if the caller's id was retired after the check above, the
    -- session now belongs to another id
    SELECT ws.id, ws.user_id INTO v_session_id, v_session_user_id
    FROM public.workout_sessions ws
    WHERE ws.workout_id = p_workout_id
      AND ws.finished_at IS NULL;

    IF v_session_id IS NOT NULL THEN
      IF v_session_user_id IS DISTINCT FROM public.current_user_id() THEN
        RAISE EXCEPTION 'Workout not found or not authorized';
      END IF;

      RETURN v_session_id;
    END IF;

    -- Create session with user_id and plan_id
    INSERT INTO public.workout_sessions (workout_id, plan_id, user_id, started_at)
    VALUES (p_workout_id, v_plan_id, public.current_user_id(), now())
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

-- finish_workout_session: idempotent, works for sessions whose workout was
-- deleted, and moves the finished workout to the end of the plan queue.
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
  -- Take the workout_sessions write lock before any row lock: it conflicts
  -- with the table locks of delete_user_data and rekey_user, so a finish
  -- racing them waits up front instead of holding a plan row lock they need
  -- while waiting for a table lock they hold
  LOCK TABLE public.workout_sessions IN ROW EXCLUSIVE MODE;

  -- Lock the plan before the session, the same order update_plan takes its
  -- locks in (plan, then workouts, then sessions via ON DELETE SET NULL), so
  -- a finish racing a plan edit waits instead of deadlocking
  SELECT plan_id INTO v_plan_id
  FROM public.workout_sessions
  WHERE id = p_session_id
    AND user_id = public.current_user_id();

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
    AND user_id = public.current_user_id()
    AND finished_at IS NULL
  RETURNING workout_id INTO v_workout_id;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.workout_sessions
      WHERE id = p_session_id
        AND user_id = public.current_user_id()
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

-- ------------------------------------------------------------
-- 6. delete_user_data
-- ------------------------------------------------------------
-- Retires the User id and removes every row owned by the User. The
-- User-owned tables are listed explicitly; their children (workouts,
-- exercises, sets, session exercises and sets, messages) go with them through
-- the existing ON DELETE CASCADE foreign keys inside the public schema.
-- Calling it again is a no-op.
--
-- An id that was rekeyed away is refused (SQLSTATE 55000): its rows and
-- its account now live under the new id, so deleting only the old account
-- would leave a live account without data, and deleting only the data would
-- leave a live account behind. The User deletes the new account instead.
--
-- The User-owned tables and their children are locked against writes first,
-- so requests already in flight finish before the delete and later ones wait for the commit; by then
-- the id is retired: current_user_id() rejects them, and the
-- reject_retired_user_id triggers stop RPCs that read the id before the wait.
CREATE FUNCTION public.delete_user_data(user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF delete_user_data.user_id IS NULL OR delete_user_data.user_id = '' THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  LOCK TABLE
    public.profiles, public.plans, public.workout_sessions, public.conversations,
    public.workouts, public.workout_exercises, public.workout_exercise_sets,
    public.workout_session_exercises, public.workout_session_exercise_sets,
    public.messages
    IN SHARE ROW EXCLUSIVE MODE;

  -- Checked after the lock, so a rekey that committed first is seen
  IF EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = delete_user_data.user_id
      AND r.rekeyed_to IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'User % was rekeyed', delete_user_data.user_id
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO private.retired_user_ids (user_id)
  VALUES (delete_user_data.user_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.workout_sessions ws
  WHERE ws.user_id = delete_user_data.user_id;

  DELETE FROM public.plans p
  WHERE p.user_id = delete_user_data.user_id;

  DELETE FROM public.conversations c
  WHERE c.user_id = delete_user_data.user_id;

  DELETE FROM public.profiles pr
  WHERE pr.user_id = delete_user_data.user_id;
END;
$$;

-- ------------------------------------------------------------
-- 7. rekey_user
-- ------------------------------------------------------------
-- Moves every row of one User from old_id to new_id. A function call is a
-- single transaction, so either every table moves or none does. Other Users
-- are untouched, and it refuses to merge into a new_id that already owns
-- rows. Rerunning the same call after success is a no-op.
--
-- old_id is retired with a pointer to new_id, so a still-valid legacy token
-- can't write rows the rekey would miss, and deleting old_id later is
-- refused rather than leaving the new account behind. The User-owned tables and their children are
-- locked against writes first, so requests in flight finish before the move.
-- A retired new_id is only accepted when this call reverses its own rekey
-- (a rollback to the legacy id); it is then un-retired.
CREATE FUNCTION public.rekey_user(old_id text, new_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF rekey_user.old_id IS NULL OR rekey_user.old_id = ''
    OR rekey_user.new_id IS NULL OR rekey_user.new_id = ''
  THEN
    RAISE EXCEPTION 'old_id and new_id are required';
  END IF;

  IF rekey_user.old_id = rekey_user.new_id THEN
    RETURN;
  END IF;

  LOCK TABLE
    public.profiles, public.plans, public.workout_sessions, public.conversations,
    public.workouts, public.workout_exercises, public.workout_exercise_sets,
    public.workout_session_exercises, public.workout_session_exercise_sets,
    public.messages
    IN SHARE ROW EXCLUSIVE MODE;

  -- Retrying a rekey that already happened is a no-op. It must not touch
  -- new_id's own retirement, which a later rekey of new_id may have set
  IF EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = rekey_user.old_id
      AND r.rekeyed_to = rekey_user.new_id
  ) THEN
    RETURN;
  END IF;

  -- Any other retired old_id (deleted, or rekeyed elsewhere) can't be
  -- rekeyed: that would orphan the rows it already moved
  IF EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = rekey_user.old_id
      AND r.rekeyed_to IS DISTINCT FROM rekey_user.new_id
  ) THEN
    RAISE EXCEPTION 'User % is already retired', rekey_user.old_id
      USING ERRCODE = '23505';
  END IF;

  -- A retired new_id can only be reclaimed by reversing its own rekey
  -- (rolling old_id's rows back to the id they came from). Anything else
  -- would break new_id's existing chain or resurrect a deleted id
  IF EXISTS (
    SELECT 1 FROM private.retired_user_ids r
    WHERE r.user_id = rekey_user.new_id
      AND r.rekeyed_to IS DISTINCT FROM rekey_user.old_id
  ) THEN
    RAISE EXCEPTION 'User % is already retired', rekey_user.new_id
      USING ERRCODE = '23505';
  END IF;

  -- Never merge two Users: refuse a new id that already owns rows (an exact
  -- retry after success has already returned above)
  IF (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = rekey_user.new_id)
    OR EXISTS (SELECT 1 FROM public.plans WHERE user_id = rekey_user.new_id)
    OR EXISTS (SELECT 1 FROM public.workout_sessions WHERE user_id = rekey_user.new_id)
    OR EXISTS (SELECT 1 FROM public.conversations WHERE user_id = rekey_user.new_id)
  ) THEN
    RAISE EXCEPTION 'User % already owns data', rekey_user.new_id
      USING ERRCODE = '23505';
  END IF;

  -- Un-retire new_id before the rows move onto it (the triggers reject
  -- writes under a retired id)
  DELETE FROM private.retired_user_ids r
  WHERE r.user_id = rekey_user.new_id;

  INSERT INTO private.retired_user_ids (user_id, rekeyed_to)
  VALUES (rekey_user.old_id, rekey_user.new_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.profiles pr
  SET user_id = rekey_user.new_id
  WHERE pr.user_id = rekey_user.old_id;

  UPDATE public.plans p
  SET user_id = rekey_user.new_id
  WHERE p.user_id = rekey_user.old_id;

  UPDATE public.workout_sessions ws
  SET user_id = rekey_user.new_id
  WHERE ws.user_id = rekey_user.old_id;

  UPDATE public.conversations c
  SET user_id = rekey_user.new_id
  WHERE c.user_id = rekey_user.old_id;
END;
$$;

-- ------------------------------------------------------------
-- 8. service_role only
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.delete_user_data(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rekey_user(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_user_data(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rekey_user(text, text) TO service_role;
