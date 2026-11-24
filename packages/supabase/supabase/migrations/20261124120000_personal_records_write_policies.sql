-- One permissive policy per command on personal_records (FIT-778):
-- personal_records_backend was FOR ALL, so every read evaluated it next to
-- personal_records_select, which already passes whenever it does. Its clauses
-- are split, unchanged, into a policy per write command; reads stay on
-- personal_records_select.
DROP POLICY "personal_records_backend" ON public.personal_records;

CREATE POLICY "personal_records_backend_insert" ON public.personal_records
  FOR INSERT TO authenticated
  WITH CHECK (
    session_user = 'fitme'
    AND user_id = (SELECT public.current_user_id())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = personal_records.workout_session_id
        AND ws.user_id = (SELECT public.current_user_id())
        AND ws.finished_at IS NOT NULL
    )
  );

CREATE POLICY "personal_records_backend_update" ON public.personal_records
  FOR UPDATE TO authenticated
  USING (session_user = 'fitme' AND user_id = (SELECT public.current_user_id()))
  WITH CHECK (
    session_user = 'fitme'
    AND user_id = (SELECT public.current_user_id())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = personal_records.workout_session_id
        AND ws.user_id = (SELECT public.current_user_id())
        AND ws.finished_at IS NOT NULL
    )
  );

CREATE POLICY "personal_records_backend_delete" ON public.personal_records
  FOR DELETE TO authenticated
  USING (session_user = 'fitme' AND user_id = (SELECT public.current_user_id()));
