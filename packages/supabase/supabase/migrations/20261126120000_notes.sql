-- Notes (GLOSSARY.md, project "Notes on Exercises and sets"): a User's
-- private plain text, at most 500 characters, on a logged Workout Session set
-- or on an Exercise. Nothing reads or writes them yet: @fitme/services comes
-- next. The services trim the text and treat blank as no note, so the
-- database refuses an empty or blank one, and anything over the limit, in
-- both places.

-- Fail fast rather than queue behind a long transaction while holding the
-- ACCESS EXCLUSIVE lock ADD COLUMN asks for, which would stall every set read
-- and write behind it; a timed-out migration is simply run again.
SET LOCAL lock_timeout = '5s';

-- A set's note goes with its set, so removing the set, its Exercise or its
-- Workout Session removes the note with no extra code. A nullable column with
-- no default is a catalog change only: no table rewrite. The CHECK is added
-- NOT VALID so adding it doesn't scan the table under that lock; every row
-- holds NULL at this point, so it holds for all of them, and every new insert
-- and update is checked. The existing own-rows policy
-- (workout_session_exercise_sets_all) and the table's grants cover the new
-- column. The Progress trigger (count_workout_session_logged_sets) fires on
-- reps_completed and workout_session_exercise_id only, so a note write never
-- fires it.
ALTER TABLE public.workout_session_exercise_sets
  ADD COLUMN note text;

ALTER TABLE public.workout_session_exercise_sets
  ADD CONSTRAINT workout_session_exercise_sets_note_check
  CHECK (char_length(note) <= 500 AND note ~ '[^[:space:]]') NOT VALID;

-- One note per User and Exercise, the same in every Plan and Workout.
-- exercise_slug is any string, as everywhere else (ADR 0010). Clearing a note
-- deletes its row, so there's no empty one.
CREATE TABLE public.exercise_notes (
  user_id text NOT NULL,
  exercise_slug text NOT NULL,
  note text NOT NULL
    CONSTRAINT exercise_notes_note_check
    CHECK (char_length(note) <= 500 AND note ~ '[^[:space:]]'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_slug)
);

ALTER TABLE public.exercise_notes ENABLE ROW LEVEL SECURITY;

-- A User reads, writes and clears only their own notes
CREATE POLICY "exercise_notes_all" ON public.exercise_notes
  FOR ALL TO authenticated
  USING (user_id = (SELECT public.current_user_id()))
  WITH CHECK (user_id = (SELECT public.current_user_id()));

-- Nothing for anon (the Data API is closed, ADR 0019). service_role gets
-- everything, as account deletion needs: deleteUserData locks the table and
-- deletes its rows once the services take it up (FIT-823, after this
-- migration is on production).
REVOKE ALL ON TABLE public.exercise_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exercise_notes TO authenticated;
GRANT ALL ON TABLE public.exercise_notes TO service_role;

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.exercise_notes
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();
