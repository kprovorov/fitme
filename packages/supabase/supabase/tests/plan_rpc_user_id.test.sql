-- update_plan must only accept a p_user_id other than the current User id
-- (public.current_user_id()) from the service role. store_plan is gone
-- (20261014120000_drop_store_plan.sql).
--
-- User A: user_2PlanRpcUserA0000000000
-- User B: user_2PlanRpcUserB0000000000

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

-- ------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ------------------------------------------------------------
INSERT INTO public.plans (id, user_id, name, goal, place, frequency) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'user_2PlanRpcUserA0000000000', 'A original', 'strength', 'gym', 3),
  ('b0000000-0000-4000-8000-000000000001', 'user_2PlanRpcUserB0000000000', 'B original', 'strength', 'gym', 3);

INSERT INTO public.workouts (id, plan_id, name, description, "order") VALUES
  ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'A workout', 'A workout', 1),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'B workout', 'B workout', 1);

-- ------------------------------------------------------------
-- update_plan as user A
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"user_2PlanRpcUserA0000000000","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.update_plan(
      'a0000000-0000-4000-8000-000000000001',
      '{"name": "A renamed", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )
  $$,
  'update_plan succeeds on the caller''s own plan'
);

SELECT throws_ok(
  $$
    SELECT public.update_plan(
      'b0000000-0000-4000-8000-000000000001',
      '{"name": "Hijacked", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb,
      'user_2PlanRpcUserB0000000000'
    )
  $$,
  '42501',
  'Plan not found or access denied',
  'update_plan rejects another user''s id'
);

SELECT throws_ok(
  $$
    SELECT public.update_plan(
      'b0000000-0000-4000-8000-000000000001',
      '{"name": "Hijacked", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb
    )
  $$,
  'P0001',
  'Plan not found or access denied',
  'update_plan cannot reach another user''s plan with the default p_user_id'
);

RESET ROLE;

SELECT is(
  (SELECT name FROM public.plans WHERE id = 'a0000000-0000-4000-8000-000000000001'),
  'A renamed',
  'user A''s plan was renamed'
);

SELECT is(
  (SELECT name FROM public.plans WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  'B original',
  'user B''s plan name is unchanged'
);

SELECT is(
  (SELECT count(*)::integer FROM public.workouts
   WHERE id = 'b0000000-0000-4000-8000-000000000002'
     AND plan_id = 'b0000000-0000-4000-8000-000000000001'),
  1,
  'user B''s workouts are unchanged'
);

-- ------------------------------------------------------------
-- anon has no EXECUTE
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"role":"anon"}';
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$
    SELECT public.update_plan(
      'b0000000-0000-4000-8000-000000000001',
      '{"name": "Anon", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb,
      'user_2PlanRpcUserB0000000000'
    )
  $$,
  '42501',
  'permission denied for function update_plan',
  'anon cannot execute update_plan'
);

RESET ROLE;

-- ------------------------------------------------------------
-- service_role may act on behalf of a user
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$
    SELECT public.update_plan(
      'b0000000-0000-4000-8000-000000000001',
      '{"name": "B renamed by service", "goal": "strength", "place": "gym", "frequency": 3,
        "experience_level": "intermediate", "workout_duration": 60, "workouts": []}'::jsonb,
      'user_2PlanRpcUserB0000000000'
    )
  $$,
  'service_role can update a user''s plan'
);

RESET ROLE;

SELECT is(
  (SELECT name FROM public.plans WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  'B renamed by service',
  'plan updated by service_role was renamed'
);

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.update_plan(uuid, jsonb, text)', 'EXECUTE'),
  'anon has no EXECUTE on update_plan'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.update_plan(uuid, jsonb, text)', 'EXECUTE'),
  'authenticated keeps EXECUTE on update_plan'
);

SELECT hasnt_function('public', 'store_plan', 'store_plan is dropped');

SELECT * FROM finish();

ROLLBACK;
