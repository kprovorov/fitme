-- Drop the legacy RPCs (FIT-339). Every write the app makes goes through the
-- Public API, backed by @fitme/services (ADR 0004, ADR 0011); these were only
-- kept for installed builds older than that switch, which the minimum version
-- gate (MIN_APP_VERSION 2.2.0, FIT-338) has cut off.
--
-- Kept: public.current_user_id() (the RLS helper), the triggers
-- public.deactivate_deleted_plan and private.reject_retired_user_id, and
-- workout_sessions.plan_changes_applied_at with the indexes from
-- 20261021120000, which the Plan Update service still uses.

DROP FUNCTION public.activate_plan(uuid);
DROP FUNCTION public.create_plan(jsonb);
DROP FUNCTION public.update_plan(uuid, jsonb, text);
DROP FUNCTION public.convert_measurement_system(text);
DROP FUNCTION public.start_workout_session(uuid);
DROP FUNCTION public.finish_workout_session(uuid);
DROP FUNCTION public.workout_session_plan_changes(uuid, boolean);

-- Only workout_session_plan_changes called it.
DROP FUNCTION private.exercise_name_from_slug(text);
