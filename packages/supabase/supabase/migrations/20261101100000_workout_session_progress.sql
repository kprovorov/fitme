-- Server-maintained qualification for progress reads. Keep one count per
-- Exercise, then propagate deltas to its Session. No read or write rescans
-- rejected Sets, and clients cannot forge either level of the aggregate.
-- Lock in the source tables' parent-to-child order while backfilling.
BEGIN;
LOCK TABLE public.workout_sessions, public.workout_session_exercises,
  public.workout_session_exercise_sets IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.workout_session_progress (
  workout_session_id uuid PRIMARY KEY REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  completed_set_count bigint NOT NULL DEFAULT 0 CHECK (completed_set_count >= 0)
);
CREATE INDEX workout_session_progress_qualifying_idx
  ON public.workout_session_progress (user_id, started_at, finished_at)
  WHERE finished_at IS NOT NULL AND completed_set_count > 0;
ALTER TABLE public.workout_session_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY workout_session_progress_select ON public.workout_session_progress
  FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_user_id()));
REVOKE ALL ON public.workout_session_progress FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workout_session_progress TO authenticated, service_role;

CREATE TABLE private.workout_session_exercise_progress (
  workout_session_exercise_id uuid PRIMARY KEY
    REFERENCES public.workout_session_exercises(id) ON DELETE CASCADE,
  workout_session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  completed_set_count bigint NOT NULL DEFAULT 0 CHECK (completed_set_count >= 0)
);
CREATE INDEX workout_session_exercise_progress_session_idx
  ON private.workout_session_exercise_progress (workout_session_id);
REVOKE ALL ON private.workout_session_exercise_progress FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.workout_session_exercise_progress
  (workout_session_exercise_id, workout_session_id, completed_set_count)
SELECT e.id, e.workout_session_id, count(s.id)
FROM public.workout_session_exercises e
LEFT JOIN public.workout_session_exercise_sets s
  ON s.workout_session_exercise_id = e.id AND s.reps_completed > 0
GROUP BY e.id, e.workout_session_id;

INSERT INTO public.workout_session_progress
  (workout_session_id, user_id, started_at, finished_at, completed_set_count)
SELECT ws.id, ws.user_id, ws.started_at, ws.finished_at,
  coalesce(sum(e.completed_set_count), 0)
FROM public.workout_sessions ws
LEFT JOIN private.workout_session_exercise_progress e ON e.workout_session_id = ws.id
GROUP BY ws.id;

-- Session metadata follows its source row, including a User rekey. Counts
-- are changed only by the Exercise-cache trigger below.
CREATE FUNCTION private.sync_workout_session_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.workout_session_progress
    (workout_session_id, user_id, started_at, finished_at)
  VALUES (NEW.id, NEW.user_id, NEW.started_at, NEW.finished_at)
  ON CONFLICT (workout_session_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at;
  RETURN NEW;
END;
$$;

-- Moving an Exercise moves its cached count, without reading its Sets.
-- Deleting source Exercises/Sessions deletes their cache rows by FK cascade.
CREATE FUNCTION private.sync_workout_session_exercise_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO private.workout_session_exercise_progress
    (workout_session_exercise_id, workout_session_id)
  VALUES (NEW.id, NEW.workout_session_id)
  ON CONFLICT (workout_session_exercise_id) DO UPDATE SET
    workout_session_id = EXCLUDED.workout_session_id;
  RETURN NEW;
END;
$$;

-- Atomically update cached Exercise counts. The cache row serializes a Set
-- write with Exercise moves/deletes; UPDATE uses the row's current Session.
-- On cascade deletion the Exercise cache may already be gone, which is a
-- no-op: deleting that cache already propagated its entire remaining count.
CREATE FUNCTION private.count_workout_session_logged_sets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_exercise uuid;
  new_exercise uuid;
  old_count bigint := 0;
  new_count bigint := 0;
  change record;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.reps_completed > 0 THEN
    old_exercise := OLD.workout_session_exercise_id;
    old_count := 1;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.reps_completed > 0 THEN
    new_exercise := NEW.workout_session_exercise_id;
    new_count := 1;
  END IF;
  FOR change IN
    SELECT exercise_id, sum(delta) AS delta
    FROM (VALUES (old_exercise, -old_count), (new_exercise, new_count)) AS deltas(exercise_id, delta)
    WHERE exercise_id IS NOT NULL
    GROUP BY exercise_id HAVING sum(delta) <> 0 ORDER BY exercise_id
  LOOP
    UPDATE private.workout_session_exercise_progress
      SET completed_set_count = completed_set_count + change.delta
      WHERE workout_session_exercise_id = change.exercise_id;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Propagate only the delta, locking destination Sessions in UUID order for
-- moves. Atomic increments avoid lost counts under concurrent Set writes.
CREATE FUNCTION private.count_workout_session_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_session uuid;
  new_session uuid;
  old_count bigint := 0;
  new_count bigint := 0;
  change record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_session := OLD.workout_session_id;
    old_count := OLD.completed_set_count;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_session := NEW.workout_session_id;
    new_count := NEW.completed_set_count;
  END IF;
  FOR change IN
    SELECT session_id, sum(delta) AS delta
    FROM (VALUES (old_session, -old_count), (new_session, new_count)) AS deltas(session_id, delta)
    WHERE session_id IS NOT NULL
    GROUP BY session_id HAVING sum(delta) <> 0 ORDER BY session_id
  LOOP
    UPDATE public.workout_session_progress
      SET completed_set_count = completed_set_count + change.delta
      WHERE workout_session_id = change.session_id;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_workout_session_progress() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_workout_session_exercise_progress() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.count_workout_session_logged_sets() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.count_workout_session_progress() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sync_workout_session_progress
  AFTER INSERT OR UPDATE OF user_id, started_at, finished_at ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION private.sync_workout_session_progress();
CREATE TRIGGER sync_workout_session_exercise_progress
  AFTER INSERT OR UPDATE OF workout_session_id ON public.workout_session_exercises
  FOR EACH ROW EXECUTE FUNCTION private.sync_workout_session_exercise_progress();
CREATE TRIGGER count_workout_session_logged_sets
  AFTER INSERT OR UPDATE OF workout_session_exercise_id, reps_completed OR DELETE
  ON public.workout_session_exercise_sets
  FOR EACH ROW EXECUTE FUNCTION private.count_workout_session_logged_sets();
CREATE TRIGGER count_workout_session_progress
  AFTER INSERT OR UPDATE OR DELETE ON private.workout_session_exercise_progress
  FOR EACH ROW EXECUTE FUNCTION private.count_workout_session_progress();
COMMIT;
