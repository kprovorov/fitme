-- pgTAP tests for public.workout_session_plan_changes (FIT-230). Run with
-- `pnpm db test:db`.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(44);

-- Fixtures -------------------------------------------------------------------
-- Owner A has every Plan; B has none. Sessions are finished unless a case
-- says otherwise. Session sets copied from the Workout carry
-- reps_recommended (0 once their Exercise is replaced, as the app does); sets
-- added during the session carry none.
INSERT INTO public.exercises (id, name, slug)
VALUES
  ('f2300000-0000-0000-0000-0000000000e1', 'Test Bench Press', 'test-bench-press-fit230'),
  ('f2300000-0000-0000-0000-0000000000e2', 'Test Squat', 'test-squat-fit230'),
  ('f2300000-0000-0000-0000-0000000000e3', 'Test Dips', 'test-dips-fit230'),
  ('f2300000-0000-0000-0000-0000000000e4', 'Test Dumbbell Press', 'test-dumbbell-press-fit230'),
  ('f2300000-0000-0000-0000-0000000000e5', 'Test Cable Fly', 'test-cable-fly-fit230'),
  ('f2300000-0000-0000-0000-0000000000e6', 'Test Leg Press', 'test-leg-press-fit230');

INSERT INTO public.plans (id, user_id, name, goal, place, frequency, deleted_at)
VALUES
  ('f2300000-0000-0000-0000-0000000000a1', 'user_2PlanChangesOwnerA000000', 'PPL', 'strength', 'gym', 3, NULL),
  ('f2300000-0000-0000-0000-0000000000a2', 'user_2PlanChangesOwnerA000000', 'Deleted', 'strength', 'gym', 3, now());

INSERT INTO public.workouts (id, plan_id, "order", name, description)
VALUES
  -- (main) every change kind
  ('f2300000-0000-0000-0000-0000000000b1', 'f2300000-0000-0000-0000-0000000000a1', 1, 'Push Day', ''),
  -- (cap) the 20-set cap
  ('f2300000-0000-0000-0000-0000000000b2', 'f2300000-0000-0000-0000-0000000000a1', 2, 'Cap Day', ''),
  -- (last) delete the last Exercise, then add one
  ('f2300000-0000-0000-0000-0000000000b3', 'f2300000-0000-0000-0000-0000000000a1', 3, 'Last Day', ''),
  -- (skip) nothing qualifies
  ('f2300000-0000-0000-0000-0000000000b4', 'f2300000-0000-0000-0000-0000000000a1', 4, 'Skip Day', ''),
  -- (open) an open session
  ('f2300000-0000-0000-0000-0000000000b5', 'f2300000-0000-0000-0000-0000000000a1', 5, 'Open Day', ''),
  -- (deleted) a soft-deleted Plan
  ('f2300000-0000-0000-0000-0000000000b6', 'f2300000-0000-0000-0000-0000000000a2', 1, 'Deleted Day', ''),
  -- (back) replaced, then switched back to the original Exercise
  ('f2300000-0000-0000-0000-0000000000b7', 'f2300000-0000-0000-0000-0000000000a1', 6, 'Back Day', '');

INSERT INTO public.workout_exercises (id, workout_id, exercise_id, "order")
VALUES
  ('f2300000-0000-0000-0000-0000000001c1', 'f2300000-0000-0000-0000-0000000000b1', 'f2300000-0000-0000-0000-0000000000e1', 1),
  ('f2300000-0000-0000-0000-0000000001c2', 'f2300000-0000-0000-0000-0000000000b1', 'f2300000-0000-0000-0000-0000000000e2', 2),
  ('f2300000-0000-0000-0000-0000000001c3', 'f2300000-0000-0000-0000-0000000000b1', 'f2300000-0000-0000-0000-0000000000e3', 3),
  ('f2300000-0000-0000-0000-0000000001c4', 'f2300000-0000-0000-0000-0000000000b1', 'f2300000-0000-0000-0000-0000000000e1', 4),
  ('f2300000-0000-0000-0000-0000000002c1', 'f2300000-0000-0000-0000-0000000000b2', 'f2300000-0000-0000-0000-0000000000e2', 1),
  ('f2300000-0000-0000-0000-0000000002c2', 'f2300000-0000-0000-0000-0000000000b2', 'f2300000-0000-0000-0000-0000000000e1', 2),
  ('f2300000-0000-0000-0000-0000000003c1', 'f2300000-0000-0000-0000-0000000000b3', 'f2300000-0000-0000-0000-0000000000e2', 1),
  ('f2300000-0000-0000-0000-0000000003c2', 'f2300000-0000-0000-0000-0000000000b3', 'f2300000-0000-0000-0000-0000000000e3', 2),
  ('f2300000-0000-0000-0000-0000000004c1', 'f2300000-0000-0000-0000-0000000000b4', 'f2300000-0000-0000-0000-0000000000e1', 1),
  ('f2300000-0000-0000-0000-0000000004c2', 'f2300000-0000-0000-0000-0000000000b4', 'f2300000-0000-0000-0000-0000000000e2', 2),
  ('f2300000-0000-0000-0000-0000000005c1', 'f2300000-0000-0000-0000-0000000000b5', 'f2300000-0000-0000-0000-0000000000e1', 1),
  ('f2300000-0000-0000-0000-0000000006c1', 'f2300000-0000-0000-0000-0000000000b6', 'f2300000-0000-0000-0000-0000000000e1', 1),
  ('f2300000-0000-0000-0000-0000000007c1', 'f2300000-0000-0000-0000-0000000000b7', 'f2300000-0000-0000-0000-0000000000e2', 1);

INSERT INTO public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
VALUES
  -- (main) Bench Press, replaced in the session
  ('f2300000-0000-0000-0000-0000000001c1', 1, 8, 60, 120),
  ('f2300000-0000-0000-0000-0000000001c1', 2, 8, 60, 120),
  ('f2300000-0000-0000-0000-0000000001c1', 3, 8, 60, 150),
  -- (main) Squat, sets added in the session
  ('f2300000-0000-0000-0000-0000000001c2', 1, 5, 100, 180),
  ('f2300000-0000-0000-0000-0000000001c2', 2, 5, 100, 200),
  -- (main) Dips, removed in the session
  ('f2300000-0000-0000-0000-0000000001c3', 1, 12, 0, 90),
  -- (main) Bench Press again, a set added in the session
  ('f2300000-0000-0000-0000-0000000001c4', 1, 10, 40, 60),
  -- (last) Squat and Dips
  ('f2300000-0000-0000-0000-0000000003c1', 1, 5, 100, 180),
  ('f2300000-0000-0000-0000-0000000003c2', 1, 12, 0, 75),
  ('f2300000-0000-0000-0000-0000000003c2', 2, 12, 0, 75),
  -- (skip) Bench Press and Squat
  ('f2300000-0000-0000-0000-0000000004c1', 1, 8, 60, 120),
  ('f2300000-0000-0000-0000-0000000004c2', 1, 5, 100, 180),
  -- (open) and (deleted)
  ('f2300000-0000-0000-0000-0000000005c1', 1, 8, 60, 120),
  ('f2300000-0000-0000-0000-0000000006c1', 1, 8, 60, 120),
  -- (back) Squat
  ('f2300000-0000-0000-0000-0000000007c1', 1, 5, 100, 180);

-- (cap) Squat already has 19 sets, Bench Press 1
INSERT INTO public.workout_exercise_sets
  (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
SELECT 'f2300000-0000-0000-0000-0000000002c1'::uuid, n, 5, 100, 180
FROM generate_series(1, 19) n
UNION ALL
SELECT 'f2300000-0000-0000-0000-0000000002c2'::uuid, 1, 8, 60, 120;

INSERT INTO public.workout_sessions (id, user_id, plan_id, workout_id, started_at, finished_at)
VALUES
  ('f2300000-0000-0000-0000-0000000000d1', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b1', now() - interval '1 hour', now()),
  ('f2300000-0000-0000-0000-0000000000d2', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b2', now() - interval '1 hour', now()),
  ('f2300000-0000-0000-0000-0000000000d3', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b3', now() - interval '1 hour', now()),
  ('f2300000-0000-0000-0000-0000000000d4', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b4', now() - interval '1 hour', now()),
  ('f2300000-0000-0000-0000-0000000000d5', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b5', now() - interval '1 hour', NULL),
  ('f2300000-0000-0000-0000-0000000000d6', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a2', 'f2300000-0000-0000-0000-0000000000b6', now() - interval '1 hour', now()),
  -- (gone) its Workout was deleted
  ('f2300000-0000-0000-0000-0000000000d7', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', NULL, now() - interval '1 hour', now()),
  ('f2300000-0000-0000-0000-0000000000d8', 'user_2PlanChangesOwnerA000000', 'f2300000-0000-0000-0000-0000000000a1', 'f2300000-0000-0000-0000-0000000000b7', now() - interval '1 hour', now());

INSERT INTO public.workout_session_exercises (id, workout_session_id, exercise_id, "order")
VALUES
  -- (main) slot 1 replaced by Dumbbell Press, slot 2 Squat, slot 3 (Dips)
  -- deleted, slot 4 Bench Press, slot 5 Cable Fly added and logged, slot 6
  -- Leg Press added and never logged
  ('f2300000-0000-0000-0000-0000000001f1', 'f2300000-0000-0000-0000-0000000000d1', 'f2300000-0000-0000-0000-0000000000e4', 1),
  ('f2300000-0000-0000-0000-0000000001f2', 'f2300000-0000-0000-0000-0000000000d1', 'f2300000-0000-0000-0000-0000000000e2', 2),
  ('f2300000-0000-0000-0000-0000000001f4', 'f2300000-0000-0000-0000-0000000000d1', 'f2300000-0000-0000-0000-0000000000e1', 4),
  ('f2300000-0000-0000-0000-0000000001f5', 'f2300000-0000-0000-0000-0000000000d1', 'f2300000-0000-0000-0000-0000000000e5', 5),
  ('f2300000-0000-0000-0000-0000000001f6', 'f2300000-0000-0000-0000-0000000000d1', 'f2300000-0000-0000-0000-0000000000e6', 6),
  -- (cap) Squat with 3 added sets, Bench Press replaced by Dumbbell Press
  -- with 22 logged sets, Cable Fly added with 21 logged sets
  ('f2300000-0000-0000-0000-0000000002f1', 'f2300000-0000-0000-0000-0000000000d2', 'f2300000-0000-0000-0000-0000000000e2', 1),
  ('f2300000-0000-0000-0000-0000000002f2', 'f2300000-0000-0000-0000-0000000000d2', 'f2300000-0000-0000-0000-0000000000e4', 2),
  ('f2300000-0000-0000-0000-0000000002f3', 'f2300000-0000-0000-0000-0000000000d2', 'f2300000-0000-0000-0000-0000000000e5', 3),
  -- (last) Dips deleted, then Cable Fly added in its slot
  ('f2300000-0000-0000-0000-0000000003f1', 'f2300000-0000-0000-0000-0000000000d3', 'f2300000-0000-0000-0000-0000000000e2', 1),
  ('f2300000-0000-0000-0000-0000000003f2', 'f2300000-0000-0000-0000-0000000000d3', 'f2300000-0000-0000-0000-0000000000e5', 2),
  -- (skip) Bench Press replaced by Dumbbell Press and never logged, Squat
  -- logged off target with an unlogged added set, Cable Fly added and never
  -- logged
  ('f2300000-0000-0000-0000-0000000004f1', 'f2300000-0000-0000-0000-0000000000d4', 'f2300000-0000-0000-0000-0000000000e4', 1),
  ('f2300000-0000-0000-0000-0000000004f2', 'f2300000-0000-0000-0000-0000000000d4', 'f2300000-0000-0000-0000-0000000000e2', 2),
  ('f2300000-0000-0000-0000-0000000004f3', 'f2300000-0000-0000-0000-0000000000d4', 'f2300000-0000-0000-0000-0000000000e5', 3),
  -- (open) and (deleted): Bench Press replaced by Dumbbell Press, logged
  ('f2300000-0000-0000-0000-0000000005f1', 'f2300000-0000-0000-0000-0000000000d5', 'f2300000-0000-0000-0000-0000000000e4', 1),
  ('f2300000-0000-0000-0000-0000000006f1', 'f2300000-0000-0000-0000-0000000000d6', 'f2300000-0000-0000-0000-0000000000e4', 1),
  -- (back) Squat again after a replacement
  ('f2300000-0000-0000-0000-0000000007f1', 'f2300000-0000-0000-0000-0000000000d8', 'f2300000-0000-0000-0000-0000000000e2', 1);

INSERT INTO public.workout_session_exercise_sets
  (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended, reps_completed, weight_completed)
VALUES
  -- (main) Dumbbell Press: 3 copied sets (2 logged), 1 added unlogged
  ('f2300000-0000-0000-0000-0000000001f1', 1, 0, 0, 120, 8, 30),
  ('f2300000-0000-0000-0000-0000000001f1', 2, 0, 0, 120, 6, 32.5),
  ('f2300000-0000-0000-0000-0000000001f1', 3, 0, 0, 150, NULL, NULL),
  ('f2300000-0000-0000-0000-0000000001f1', 4, NULL, NULL, NULL, NULL, NULL),
  -- (main) Squat: copied sets logged off target / unlogged, 3 added sets
  -- (one logged without a weight, one unlogged)
  ('f2300000-0000-0000-0000-0000000001f2', 1, 5, 100, 180, 6, 105),
  ('f2300000-0000-0000-0000-0000000001f2', 2, 5, 100, 200, NULL, NULL),
  ('f2300000-0000-0000-0000-0000000001f2', 3, NULL, NULL, NULL, 5, 100),
  ('f2300000-0000-0000-0000-0000000001f2', 4, NULL, NULL, NULL, 3, NULL),
  ('f2300000-0000-0000-0000-0000000001f2', 5, NULL, NULL, NULL, NULL, NULL),
  -- (main) Bench Press again: 1 copied, 1 added
  ('f2300000-0000-0000-0000-0000000001f4', 1, 10, 40, 60, 10, 40),
  ('f2300000-0000-0000-0000-0000000001f4', 2, NULL, NULL, NULL, 10, 45),
  -- (main) Cable Fly: 2 of 3 logged
  ('f2300000-0000-0000-0000-0000000001f5', 1, NULL, NULL, NULL, 12, 15),
  ('f2300000-0000-0000-0000-0000000001f5', 2, NULL, NULL, NULL, NULL, NULL),
  ('f2300000-0000-0000-0000-0000000001f5', 3, NULL, NULL, NULL, 12, 17.5),
  -- (main) Leg Press: nothing logged
  ('f2300000-0000-0000-0000-0000000001f6', 1, NULL, NULL, NULL, NULL, NULL),
  -- (last) Squat as planned, Cable Fly logged
  ('f2300000-0000-0000-0000-0000000003f1', 1, 5, 100, 180, 5, 100),
  ('f2300000-0000-0000-0000-0000000003f2', 1, NULL, NULL, NULL, 15, 20),
  -- (skip)
  ('f2300000-0000-0000-0000-0000000004f1', 1, 0, 0, 120, NULL, NULL),
  ('f2300000-0000-0000-0000-0000000004f2', 1, 5, 100, 180, 3, 90),
  ('f2300000-0000-0000-0000-0000000004f2', 2, NULL, NULL, NULL, NULL, NULL),
  ('f2300000-0000-0000-0000-0000000004f3', 1, NULL, NULL, NULL, NULL, NULL),
  -- (open) and (deleted)
  ('f2300000-0000-0000-0000-0000000005f1', 1, 0, 0, 120, 8, 30),
  ('f2300000-0000-0000-0000-0000000006f1', 1, 0, 0, 120, 8, 30),
  -- (back) the replacement zeroed every set's targets, the added ones' too:
  -- a copied set, an added logged set and an added unlogged one
  ('f2300000-0000-0000-0000-0000000007f1', 1, 0, 0, 180, 5, 100),
  ('f2300000-0000-0000-0000-0000000007f1', 2, 0, 0, NULL, 4, 100),
  ('f2300000-0000-0000-0000-0000000007f1', 3, 0, 0, NULL, NULL, NULL);

-- (cap) Squat: 19 copied sets plus 3 added and logged; Dumbbell Press: 22
-- logged; Cable Fly: 21 logged
INSERT INTO public.workout_session_exercise_sets
  (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended, reps_completed, weight_completed)
SELECT 'f2300000-0000-0000-0000-0000000002f1'::uuid, n, 5, 100, 180, 5, 100
FROM generate_series(1, 19) n
UNION ALL
SELECT 'f2300000-0000-0000-0000-0000000002f1'::uuid, 19 + n, NULL, NULL, NULL, 4 + n, 100
FROM generate_series(1, 3) n
UNION ALL
SELECT 'f2300000-0000-0000-0000-0000000002f2'::uuid, n, CASE WHEN n = 1 THEN 0 END, NULL, NULL, n, 20
FROM generate_series(1, 22) n
UNION ALL
SELECT 'f2300000-0000-0000-0000-0000000002f3'::uuid, n, NULL, NULL, NULL, n, 10
FROM generate_series(1, 21) n;

-- Snapshots of the Workouts' rows, to show what a call left unchanged
CREATE TEMP TABLE plan_rows AS
SELECT we.workout_id, we.id, we.exercise_id, we."order",
  wes."order" AS set_order, wes.reps_recommended, wes.weight_recommended,
  wes.rest_recommended
FROM public.workout_exercises we
LEFT JOIN public.workout_exercise_sets wes ON wes.workout_exercise_id = we.id;

CREATE TEMP VIEW current_plan_rows AS
SELECT we.workout_id, we.id, we.exercise_id, we."order",
  wes."order" AS set_order, wes.reps_recommended, wes.weight_recommended,
  wes.rest_recommended
FROM public.workout_exercises we
LEFT JOIN public.workout_exercise_sets wes ON wes.workout_exercise_id = we.id;

-- What the main session offers
CREATE TEMP TABLE expected (name text PRIMARY KEY, value jsonb);
INSERT INTO expected VALUES
  ('main', $${
    "plan": {"id": "f2300000-0000-0000-0000-0000000000a1", "name": "PPL"},
    "workout": {"id": "f2300000-0000-0000-0000-0000000000b1", "name": "Push Day"},
    "changes": [
      {
        "kind": "replace_exercise",
        "exercise": {"id": "f2300000-0000-0000-0000-0000000000e4", "name": "Test Dumbbell Press"},
        "replaced_exercise": {"id": "f2300000-0000-0000-0000-0000000000e1", "name": "Test Bench Press"},
        "sets": [
          {"reps": 8, "weight": 30},
          {"reps": 6, "weight": 32.5},
          {"reps": 6, "weight": 32.5},
          {"reps": 6, "weight": 32.5}
        ]
      },
      {
        "kind": "add_sets",
        "exercise": {"id": "f2300000-0000-0000-0000-0000000000e2", "name": "Test Squat"},
        "sets": [{"reps": 5, "weight": 100}, {"reps": 3, "weight": 0}]
      },
      {
        "kind": "remove_exercise",
        "exercise": {"id": "f2300000-0000-0000-0000-0000000000e3", "name": "Test Dips"}
      },
      {
        "kind": "add_sets",
        "exercise": {"id": "f2300000-0000-0000-0000-0000000000e1", "name": "Test Bench Press"},
        "sets": [{"reps": 10, "weight": 45}]
      },
      {
        "kind": "add_exercise",
        "exercise": {"id": "f2300000-0000-0000-0000-0000000000e5", "name": "Test Cable Fly"},
        "sets": [{"reps": 12, "weight": 15}, {"reps": 12, "weight": 17.5}]
      }
    ]
  }$$),
  ('main applied', $${
    "plan": {"id": "f2300000-0000-0000-0000-0000000000a1", "name": "PPL"},
    "workout": {"id": "f2300000-0000-0000-0000-0000000000b1", "name": "Push Day"},
    "changes": []
  }$$);

GRANT SELECT ON expected TO authenticated;

-- Grants -----------------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.workout_session_plan_changes(uuid, boolean)', 'EXECUTE'),
  'authenticated can execute workout_session_plan_changes'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.workout_session_plan_changes(uuid, boolean)', 'EXECUTE'),
  'anon cannot execute workout_session_plan_changes'
);

SELECT ok(
  NOT has_function_privilege('service_role', 'public.workout_session_plan_changes(uuid, boolean)', 'EXECUTE'),
  'service_role cannot execute workout_session_plan_changes'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.workout_session_plan_changes(uuid, boolean)'::regprocedure
      AND a.grantee = 0
  ),
  'PUBLIC cannot execute workout_session_plan_changes'
);

-- (main) Preview ---------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"user_2PlanChangesOwnerA000000","role":"authenticated"}', true);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d1'),
  (SELECT value FROM expected WHERE name = 'main'),
  '(main) the preview lists every change in Workout order: logged targets, unlogged replacement sets from the last logged one, no weight as 0, unlogged added sets and Exercises left out'
);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d1', false),
  (SELECT value FROM expected WHERE name = 'main'),
  '(main) apply = false is the preview'
);

RESET ROLE;

SELECT set_eq(
  'SELECT * FROM current_plan_rows',
  'SELECT * FROM plan_rows',
  '(main) the preview writes nothing'
);

SELECT is(
  (SELECT plan_changes_applied_at FROM public.workout_sessions WHERE id = 'f2300000-0000-0000-0000-0000000000d1'),
  NULL,
  '(main) the preview does not stamp plan_changes_applied_at'
);

-- (main) Apply -----------------------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d1', true),
  (SELECT value FROM expected WHERE name = 'main'),
  '(main) apply returns the changes the preview listed'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT e.name, we."order"
    FROM public.workout_exercises we
    JOIN public.exercises e ON e.id = we.exercise_id
    WHERE we.workout_id = 'f2300000-0000-0000-0000-0000000000b1'
    ORDER BY we."order"
  $$,
  $$VALUES
    ('Test Dumbbell Press', 1),
    ('Test Squat', 2),
    ('Test Bench Press', 3),
    ('Test Cable Fly', 4)$$,
  '(main) Dips removed, the rest renumbered from 1, Cable Fly appended'
);

SELECT is(
  (SELECT exercise_id FROM public.workout_exercises WHERE id = 'f2300000-0000-0000-0000-0000000001c1'),
  'f2300000-0000-0000-0000-0000000000e4'::uuid,
  '(main) the replacement keeps the Workout Exercise row'
);

SELECT results_eq(
  $$
    SELECT "order", reps_recommended, weight_recommended, rest_recommended
    FROM public.workout_exercise_sets
    WHERE workout_exercise_id = 'f2300000-0000-0000-0000-0000000001c1'
    ORDER BY "order"
  $$,
  $$VALUES (1, 8, 30.00, 120), (2, 6, 32.50, 120), (3, 6, 32.50, 150), (4, 6, 32.50, 150)$$,
  '(main) the replacement''s sets: one per session set, rest of the Plan set at the same position, then of the last one'
);

SELECT results_eq(
  $$
    SELECT "order", reps_recommended, weight_recommended, rest_recommended
    FROM public.workout_exercise_sets
    WHERE workout_exercise_id = 'f2300000-0000-0000-0000-0000000001c2'
    ORDER BY "order"
  $$,
  $$VALUES (1, 5, 100.00, 180), (2, 5, 100.00, 200), (3, 5, 100.00, 200), (4, 3, 0.00, 200)$$,
  '(main) Squat keeps its targets and gets the logged added sets, rest of the set before them'
);

SELECT results_eq(
  $$
    SELECT "order", reps_recommended, weight_recommended, rest_recommended
    FROM public.workout_exercise_sets
    WHERE workout_exercise_id = 'f2300000-0000-0000-0000-0000000001c4'
    ORDER BY "order"
  $$,
  $$VALUES (1, 10, 40.00, 60), (2, 10, 45.00, 60)$$,
  '(main) the second Bench Press gets its own added set, the first is untouched'
);

SELECT results_eq(
  $$
    SELECT wes."order", wes.reps_recommended, wes.weight_recommended, wes.rest_recommended
    FROM public.workout_exercise_sets wes
    JOIN public.workout_exercises we ON we.id = wes.workout_exercise_id
    WHERE we.workout_id = 'f2300000-0000-0000-0000-0000000000b1'
      AND we.exercise_id = 'f2300000-0000-0000-0000-0000000000e5'
    ORDER BY wes."order"
  $$,
  $$VALUES (1, 12, 15.00, 90), (2, 12, 17.50, 90)$$,
  '(main) the added Exercise gets its logged sets with 90 s rest'
);

SELECT is(
  (SELECT plan_changes_applied_at FROM public.workout_sessions WHERE id = 'f2300000-0000-0000-0000-0000000000d1'),
  now(),
  '(main) apply stamps plan_changes_applied_at'
);

SELECT set_eq(
  $$SELECT * FROM current_plan_rows WHERE workout_id <> 'f2300000-0000-0000-0000-0000000000b1'$$,
  $$SELECT * FROM plan_rows WHERE workout_id <> 'f2300000-0000-0000-0000-0000000000b1'$$,
  '(main) other Workouts are untouched'
);

-- (main) After the apply -------------------------------------------------------
CREATE TEMP TABLE applied_rows AS SELECT * FROM current_plan_rows;

SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d1', true),
  (SELECT value FROM expected WHERE name = 'main applied'),
  '(main) a second apply returns no changes'
);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d1'),
  (SELECT value FROM expected WHERE name = 'main applied'),
  '(main) a preview after the apply returns no changes'
);

RESET ROLE;

SELECT set_eq(
  'SELECT * FROM current_plan_rows',
  'SELECT * FROM applied_rows',
  '(main) a second apply writes nothing'
);

-- (cap) At most 20 sets per Workout Exercise -----------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT jsonb_agg(jsonb_build_object('kind', c ->> 'kind', 'sets', jsonb_array_length(c -> 'sets')))
    FROM jsonb_array_elements(public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d2') -> 'changes') c
  ),
  $$[
    {"kind": "add_sets", "sets": 1},
    {"kind": "replace_exercise", "sets": 20},
    {"kind": "add_exercise", "sets": 20}
  ]$$::jsonb,
  '(cap) added sets, a replacement and an added Exercise stop at 20 sets'
);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d2') -> 'changes' -> 0 -> 'sets',
  '[{"reps": 5, "weight": 100}]'::jsonb,
  '(cap) the first added set is the one kept'
);

SELECT lives_ok(
  $$SELECT public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d2', true)$$,
  '(cap) apply'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT we."order", count(wes.id)
    FROM public.workout_exercises we
    JOIN public.workout_exercise_sets wes ON wes.workout_exercise_id = we.id
    WHERE we.workout_id = 'f2300000-0000-0000-0000-0000000000b2'
    GROUP BY we."order"
    ORDER BY we."order"
  $$,
  $$VALUES (1, 20::bigint), (2, 20::bigint), (3, 20::bigint)$$,
  '(cap) every Workout Exercise ends with 20 sets'
);

-- (last) Delete the last Exercise, then add one: a replacement ---------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d3') -> 'changes',
  $$[{
    "kind": "replace_exercise",
    "exercise": {"id": "f2300000-0000-0000-0000-0000000000e5", "name": "Test Cable Fly"},
    "replaced_exercise": {"id": "f2300000-0000-0000-0000-0000000000e3", "name": "Test Dips"},
    "sets": [{"reps": 15, "weight": 20}]
  }]$$::jsonb,
  '(last) the added Exercise in the deleted one''s slot reads as a replacement'
);

SELECT lives_ok(
  $$SELECT public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d3', true)$$,
  '(last) apply'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT we.id, we."order", wes."order", wes.reps_recommended, wes.weight_recommended, wes.rest_recommended
    FROM public.workout_exercises we
    JOIN public.workout_exercise_sets wes ON wes.workout_exercise_id = we.id
    WHERE we.workout_id = 'f2300000-0000-0000-0000-0000000000b3'
    ORDER BY we."order", wes."order"
  $$,
  $$VALUES
    ('f2300000-0000-0000-0000-0000000003c1'::uuid, 1, 1, 5, 100.00, 180),
    ('f2300000-0000-0000-0000-0000000003c2'::uuid, 2, 1, 15, 20.00, 75)$$,
  '(last) the slot keeps its row and the Plan''s rest'
);

-- (skip) Nothing qualifies -----------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d4'),
  $${
    "plan": {"id": "f2300000-0000-0000-0000-0000000000a1", "name": "PPL"},
    "workout": {"id": "f2300000-0000-0000-0000-0000000000b4", "name": "Skip Day"},
    "changes": []
  }$$::jsonb,
  '(skip) an unlogged replacement, off-target logged values, an unlogged added set and an unlogged added Exercise are no changes'
);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d4', true) -> 'changes',
  '[]'::jsonb,
  '(skip) apply with no changes returns none'
);

RESET ROLE;

SELECT set_eq(
  $$SELECT * FROM current_plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b4'$$,
  $$SELECT * FROM plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b4'$$,
  '(skip) apply with no changes writes nothing'
);

-- (open) An open session -------------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d5'),
  $${
    "plan": {"id": "f2300000-0000-0000-0000-0000000000a1", "name": "PPL"},
    "workout": {"id": "f2300000-0000-0000-0000-0000000000b5", "name": "Open Day"},
    "changes": []
  }$$::jsonb,
  '(open) an open session has no changes'
);

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d5', true) -> 'changes',
  '[]'::jsonb,
  '(open) apply on an open session returns no changes'
);

RESET ROLE;

SELECT set_eq(
  $$SELECT * FROM current_plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b5'$$,
  $$SELECT * FROM plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b5'$$,
  '(open) apply on an open session writes nothing'
);

SELECT is(
  (SELECT plan_changes_applied_at FROM public.workout_sessions WHERE id = 'f2300000-0000-0000-0000-0000000000d5'),
  NULL,
  '(open) apply on an open session does not stamp plan_changes_applied_at'
);

-- (deleted) A soft-deleted Plan --------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d6', true),
  '{"plan": null, "workout": null, "changes": []}'::jsonb,
  '(deleted) a soft-deleted Plan has no changes'
);

RESET ROLE;

SELECT set_eq(
  $$SELECT * FROM current_plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b6'$$,
  $$SELECT * FROM plan_rows WHERE workout_id = 'f2300000-0000-0000-0000-0000000000b6'$$,
  '(deleted) apply on a soft-deleted Plan writes nothing'
);

-- (gone) A NULL workout_id -------------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d7', true),
  '{"plan": null, "workout": null, "changes": []}'::jsonb,
  '(gone) a session whose Workout was deleted has no changes'
);

RESET ROLE;

SELECT is(
  (SELECT plan_changes_applied_at FROM public.workout_sessions WHERE id = 'f2300000-0000-0000-0000-0000000000d7'),
  NULL,
  '(gone) apply does not stamp plan_changes_applied_at'
);

-- (back) Switched back to the original Exercise -------------------------------
SET LOCAL ROLE authenticated;

SELECT is(
  public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d8', true) -> 'changes',
  $$[{
    "kind": "add_sets",
    "exercise": {"id": "f2300000-0000-0000-0000-0000000000e2", "name": "Test Squat"},
    "sets": [{"reps": 4, "weight": 100}]
  }]$$::jsonb,
  '(back) a logged set added before a replacement and a switch back still counts as added'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT "order", reps_recommended, weight_recommended, rest_recommended
    FROM public.workout_exercise_sets
    WHERE workout_exercise_id = 'f2300000-0000-0000-0000-0000000007c1'
    ORDER BY "order"
  $$,
  $$VALUES (1, 5, 100.00, 180), (2, 4, 100.00, 180)$$,
  '(back) the Plan keeps its set and gets the added one'
);

-- Not found --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"user_2PlanChangesOtherB000000","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d2')$$,
  'P0001',
  'Session not found or not authorized',
  'another User''s session is not found'
);

SELECT throws_ok(
  $$SELECT public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000d4', true)$$,
  'P0001',
  'Session not found or not authorized',
  'another User cannot apply'
);

SELECT set_config('request.jwt.claims', '{"sub":"user_2PlanChangesOwnerA000000","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.workout_session_plan_changes('f2300000-0000-0000-0000-0000000000ff')$$,
  'P0001',
  'Session not found or not authorized',
  'a missing session is not found'
);

RESET ROLE;

-- Locks --------------------------------------------------------------------------
-- Two sessions can't run in one pgTAP transaction, so the lock order is read
-- off the definition: ROW EXCLUSIVE on workout_sessions and the Plan's child
-- tables (in deleteUserData's order), then the Plan row, the Workout row, its
-- Exercises' rows and the session row (finish_workout_session's order), so a concurrent apply
-- waits for the first and then sees plan_changes_applied_at.
SELECT matches(
  pg_get_functiondef('public.workout_session_plan_changes(uuid, boolean)'::regprocedure),
  '(?s)LOCK TABLE public\.workout_sessions, public\.workouts,\s+public\.workout_exercises, public\.workout_exercise_sets\s+IN ROW EXCLUSIVE MODE.*FROM public\.plans p.*FOR NO KEY UPDATE;.*FROM public\.workouts w.*FOR NO KEY UPDATE OF w;.*FROM public\.workout_exercises we.*FOR NO KEY UPDATE;.*FROM public\.workout_sessions ws.*FOR NO KEY UPDATE;.*IF workout_session_plan_changes\.apply THEN',
  'tables, then the Plan, Workout, Workout Exercise and session rows are locked before anything is written'
);

SELECT * FROM finish();
ROLLBACK;
