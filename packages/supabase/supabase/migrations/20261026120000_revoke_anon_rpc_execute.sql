-- anon may no longer call the legacy SECURITY DEFINER RPCs (FIT-326,
-- Supabase advisor lint 0028 anon_security_definer_function_executable).
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and Supabase's default
-- privileges grant it to anon as well, so anyone holding the publishable key
-- could call these through /rest/v1/rpc/* and run owner-privileged code. Their
-- bodies resolve the caller through current_user_id(), NULL for anon, so no
-- call reached a User's data, but nothing kept a later change from doing so.
-- update_plan and workout_session_plan_changes were already revoked.
--
-- authenticated and service_role keep EXECUTE: installed builds older than
-- the Public API switch still call these RPCs with the User's Clerk token
-- (packages/services), until the minimum version gate cuts them off.
--
-- current_user_id() keeps its grants. Every app table's RLS policy targets
-- PUBLIC and calls it, and anon holds the table grants
-- (20261016120000_explicit_table_grants.sql), so revoking it would turn an
-- anon read of any app table from no rows into "permission denied for
-- function current_user_id". It returns NULL for anon and reveals nothing.

REVOKE EXECUTE ON FUNCTION
  public.activate_plan(uuid),
  public.convert_measurement_system(text),
  public.create_plan(jsonb),
  public.finish_workout_session(uuid),
  public.start_workout_session(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.activate_plan(uuid),
  public.convert_measurement_system(text),
  public.create_plan(jsonb),
  public.finish_workout_session(uuid),
  public.start_workout_session(uuid)
TO authenticated, service_role;
