-- deleteUserData in packages/services (FIT-102, ADR 0004).
--
-- The TypeScript port of delete_user_data runs inside withService, as
-- service_role, instead of as the SECURITY DEFINER function's owner. Grant
-- service_role what that function used to cover:
--
--   * retiring the id: reading and inserting private.retired_user_ids
--     (service_role bypasses its RLS; it never needs UPDATE or DELETE there);
--   * taking SHARE ROW EXCLUSIVE locks on the User-owned tables and their
--     children, which needs UPDATE, DELETE or TRUNCATE, and deleting the root
--     rows. Supabase's default privileges already give service_role these on
--     public tables; granting them here keeps the service from depending on
--     that default.
--
-- delete_user_data stays until the webhook cutover; the retired-id rules
-- (current_user_id(), the reject_retired_user_id triggers) are unchanged.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT ON TABLE private.retired_user_ids TO service_role;

GRANT SELECT, DELETE ON TABLE
  public.profiles, public.plans, public.workout_sessions, public.conversations,
  public.workouts, public.workout_exercises, public.workout_exercise_sets,
  public.workout_session_exercises, public.workout_session_exercise_sets,
  public.messages
  TO service_role;
