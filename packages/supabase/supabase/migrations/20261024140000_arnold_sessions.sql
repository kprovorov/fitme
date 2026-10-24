-- Arnold's EVE sessions per User: coach_sessions becomes arnold_sessions
-- (FIT-291, ADR 0012). A rename only: rows (tombstones included), RLS,
-- grants and the reject_retired_user_id trigger carry over with the table.
-- Its policies, index and primary key take the new name too.
ALTER TABLE public.coach_sessions RENAME TO arnold_sessions;

ALTER TABLE public.arnold_sessions
  RENAME CONSTRAINT coach_sessions_pkey TO arnold_sessions_pkey;

ALTER INDEX public.coach_sessions_user_id_idx
  RENAME TO arnold_sessions_user_id_idx;

ALTER POLICY "coach_sessions_select" ON public.arnold_sessions
  RENAME TO "arnold_sessions_select";

ALTER POLICY "coach_sessions_insert" ON public.arnold_sessions
  RENAME TO "arnold_sessions_insert";
