-- Weekly goals (ADR 0015, FIT-463): every change of a User's Weekly goal, the
-- active Plan's training frequency, as an append-only log.
--
-- A week's goal depends on where the User's Monday falls, which only the
-- device knows (its current timezone), so the log keeps instants, not weeks:
-- the first change starts tracking and applies to the week it was recorded
-- in (the first tracked, partial week), every later one from the Monday after
-- it. Rows are never updated, so a week's established goal is never
-- rewritten. `target` NULL records that the User has no active Plan any more
-- (an unknown goal from the next Monday on). @fitme/services writes it
-- (recordWeeklyGoal) after every write that can change the active Plan or its
-- frequency, inside the same asUser transaction.
CREATE TABLE public.weekly_goal_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  target smallint CHECK (target > 0)
);

CREATE INDEX weekly_goal_changes_user_id_recorded_at_idx
  ON public.weekly_goal_changes (user_id, recorded_at);

ALTER TABLE public.weekly_goal_changes ENABLE ROW LEVEL SECURITY;

-- A User reads and records only their own changes; nothing updates a row, and
-- only service_role (account deletion) removes them.
CREATE POLICY "weekly_goal_changes_select" ON public.weekly_goal_changes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_user_id()));

CREATE POLICY "weekly_goal_changes_insert" ON public.weekly_goal_changes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_user_id()));

REVOKE ALL ON TABLE public.weekly_goal_changes FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.weekly_goal_changes TO authenticated;
GRANT ALL ON TABLE public.weekly_goal_changes TO service_role;

CREATE TRIGGER reject_retired_user_id
  BEFORE INSERT OR UPDATE OF user_id ON public.weekly_goal_changes
  FOR EACH ROW EXECUTE FUNCTION private.reject_retired_user_id();

-- Tracking starts now for every User with an active Plan, so their first
-- (partial) week is the one this migration runs in; earlier weeks stay
-- unknown rather than take today's frequency. Users without one start when
-- they next activate a Plan. Retired ids hold no live Plan. A frequency
-- outside 1-7 (none should exist) counts as no goal.
INSERT INTO public.weekly_goal_changes (user_id, target)
SELECT DISTINCT ON (p.user_id) p.user_id, p.frequency
FROM public.plans p
WHERE p.is_active
  AND p.deleted_at IS NULL
  AND p.frequency BETWEEN 1 AND 7
  AND NOT EXISTS (
    SELECT 1 FROM public.weekly_goal_changes w WHERE w.user_id = p.user_id
  )
ORDER BY p.user_id, p.created_at DESC NULLS LAST, p.id;
