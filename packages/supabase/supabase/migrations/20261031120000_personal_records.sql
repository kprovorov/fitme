-- Personal records (ADR 0015, FIT-465): the records a Workout Session earned
-- when it was finished, one row per Exercise that beat the User's earlier
-- results, retained from then on. A row is the evidence: the Exercise (by
-- slug, ADR 0010) and the best result, its weight in the User's unit (the
-- measurement-system conversion converts it like every other stored weight,
-- and never adds or removes a row). @fitme/services' finishWorkoutSession
-- writes them.
CREATE TABLE public.personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  workout_session_id uuid NOT NULL
    REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_slug text NOT NULL,
  -- weight: a higher weight than any earlier one; reps: more reps at the
  -- earlier highest weight
  kind text NOT NULL CHECK (kind IN ('weight', 'reps')),
  -- 0 is a bodyweight record
  weight numeric(8, 2) NOT NULL CHECK (weight >= 0),
  reps integer NOT NULL CHECK (reps > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One record per Exercise per Workout Session, so a repeated award writes
  -- nothing
  CONSTRAINT personal_records_session_exercise_key
    UNIQUE (workout_session_id, exercise_slug)
);

CREATE INDEX personal_records_user_id_idx ON public.personal_records(user_id);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

-- Own rows only, and only for the caller's own Workout Session.
CREATE POLICY "personal_records_all" ON public.personal_records
  FOR ALL USING (user_id = (SELECT public.current_user_id()))
  WITH CHECK (
    user_id = (SELECT public.current_user_id())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = personal_records.workout_session_id
        AND ws.user_id = (SELECT public.current_user_id())
    )
  );

-- The app tables' grants (20261016120000_explicit_table_grants.sql); RLS
-- decides the rows.
GRANT ALL ON TABLE public.personal_records TO anon, authenticated, service_role;

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.personal_records
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();
