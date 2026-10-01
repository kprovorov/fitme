-- Enforce 1-based "order" at the database level. Existing rows were
-- renumbered from 1 by 20260930000000_normalize_order.sql, so validation
-- passes.

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_order_positive CHECK ("order" >= 1);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_order_positive CHECK ("order" >= 1);

ALTER TABLE public.workout_exercise_sets
  ADD CONSTRAINT workout_exercise_sets_order_positive CHECK ("order" >= 1);

ALTER TABLE public.workout_session_exercises
  ADD CONSTRAINT workout_session_exercises_order_positive CHECK ("order" >= 1);

ALTER TABLE public.workout_session_exercise_sets
  ADD CONSTRAINT workout_session_exercise_sets_order_positive CHECK ("order" >= 1);
