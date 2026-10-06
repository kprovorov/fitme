-- pgTAP tests for public.finish_workout_session. Run with `pnpm db test:db`.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

-- Fixtures -------------------------------------------------------------------
-- User A owns two plans, user B owns nothing.
INSERT INTO auth.users (id, email)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'finish-a@test.local'),
  ('b0000000-0000-0000-0000-000000000001', 'finish-b@test.local');

INSERT INTO public.plans (id, user_id, name, goal, place, frequency)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Contiguous', 'strength', 'gym', 3),
  ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Gappy', 'strength', 'gym', 3);

INSERT INTO public.workouts (id, plan_id, "order", name, description)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'W1', ''),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'W2', ''),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3, 'W3', ''),
  -- Non-contiguous orders, as left behind by the old order = max + 1 rotation
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 1, 'X1', ''),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 5, 'X2', ''),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000002', 9, 'X3', '');

-- created_at / updated_at are in the past so a change to now() is observable
-- (now() is constant within this transaction).
INSERT INTO public.workout_sessions (id, user_id, plan_id, workout_id, started_at, created_at, updated_at)
VALUES
  -- (a)/(b) open session on W1
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour'),
  -- (c) open session whose workout template was deleted
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', NULL, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour'),
  -- (d) open session on W2 that user B tries to finish
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour'),
  -- (f) open session on X2 in the gappy plan
  ('30000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000012', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour');

-- (a) Finishing an open session ------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-000000000001')$$,
  '(a) owner can finish an open session'
);

RESET ROLE;

SELECT is(
  (SELECT finished_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000001'),
  now(),
  '(a) finished_at is set'
);

SELECT is(
  (SELECT updated_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000001'),
  now(),
  '(a) updated_at is set'
);

SELECT results_eq(
  $$SELECT name, "order" FROM public.workouts WHERE plan_id = '10000000-0000-0000-0000-000000000001' ORDER BY "order"$$,
  $$VALUES ('W2', 1), ('W3', 2), ('W1', 3)$$,
  '(a) finished workout moves to the end, orders are 1..N, others keep their relative order'
);

-- (b) Calling again is a no-op -------------------------------------------------
-- Backdate the finish so an overwrite with now() would be visible.
UPDATE public.workout_sessions
SET finished_at = now() - interval '30 minutes',
    updated_at = now() - interval '30 minutes'
WHERE id = '30000000-0000-0000-0000-000000000001';

-- Put W1 back first so a second rotation would be visible.
UPDATE public.workouts
SET "order" = CASE name WHEN 'W1' THEN 1 WHEN 'W2' THEN 2 ELSE 3 END
WHERE plan_id = '10000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-000000000001')$$,
  '(b) finishing an already finished session does not raise'
);

RESET ROLE;

SELECT is(
  (SELECT finished_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000001'),
  now() - interval '30 minutes',
  '(b) finished_at is unchanged'
);

SELECT is(
  (SELECT updated_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000001'),
  now() - interval '30 minutes',
  '(b) updated_at is unchanged'
);

SELECT results_eq(
  $$SELECT name, "order" FROM public.workouts WHERE plan_id = '10000000-0000-0000-0000-000000000001' ORDER BY "order"$$,
  $$VALUES ('W1', 1), ('W2', 2), ('W3', 3)$$,
  '(b) workout is not rotated again'
);

-- (c) Session whose workout was deleted ----------------------------------------
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-000000000002')$$,
  '(c) session with workout_id NULL can be finished'
);

RESET ROLE;

SELECT is(
  (SELECT finished_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000002'),
  now(),
  '(c) finished_at is set'
);

SELECT results_eq(
  $$SELECT name, "order" FROM public.workouts WHERE plan_id = '10000000-0000-0000-0000-000000000001' ORDER BY "order"$$,
  $$VALUES ('W1', 1), ('W2', 2), ('W3', 3)$$,
  '(c) workout orders are unchanged'
);

-- (d) Another user's session ---------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-000000000003')$$,
  'P0001',
  'Session not found or not authorized',
  '(d) another user cannot finish the session'
);

RESET ROLE;

SELECT is(
  (SELECT finished_at FROM public.workout_sessions WHERE id = '30000000-0000-0000-0000-000000000003'),
  NULL::timestamptz,
  '(d) session stays open'
);

SELECT results_eq(
  $$SELECT name, "order" FROM public.workouts WHERE plan_id = '10000000-0000-0000-0000-000000000001' ORDER BY "order"$$,
  $$VALUES ('W1', 1), ('W2', 2), ('W3', 3)$$,
  '(d) workout orders are unchanged'
);

-- (e) Non-existent session -----------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-0000000000ff')$$,
  'P0001',
  'Session not found or not authorized',
  '(e) non-existent session raises'
);

-- (f) Non-contiguous orders are normalized --------------------------------------
SELECT lives_ok(
  $$SELECT public.finish_workout_session('30000000-0000-0000-0000-000000000004')$$,
  '(f) owner can finish a session in a plan with gaps in workout order'
);

RESET ROLE;

SELECT results_eq(
  $$SELECT name, "order" FROM public.workouts WHERE plan_id = '10000000-0000-0000-0000-000000000002' ORDER BY "order"$$,
  $$VALUES ('X1', 1), ('X3', 2), ('X2', 3)$$,
  '(f) orders 1, 5, 9 become 1..N with the finished workout last'
);

SELECT * FROM finish();
ROLLBACK;
