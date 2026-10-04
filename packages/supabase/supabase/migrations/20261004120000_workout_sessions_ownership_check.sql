-- Fix: workout_sessions RLS must not accept another user's workout or plan.
--
-- Since 20260417000000_fix_workout_sessions_cascade.sql the policy only checks
-- user_id = auth.uid(). Without an explicit WITH CHECK, that same expression is
-- used for writes, so a user could insert (or update) a session row of their
-- own that points at someone else's workout_id or plan_id. Those references
-- leak into the other user's data paths (e.g. the open-session unique index on
-- workout_id, finish_workout_session rotating the referenced workout's plan).
--
-- Changes:
--   1. Keep USING (user_id = auth.uid()) for reads, updates and deletes
--   2. Add an explicit WITH CHECK for inserts and updates that requires:
--      - user_id = auth.uid() (restated: once WITH CHECK is given, Postgres
--        no longer falls back to USING for the new row)
--      - workout_id is NULL or belongs to a plan the caller owns
--      - plan_id is NULL or is a plan the caller owns
--
-- NULL references stay allowed: workout_id becomes NULL when the workout
-- template is deleted (ON DELETE SET NULL). Soft-deleted plans (deleted_at set)
-- still count as owned, so sessions of a deleted plan remain updatable.
DROP POLICY "workout_sessions_all" ON public.workout_sessions;

CREATE POLICY "workout_sessions_all" ON public.workout_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      workout_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.workouts w
        JOIN public.plans p ON p.id = w.plan_id
        WHERE w.id = workout_sessions.workout_id
          AND p.user_id = auth.uid()
      )
    )
    AND (
      plan_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plans p
        WHERE p.id = workout_sessions.plan_id
          AND p.user_id = auth.uid()
      )
    )
  );
