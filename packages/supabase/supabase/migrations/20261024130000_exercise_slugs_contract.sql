-- Exercise slugs, the contract step (FIT-244; ADR 0007).
--
-- Postgres stops holding the Exercise Library: Workout Exercises and Workout
-- Session Exercises refer to an Exercise by exercise_slug only, with no
-- foreign key and no format check (ADR 0010). This drops what the expand step
-- (20261022120000_exercise_slugs_expand.sql) kept for the transition: the
-- sync trigger, both exercise_id columns with their foreign keys, and the
-- exercises table with its policy and grants. The RPCs installed apps call
-- keep their signatures and their slug behaviour, minus the uuid paths.

DROP TRIGGER sync_exercise_slug ON public.workout_exercises;
DROP TRIGGER sync_exercise_slug ON public.workout_session_exercises;
DROP FUNCTION public.sync_exercise_slug();

-- Dropping the columns drops their foreign keys
ALTER TABLE public.workout_exercises DROP COLUMN exercise_id;
ALTER TABLE public.workout_session_exercises DROP COLUMN exercise_id;

-- The default '' only meant "not sent" to the trigger: a writer must send a
-- slug now, so a missing one fails on NOT NULL
ALTER TABLE public.workout_exercises ALTER COLUMN exercise_slug DROP DEFAULT;
ALTER TABLE public.workout_session_exercises
  ALTER COLUMN exercise_slug DROP DEFAULT;

-- Its policy and grants go with it
DROP TABLE public.exercises;

-- A readable name made from an Exercise slug (`barbell-back-squat` →
-- `Barbell back squat`), as exerciseNameFromSlug in @fitme/exercise-library
-- makes it: change both together. A slug with no words is its own name.
CREATE FUNCTION private.exercise_name_from_slug(slug text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN words = '' THEN slug
    ELSE upper(left(words, 1)) || substr(words, 2)
  END
  FROM (
    SELECT array_to_string(
      array_remove(regexp_split_to_array(slug, '-+'), ''),
      ' '
    ) AS words
  ) w
$$;

REVOKE EXECUTE ON FUNCTION private.exercise_name_from_slug(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- The plan and session RPCs the installed apps call take and copy an Exercise
-- as its exercise_slug only, unchecked (ADR 0010). Their @fitme/services twins
-- do the same.
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
      INSERT INTO public.workout_exercises
        (workout_id, exercise_slug, "order")
      VALUES (
        v_workout_id,
        v_exercise->>'exercise_slug',
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

CREATE OR REPLACE FUNCTION public.update_plan(
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
      INSERT INTO public.workout_exercises
        (workout_id, exercise_slug, "order")
      VALUES (
        v_workout_id,
        v_exercise->>'exercise_slug',
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
    SELECT we.id, we.exercise_slug, we."order"
    FROM public.workout_exercises we
    WHERE we.workout_id = p_workout_id
    ORDER BY we."order"
  LOOP
    INSERT INTO public.workout_session_exercises
      (workout_session_id, exercise_slug, "order")
    VALUES (
      v_session_id,
      v_exercise.exercise_slug,
      v_exercise."order"
    )
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

-- workout_session_plan_changes (FIT-230) matches and copies Exercises by slug.
-- With no exercises table left, each Exercise in its response is its slug plus
-- a name made from the slug (private.exercise_name_from_slug), which installed
-- apps show on the "Update your plan?" sheet; the legacy uuid `id` is gone.
CREATE OR REPLACE FUNCTION public.workout_session_plan_changes(
  session_id uuid,
  apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- MAX_SETS_PER_EXERCISE in @fitme/services
  c_max_sets constant integer := 20;
  -- the rest of an added Exercise's sets, as the Coach's plan card defaults
  c_default_rest constant integer := 90;
  -- more Exercises than any real Workout has (MCP allows 30 per Workout); past
  -- it on either side nothing is offered, so the work per call stays bounded
  c_max_exercises constant integer := 50;
  -- the same for one Exercise's sets (a Workout Exercise keeps at most 20)
  c_max_input_sets constant integer := 100;

  v_user_id text := public.current_user_id();
  v_session_workout_id uuid;
  v_finished_at timestamptz;
  v_applied_at timestamptz;
  v_unmatchable boolean;
  v_workout_id uuid;
  v_workout_name text;
  v_plan_id uuid;
  v_plan_name text;
  v_slot record;
  v_change jsonb;
  v_sets jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_last_plan_rest integer;
  v_plan_sets integer;
  v_workout_exercise_id uuid;
  v_next_order integer;
BEGIN
  -- Table locks before any row lock, in deleteUserData's order, so a call
  -- queues behind an account deletion instead of holding a row its cascade
  -- needs. workout_sessions comes first, as in finish_workout_session: the
  -- apply stamps it, and taking it last would wait on a deletion that waits
  -- on the Workout tables held here.
  LOCK TABLE public.workout_sessions, public.workouts,
    public.workout_exercises, public.workout_exercise_sets
    IN ROW EXCLUSIVE MODE;

  SELECT ws.workout_id INTO v_session_workout_id
  FROM public.workout_sessions ws
  WHERE ws.id = workout_session_plan_changes.session_id
    AND ws.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not authorized';
  END IF;

  -- The Plan row, the Workout row, then the session row: two concurrent
  -- applies serialize here, and the second sees plan_changes_applied_at.
  -- The Plan comes first as in finish_workout_session (Plan, session, then
  -- the Plan's Workouts) and update_plan, so a call racing a finish of the
  -- same session waits instead of deadlocking. FOR NO KEY UPDATE still lets
  -- others insert rows referencing the Workout.
  IF v_session_workout_id IS NOT NULL THEN
    PERFORM 1
    FROM public.plans p
    WHERE p.id = (
      SELECT w.plan_id FROM public.workouts w
      WHERE w.id = v_session_workout_id
    )
      AND p.user_id = v_user_id
    FOR NO KEY UPDATE;

    SELECT w.id, w.name, p.id, p.name
    INTO v_workout_id, v_workout_name, v_plan_id, v_plan_name
    FROM public.workouts w
    JOIN public.plans p ON p.id = w.plan_id
    WHERE w.id = v_session_workout_id
      AND p.user_id = v_user_id
      AND p.deleted_at IS NULL
    FOR NO KEY UPDATE OF w;

    -- And its Exercises: the Coach's addSetToExercise and
    -- removeSetFromExercise lock only the Workout Exercise they edit, so
    -- without this an apply and a Coach edit could both count the same sets
    -- and append under the same order (or past the 20-set cap)
    PERFORM 1
    FROM public.workout_exercises we
    WHERE we.workout_id = v_workout_id
    ORDER BY we.id
    FOR NO KEY UPDATE;
  END IF;

  SELECT ws.workout_id, ws.finished_at, ws.plan_changes_applied_at
  INTO v_session_workout_id, v_finished_at, v_applied_at
  FROM public.workout_sessions ws
  WHERE ws.id = workout_session_plan_changes.session_id
    AND ws.user_id = v_user_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not authorized';
  END IF;

  -- No Workout (deleted, or its Plan soft-deleted), or the session moved off
  -- it while we waited for the lock
  IF v_workout_id IS NULL
    OR v_session_workout_id IS DISTINCT FROM v_workout_id THEN
    RETURN jsonb_build_object(
      'plan', NULL,
      'workout', NULL,
      'changes', '[]'::jsonb
    );
  END IF;

  -- Slots are matched by `order`, so a repeated `order` on either side (the
  -- app never writes one, but RLS lets a User insert them) makes the match
  -- meaningless, and the join below would grow with the product of the
  -- duplicates. Nothing is offered then, nor past c_max_exercises on either
  -- side or c_max_input_sets on any one Exercise, which bounds the per-slot
  -- work below (each check is one indexed count, no sort).
  v_unmatchable := EXISTS (
    SELECT 1 FROM public.workout_session_exercises
    WHERE workout_session_id = workout_session_plan_changes.session_id
    GROUP BY "order"
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.workout_exercises
    WHERE workout_id = v_workout_id
    GROUP BY "order"
    HAVING count(*) > 1
  ) OR (
    SELECT count(*) FROM public.workout_session_exercises
    WHERE workout_session_id = workout_session_plan_changes.session_id
  ) > c_max_exercises OR (
    SELECT count(*) FROM public.workout_exercises
    WHERE workout_id = v_workout_id
  ) > c_max_exercises OR EXISTS (
    SELECT 1
    FROM public.workout_session_exercises se
    JOIN public.workout_session_exercise_sets ss
      ON ss.workout_session_exercise_id = se.id
    WHERE se.workout_session_id = workout_session_plan_changes.session_id
    GROUP BY se.id
    HAVING count(*) > c_max_input_sets
  ) OR EXISTS (
    SELECT 1
    FROM public.workout_exercises we
    JOIN public.workout_exercise_sets ps ON ps.workout_exercise_id = we.id
    WHERE we.workout_id = v_workout_id
    GROUP BY we.id
    HAVING count(*) > c_max_input_sets
  );

  IF v_finished_at IS NOT NULL AND v_applied_at IS NULL
    AND NOT v_unmatchable THEN
    FOR v_slot IN
      SELECT
        coalesce(we."order", se."order") AS slot,
        se.id AS session_exercise_id,
        se.exercise_slug AS session_exercise_slug,
        private.exercise_name_from_slug(se.exercise_slug)
          AS session_exercise_name,
        we.id AS workout_exercise_id,
        we.exercise_slug AS workout_exercise_slug,
        private.exercise_name_from_slug(we.exercise_slug)
          AS workout_exercise_name
      FROM (
        SELECT * FROM public.workout_session_exercises
        WHERE workout_session_id = workout_session_plan_changes.session_id
      ) se
      FULL JOIN (
        SELECT * FROM public.workout_exercises
        WHERE workout_id = v_workout_id
      ) we ON we."order" = se."order"
      ORDER BY 1, se.id, we.id
    LOOP
      v_change := NULL;
      v_plan_sets := 0;
      v_last_plan_rest := NULL;

      IF v_slot.workout_exercise_id IS NOT NULL THEN
        SELECT count(*)::integer INTO v_plan_sets
        FROM public.workout_exercise_sets
        WHERE workout_exercise_id = v_slot.workout_exercise_id;

        SELECT rest_recommended INTO v_last_plan_rest
        FROM public.workout_exercise_sets
        WHERE workout_exercise_id = v_slot.workout_exercise_id
        ORDER BY "order" DESC, id DESC
        LIMIT 1;
      END IF;

      IF v_slot.session_exercise_id IS NULL THEN
        -- Removed: a Workout Exercise with no session Exercise in its slot
        v_change := jsonb_build_object(
          'kind', 'remove_exercise',
          'workout_exercise_id', v_slot.workout_exercise_id,
          'exercise', jsonb_build_object(
            'slug', v_slot.workout_exercise_slug,
            'name', v_slot.workout_exercise_name
          )
        );

      ELSIF v_slot.workout_exercise_id IS NULL THEN
        -- Added: its logged sets, rest 90 s; nothing logged, not offered
        SELECT jsonb_agg(
          jsonb_build_object(
            'reps', s.reps_completed,
            'weight', coalesce(s.weight_completed, 0),
            'rest', c_default_rest
          )
          ORDER BY s."order", s.id
        )
        INTO v_sets
        FROM (
          SELECT *
          FROM public.workout_session_exercise_sets
          WHERE workout_session_exercise_id = v_slot.session_exercise_id
            AND reps_completed IS NOT NULL
          ORDER BY "order", id
          LIMIT c_max_sets
        ) s;

        IF v_sets IS NOT NULL THEN
          v_change := jsonb_build_object(
            'kind', 'add_exercise',
            'exercise', jsonb_build_object(
              'slug', v_slot.session_exercise_slug,
              'name', v_slot.session_exercise_name
            ),
            'sets', v_sets
          );
        END IF;

      ELSIF v_slot.session_exercise_slug <> v_slot.workout_exercise_slug THEN
        -- Replaced: one set per session set, logged values as targets (an
        -- unlogged set takes the last logged set's), each with the rest of
        -- the Plan set at its position (past the Plan's sets, its last one).
        -- Nothing logged, not offered.
        SELECT jsonb_agg(
          jsonb_build_object(
            'reps', coalesce(s.reps_completed, last_logged.reps),
            'weight', CASE
              WHEN s.reps_completed IS NOT NULL
                THEN coalesce(s.weight_completed, 0)
              ELSE last_logged.weight
            END,
            'rest', coalesce(plan_set.rest_recommended, v_last_plan_rest,
              c_default_rest)
          )
          ORDER BY s.position
        )
        INTO v_sets
        FROM (
          SELECT
            ss.reps_completed,
            ss.weight_completed,
            row_number() OVER (ORDER BY ss."order", ss.id) AS position
          FROM public.workout_session_exercise_sets ss
          WHERE ss.workout_session_exercise_id = v_slot.session_exercise_id
        ) s
        CROSS JOIN (
          SELECT
            ss.reps_completed AS reps,
            coalesce(ss.weight_completed, 0) AS weight
          FROM public.workout_session_exercise_sets ss
          WHERE ss.workout_session_exercise_id = v_slot.session_exercise_id
            AND ss.reps_completed IS NOT NULL
          ORDER BY ss."order" DESC, ss.id DESC
          LIMIT 1
        ) last_logged
        LEFT JOIN (
          SELECT
            ps.rest_recommended,
            row_number() OVER (ORDER BY ps."order", ps.id) AS position
          FROM public.workout_exercise_sets ps
          WHERE ps.workout_exercise_id = v_slot.workout_exercise_id
        ) plan_set ON plan_set.position = s.position
        WHERE s.position <= c_max_sets;

        IF v_sets IS NOT NULL THEN
          v_change := jsonb_build_object(
            'kind', 'replace_exercise',
            'workout_exercise_id', v_slot.workout_exercise_id,
            'exercise', jsonb_build_object(
              'slug', v_slot.session_exercise_slug,
              'name', v_slot.session_exercise_name
            ),
            'replaced_exercise', jsonb_build_object(
              'slug', v_slot.workout_exercise_slug,
              'name', v_slot.workout_exercise_name
            ),
            'sets', v_sets
          );
        END IF;

      ELSE
        -- Same Exercise: the logged sets created during the session, rest of
        -- the Plan's last set, up to 20 sets in all. A created set carries no
        -- reps_recommended, unlike a copied one, but replacing the Exercise
        -- in the app zeroes every set's targets, so after switching back the
        -- marker is gone; the session can't delete sets, so a set past the
        -- Plan's count was created too. Logged values that differ from the
        -- targets and unlogged sets aren't changes.
        SELECT jsonb_agg(
          jsonb_build_object(
            'reps', s.reps_completed,
            'weight', coalesce(s.weight_completed, 0),
            'rest', coalesce(v_last_plan_rest, c_default_rest)
          )
          ORDER BY s."order", s.id
        )
        INTO v_sets
        FROM (
          SELECT *
          FROM (
            SELECT
              ss.*,
              row_number() OVER (ORDER BY ss."order", ss.id) AS position
            FROM public.workout_session_exercise_sets ss
            WHERE ss.workout_session_exercise_id = v_slot.session_exercise_id
          ) numbered
          WHERE (numbered.reps_recommended IS NULL
              OR numbered.position > v_plan_sets)
            AND numbered.reps_completed IS NOT NULL
          ORDER BY numbered."order", numbered.id
          LIMIT greatest(c_max_sets - v_plan_sets, 0)
        ) s;

        IF v_sets IS NOT NULL THEN
          v_change := jsonb_build_object(
            'kind', 'add_sets',
            'workout_exercise_id', v_slot.workout_exercise_id,
            'exercise', jsonb_build_object(
              'slug', v_slot.workout_exercise_slug,
              'name', v_slot.workout_exercise_name
            ),
            'sets', v_sets
          );
        END IF;
      END IF;

      IF v_change IS NOT NULL THEN
        v_changes := v_changes || jsonb_build_array(v_change);
      END IF;
    END LOOP;

    IF workout_session_plan_changes.apply THEN
      -- 1. Replacements and added sets, on their existing rows
      FOR v_change IN
        SELECT c FROM jsonb_array_elements(v_changes) c
        WHERE c ->> 'kind' IN ('replace_exercise', 'add_sets')
      LOOP
        v_workout_exercise_id := (v_change ->> 'workout_exercise_id')::uuid;

        IF v_change ->> 'kind' = 'replace_exercise' THEN
          UPDATE public.workout_exercises
          SET exercise_slug = v_change -> 'exercise' ->> 'slug',
              updated_at = now()
          WHERE id = v_workout_exercise_id;

          DELETE FROM public.workout_exercise_sets
          WHERE workout_exercise_id = v_workout_exercise_id;

          v_next_order := 1;
        ELSE
          SELECT coalesce(max("order"), 0) + 1 INTO v_next_order
          FROM public.workout_exercise_sets
          WHERE workout_exercise_id = v_workout_exercise_id;
        END IF;

        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended,
           rest_recommended)
        SELECT
          v_workout_exercise_id,
          v_next_order + s.position - 1,
          (s.value ->> 'reps')::integer,
          (s.value ->> 'weight')::numeric,
          (s.value ->> 'rest')::integer
        FROM jsonb_array_elements(v_change -> 'sets')
          WITH ORDINALITY AS s(value, position);
      END LOOP;

      -- 2. Removals, then the remaining Exercises renumbered from 1
      DELETE FROM public.workout_exercises
      WHERE id IN (
        SELECT (c ->> 'workout_exercise_id')::uuid
        FROM jsonb_array_elements(v_changes) c
        WHERE c ->> 'kind' = 'remove_exercise'
      );

      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (ORDER BY "order", created_at, id) AS new_order
        FROM public.workout_exercises
        WHERE workout_id = v_workout_id
      )
      UPDATE public.workout_exercises we
      SET "order" = ranked.new_order
      FROM ranked
      WHERE we.id = ranked.id
        AND we."order" <> ranked.new_order;

      -- 3. Added Exercises, appended after the last one
      FOR v_change IN
        SELECT c FROM jsonb_array_elements(v_changes) c
        WHERE c ->> 'kind' = 'add_exercise'
      LOOP
        INSERT INTO public.workout_exercises
          (workout_id, exercise_slug, "order")
        SELECT
          v_workout_id,
          v_change -> 'exercise' ->> 'slug',
          coalesce(max("order"), 0) + 1
        FROM public.workout_exercises
        WHERE workout_id = v_workout_id
        RETURNING id INTO v_workout_exercise_id;

        INSERT INTO public.workout_exercise_sets
          (workout_exercise_id, "order", reps_recommended, weight_recommended,
           rest_recommended)
        SELECT
          v_workout_exercise_id,
          s.position,
          (s.value ->> 'reps')::integer,
          (s.value ->> 'weight')::numeric,
          (s.value ->> 'rest')::integer
        FROM jsonb_array_elements(v_change -> 'sets')
          WITH ORDINALITY AS s(value, position);
      END LOOP;

      UPDATE public.workout_sessions
      SET plan_changes_applied_at = now()
      WHERE id = workout_session_plan_changes.session_id;
    END IF;
  END IF;

  -- The response leaves out the row ids and rests the apply works from
  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'id', v_plan_id,
      'name', v_plan_name
    ),
    'workout', jsonb_build_object(
      'id', v_workout_id,
      'name', v_workout_name
    ),
    'changes', coalesce(
      (
        SELECT jsonb_agg(
          (c - 'workout_exercise_id') || CASE
            WHEN c ? 'sets' THEN jsonb_build_object(
              'sets',
              (
                SELECT jsonb_agg(s - 'rest' ORDER BY position)
                FROM jsonb_array_elements(c -> 'sets')
                  WITH ORDINALITY AS sets(s, position)
              )
            )
            ELSE '{}'::jsonb
          END
          ORDER BY position
        )
        FROM jsonb_array_elements(v_changes) WITH ORDINALITY AS changes(c, position)
      ),
      '[]'::jsonb
    )
  );
END;
$$;
