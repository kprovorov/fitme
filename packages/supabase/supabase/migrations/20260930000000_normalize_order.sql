-- "order" must start at 1. AI-generated plans occasionally emitted 0-based
-- "order" values, which were then cloned into workout sessions and shown to
-- users as "#0". Renumber every row contiguously from 1 within its parent,
-- preserving the existing relative order. This runs before the CHECK
-- constraints added in 20260930000002_add_order_check_constraints.sql.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY plan_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workouts
)
UPDATE public.workouts t
SET "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id
  AND t."order" <> ranked.new_order;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_exercises
)
UPDATE public.workout_exercises t
SET "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id
  AND t."order" <> ranked.new_order;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_exercise_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_exercise_sets
)
UPDATE public.workout_exercise_sets t
SET "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id
  AND t."order" <> ranked.new_order;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_session_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_session_exercises
)
UPDATE public.workout_session_exercises t
SET "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id
  AND t."order" <> ranked.new_order;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_session_exercise_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_session_exercise_sets
)
UPDATE public.workout_session_exercise_sets t
SET "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id
  AND t."order" <> ranked.new_order;
