-- Set numbering must start at 1. AI-generated plans occasionally emitted
-- 0-based "order" values for sets, which were then cloned into workout
-- sessions and shown to users as "#0". Renumber every set contiguously
-- from 1 within its parent, preserving the existing relative order.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_exercise_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_exercise_sets
)
UPDATE public.workout_exercise_sets s
SET "order" = ranked.new_order
FROM ranked
WHERE s.id = ranked.id
  AND s."order" <> ranked.new_order;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workout_session_exercise_id
      ORDER BY "order", created_at, id
    ) AS new_order
  FROM public.workout_session_exercise_sets
)
UPDATE public.workout_session_exercise_sets s
SET "order" = ranked.new_order
FROM ranked
WHERE s.id = ranked.id
  AND s."order" <> ranked.new_order;
