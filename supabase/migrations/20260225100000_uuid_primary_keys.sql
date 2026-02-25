-- ============================================================
-- FIT-12: Change primary key columns from bigint to uuid
-- Database is empty, so we drop and recreate all tables.
-- ============================================================

-- ------------------------------------------------------------
-- Drop existing function and tables (reverse FK order)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.activate_plan;

DROP TABLE IF EXISTS public.workout_session_exercise_sets CASCADE;
DROP TABLE IF EXISTS public.workout_session_exercises CASCADE;
DROP TABLE IF EXISTS public.workout_sessions CASCADE;
DROP TABLE IF EXISTS public.workout_exercise_sets CASCADE;
DROP TABLE IF EXISTS public.workout_exercises CASCADE;
DROP TABLE IF EXISTS public.workouts CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.exercises CASCADE;

-- ------------------------------------------------------------
-- exercises
-- ------------------------------------------------------------
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  instructions text,
  video_url text,
  thumbnail_url text,
  muscle_groups jsonb
);

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gender text NOT NULL,
  age integer NOT NULL,
  weight numeric(8,2) NOT NULL,
  height numeric(8,2) NOT NULL,
  measurement_system text NOT NULL DEFAULT 'metric',
  rc_user_id uuid
);

-- ------------------------------------------------------------
-- plans
-- ------------------------------------------------------------
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  description text,
  goal text NOT NULL,
  place text NOT NULL,
  frequency integer NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  experience_level text NOT NULL DEFAULT 'intermediate',
  workout_duration integer NOT NULL DEFAULT 60,
  note text
);

-- ------------------------------------------------------------
-- workouts
-- ------------------------------------------------------------
CREATE TABLE public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  name text NOT NULL,
  description text NOT NULL
);

-- ------------------------------------------------------------
-- workout_exercises
-- ------------------------------------------------------------
CREATE TABLE public.workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  "order" integer NOT NULL
);

-- ------------------------------------------------------------
-- workout_exercise_sets
-- ------------------------------------------------------------
CREATE TABLE public.workout_exercise_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workout_exercise_id uuid NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  reps_recommended integer NOT NULL,
  weight_recommended numeric(8,2) NOT NULL,
  rest_recommended integer NOT NULL
);

-- ------------------------------------------------------------
-- workout_sessions
-- ------------------------------------------------------------
CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

-- ------------------------------------------------------------
-- workout_session_exercises
-- ------------------------------------------------------------
CREATE TABLE public.workout_session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workout_session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  "order" integer NOT NULL
);

-- ------------------------------------------------------------
-- workout_session_exercise_sets
-- ------------------------------------------------------------
CREATE TABLE public.workout_session_exercise_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workout_session_exercise_id uuid NOT NULL REFERENCES public.workout_session_exercises(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  reps_recommended integer,
  weight_recommended numeric(10,2),
  rest_recommended integer,
  reps_completed integer,
  weight_completed numeric(8,2),
  logged_at timestamptz
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX plans_user_id_idx ON public.plans(user_id);
CREATE INDEX plans_user_id_is_active_idx ON public.plans(user_id, is_active);
CREATE INDEX workout_sessions_workout_id_idx ON public.workout_sessions(workout_id);
CREATE INDEX workout_session_exercises_session_id_idx ON public.workout_session_exercises(workout_session_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercise_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_session_exercise_sets ENABLE ROW LEVEL SECURITY;

-- exercises: public read, no writes from client
CREATE POLICY "exercises_select" ON public.exercises
  FOR SELECT USING (true);

-- profiles: own row only
CREATE POLICY "profiles_all" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- plans: own rows only
CREATE POLICY "plans_all" ON public.plans
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workouts: user must own the parent plan
CREATE POLICY "workouts_all" ON public.workouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = workouts.plan_id
        AND plans.user_id = auth.uid()
    )
  );

-- workout_exercises: ownership via workout -> plan
CREATE POLICY "workout_exercises_all" ON public.workout_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      JOIN public.plans p ON p.id = w.plan_id
      WHERE w.id = workout_exercises.workout_id
        AND p.user_id = auth.uid()
    )
  );

-- workout_exercise_sets: ownership via workout_exercise -> workout -> plan
CREATE POLICY "workout_exercise_sets_all" ON public.workout_exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      JOIN public.plans p ON p.id = w.plan_id
      WHERE we.id = workout_exercise_sets.workout_exercise_id
        AND p.user_id = auth.uid()
    )
  );

-- workout_sessions: ownership via workout -> plan
CREATE POLICY "workout_sessions_all" ON public.workout_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      JOIN public.plans p ON p.id = w.plan_id
      WHERE w.id = workout_sessions.workout_id
        AND p.user_id = auth.uid()
    )
  );

-- workout_session_exercises: ownership via session -> workout -> plan
CREATE POLICY "workout_session_exercises_all" ON public.workout_session_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      JOIN public.workouts w ON w.id = ws.workout_id
      JOIN public.plans p ON p.id = w.plan_id
      WHERE ws.id = workout_session_exercises.workout_session_id
        AND p.user_id = auth.uid()
    )
  );

-- workout_session_exercise_sets: ownership via session_exercise -> session -> workout -> plan
CREATE POLICY "workout_session_exercise_sets_all" ON public.workout_session_exercise_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_exercises wse
      JOIN public.workout_sessions ws ON ws.id = wse.workout_session_id
      JOIN public.workouts w ON w.id = ws.workout_id
      JOIN public.plans p ON p.id = w.plan_id
      WHERE wse.id = workout_session_exercise_sets.workout_session_exercise_id
        AND p.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- activate_plan: atomic plan activation (SECURITY DEFINER
-- so it can UPDATE across all user plans in one transaction)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_plan(plan_id uuid)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.plans;
BEGIN
  -- Verify caller owns the plan
  IF NOT EXISTS (
    SELECT 1 FROM public.plans
    WHERE id = plan_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Deactivate all plans for this user
  UPDATE public.plans
  SET is_active = false
  WHERE user_id = auth.uid();

  -- Activate the target plan
  UPDATE public.plans
  SET is_active = true
  WHERE id = plan_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;
