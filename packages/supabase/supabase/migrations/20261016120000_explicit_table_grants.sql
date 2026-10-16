-- Explicit table grants on public (FIT-95).
--
-- Until now no migration granted anon, authenticated or service_role anything
-- on most app tables: they relied on Supabase's default privileges
-- (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role). A stack without that default ends up with
-- RLS policies but no grants, so PostgREST and asUser fail with "permission
-- denied" before RLS runs. Local stacks and CI now drop the default
-- (supabase/roles.sql) so a missing grant shows up there.
--
-- These are exactly the grants the hosted project has today (checked against
-- its pg_class.relacl), so this migration changes nothing there and never
-- widens access; it only makes every stack match it. RLS still decides which
-- rows each role sees. coach_sessions already grants anon and authenticated
-- their narrower set in 20261014160000_coach_sessions.sql; only service_role's
-- full set, which it had from the default, is added here.
-- tests/database/table_grants.test.sql checks every public table.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE
  public.conversations,
  public.exercises,
  public.messages,
  public.plans,
  public.profiles,
  public.workout_exercise_sets,
  public.workout_exercises,
  public.workout_session_exercise_sets,
  public.workout_session_exercises,
  public.workout_sessions,
  public.workouts
  TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.coach_sessions TO service_role;
