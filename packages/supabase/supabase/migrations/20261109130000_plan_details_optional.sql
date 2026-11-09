-- A Plan built by hand asks only for a name and a frequency (ADR 0017), so its
-- goal, place, experience level and workout duration can be unset. `goal` and
-- `place` lose NOT NULL; `experience_level` and `workout_duration` lose their
-- defaults as well, so a write that leaves one out stores NULL instead of
-- silently claiming a choice the User never made. Existing rows keep their
-- values: nothing is backfilled or cleared. Arnold's plan card and MCP's Plan
-- writes still require all four, so only the hand-built flow leaves them empty.
ALTER TABLE public.plans
  ALTER COLUMN goal DROP NOT NULL,
  ALTER COLUMN place DROP NOT NULL,
  ALTER COLUMN experience_level DROP DEFAULT,
  ALTER COLUMN experience_level DROP NOT NULL,
  ALTER COLUMN workout_duration DROP DEFAULT,
  ALTER COLUMN workout_duration DROP NOT NULL;
