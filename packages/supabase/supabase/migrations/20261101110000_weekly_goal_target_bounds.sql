-- Services and the API permit 1-7 Sessions per week. Enforce the same
-- bound for direct Data API writes. Keep legacy append-only evidence
-- intact: reads treat an old out-of-range value as an unknown goal.
-- NOT VALID still rejects every new invalid row, without failing a
-- deployment because a caller previously inserted an oversized target.
ALTER TABLE public.weekly_goal_changes
  ADD CONSTRAINT weekly_goal_changes_target_range
  CHECK (target BETWEEN 1 AND 7) NOT VALID;
