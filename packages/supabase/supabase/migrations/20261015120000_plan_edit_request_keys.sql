-- Request keys for the Coach's appending Plan edits (FIT-122).
--
-- A durable EVE step can re-run after its tool already committed, and adding
-- an Exercise to a Workout or a set to an Exercise appends a new row each
-- time. apps/coach derives a key per call from the step (session, turn, step
-- position, tool and input) and packages/services stores it on the row it
-- appends, so a repeated call finds that row instead of adding another.
-- Rows written any other way leave it NULL.
ALTER TABLE public.workout_exercises ADD COLUMN request_key text;
ALTER TABLE public.workout_exercise_sets ADD COLUMN request_key text;

CREATE UNIQUE INDEX workout_exercises_request_key_key
  ON public.workout_exercises(request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX workout_exercise_sets_request_key_key
  ON public.workout_exercise_sets(request_key) WHERE request_key IS NOT NULL;
