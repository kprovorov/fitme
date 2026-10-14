-- The Coach's EVE sessions per User (FIT-117, ADR 0005).
--
-- EVE keeps each Coach Conversation as a durable session, but has no way to
-- list the sessions a User owns, and account deletion has to reset them
-- (FIT-121). apps/coach records every session id here, as the User, inside
-- asUser, before each of the session's turns runs. Recording is idempotent:
-- the session id is the key.
CREATE TABLE public.coach_sessions (
  session_id text PRIMARY KEY,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coach_sessions_user_id_idx ON public.coach_sessions(user_id);

ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;

-- A User sees and records only their own sessions; nothing updates a row, and
-- only service_role (account deletion) removes them.
CREATE POLICY "coach_sessions_select" ON public.coach_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_user_id()));

CREATE POLICY "coach_sessions_insert" ON public.coach_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_user_id()));

REVOKE ALL ON TABLE public.coach_sessions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.coach_sessions TO authenticated;
GRANT SELECT, DELETE ON TABLE public.coach_sessions TO service_role;

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.coach_sessions
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();
