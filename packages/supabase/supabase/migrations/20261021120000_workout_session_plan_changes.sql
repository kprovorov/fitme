-- Update the Plan from a Workout Session (FIT-230).
--
-- workout_session_plan_changes(session_id, apply) works out the structural
-- changes a finished Workout Session made to its Workout (replaced, added and
-- removed Exercises, extra sets) and, with apply = true, writes them to the
-- Workout. The app previews them after a finish and applies them when the
-- User accepts.
--
-- A deliberate exception to ADR 0004 (business logic in a Postgres RPC): it
-- moves to @fitme/services and apps/api with the other plan and
-- workout-session RPCs. Until then it has no services mirror.
--
-- Matching: a session keeps no reference to the rows it was copied from, so
-- the session Exercise at `order` N is the Workout Exercise at `order` N
-- (start_workout_session copies the orders, replacing keeps the row, deleting
-- leaves a gap, adding appends at max + 1).

-- Set by a successful apply. Once set, both modes return no changes: applying
-- renumbers the Workout's Exercises, so recomputing against the updated
-- Workout would offer nonsense, and a retried apply must not write twice.
ALTER TABLE public.workout_sessions
  ADD COLUMN plan_changes_applied_at timestamptz;

-- Response, both modes:
--   {
--     "plan": { "id", "name" } | null,
--     "workout": { "id", "name" } | null,
--     "changes": [
--       { "kind": "replace_exercise", "exercise": {id, name},
--         "replaced_exercise": {id, name}, "sets": [{reps, weight}] },
--       { "kind": "add_exercise", "exercise": {id, name}, "sets": [...] },
--       { "kind": "remove_exercise", "exercise": {id, name} },
--       { "kind": "add_sets", "exercise": {id, name}, "sets": [...] }
--     ]
--   }
-- changes are in Workout order (by `order`). plan and workout are null when
-- the Workout is gone or its Plan is soft-deleted. changes is empty when the
-- session is open, its Workout is gone, its Plan is soft-deleted, its changes
-- were already applied, either side repeats an `order`, or nothing
-- qualifies. Another User's or a missing
-- session raises 'Session not found or not authorized'.
CREATE FUNCTION public.workout_session_plan_changes(
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

  v_user_id text := public.current_user_id();
  v_session_workout_id uuid;
  v_finished_at timestamptz;
  v_applied_at timestamptz;
  v_duplicate_orders boolean;
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
  -- duplicates. Nothing is offered then.
  v_duplicate_orders := EXISTS (
    SELECT 1 FROM public.workout_session_exercises
    WHERE workout_session_id = workout_session_plan_changes.session_id
    GROUP BY "order"
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.workout_exercises
    WHERE workout_id = v_workout_id
    GROUP BY "order"
    HAVING count(*) > 1
  );

  IF v_finished_at IS NOT NULL AND v_applied_at IS NULL
    AND NOT v_duplicate_orders THEN
    FOR v_slot IN
      SELECT
        coalesce(we."order", se."order") AS slot,
        se.id AS session_exercise_id,
        se.exercise_id AS session_exercise,
        se_ex.name AS session_exercise_name,
        we.id AS workout_exercise_id,
        we.exercise_id AS workout_exercise,
        we_ex.name AS workout_exercise_name
      FROM (
        SELECT * FROM public.workout_session_exercises
        WHERE workout_session_id = workout_session_plan_changes.session_id
      ) se
      FULL JOIN (
        SELECT * FROM public.workout_exercises
        WHERE workout_id = v_workout_id
      ) we ON we."order" = se."order"
      LEFT JOIN public.exercises se_ex ON se_ex.id = se.exercise_id
      LEFT JOIN public.exercises we_ex ON we_ex.id = we.exercise_id
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
            'id', v_slot.workout_exercise,
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
              'id', v_slot.session_exercise,
              'name', v_slot.session_exercise_name
            ),
            'sets', v_sets
          );
        END IF;

      ELSIF v_slot.session_exercise <> v_slot.workout_exercise THEN
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
              'id', v_slot.session_exercise,
              'name', v_slot.session_exercise_name
            ),
            'replaced_exercise', jsonb_build_object(
              'id', v_slot.workout_exercise,
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
              'id', v_slot.workout_exercise,
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
          SET exercise_id = (v_change -> 'exercise' ->> 'id')::uuid,
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
        INSERT INTO public.workout_exercises (workout_id, exercise_id, "order")
        SELECT
          v_workout_id,
          (v_change -> 'exercise' ->> 'id')::uuid,
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

REVOKE EXECUTE ON FUNCTION public.workout_session_plan_changes(uuid, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.workout_session_plan_changes(uuid, boolean)
  TO authenticated;
