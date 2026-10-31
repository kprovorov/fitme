-- Completion is retained even when every session/award is later deleted:
-- retrying must never reinterpret already evaluated History after conversion.
-- This creates storage only; no production History is initialized here.
CREATE TABLE public.personal_record_initializations (
  user_id text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_record_initializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personal_record_initializations_select"
  ON public.personal_record_initializations FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_user_id()));
CREATE POLICY "personal_record_initializations_backend_insert"
  ON public.personal_record_initializations FOR INSERT TO authenticated
  WITH CHECK (session_user = 'fitme' AND user_id = (SELECT public.current_user_id()));

REVOKE ALL ON public.personal_record_initializations FROM anon, authenticated;
GRANT SELECT, INSERT ON public.personal_record_initializations TO authenticated;
GRANT ALL ON public.personal_record_initializations TO service_role;

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.personal_record_initializations
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();
