-- Marketing screenshot seed: a lived-in account for one Clerk test User.
--
-- Run against a LOCAL stack only, as the superuser (bypasses RLS):
--   psql "$DB_URL" -v user_id=user_xxx -f marketing/screenshots/seed/seed.sql
--
-- Creates (replacing anything the User had):
--   * a Profile (male, 29, 182 cm, 81.5 kg, metric)
--   * the active Plan "Upper / Lower — 4 days" with four Workouts
--   * 11 finished Workout Sessions over the past ~3 weeks (Mon/Tue/Thu/Fri),
--     weights progressing a little week to week
--   * one in-progress session (Upper A, started 35 minutes ago, 7 sets logged)
-- Timestamps are relative to now(), so rerun it on the day you shoot.

\set ON_ERROR_STOP on

begin;

-- session times are local wall-clock times (the simulator uses the Mac's zone)
set local time zone 'Europe/Madrid';

select set_config('seed.user_id', :'user_id', true);

delete from workout_sessions where user_id = current_setting('seed.user_id');
delete from plans where user_id = current_setting('seed.user_id');
delete from profiles where user_id = current_setting('seed.user_id');

insert into profiles (user_id, gender, age, height, weight, measurement_system)
values (current_setting('seed.user_id'), 'male', 29, 182, 81.5, 'metric');

do $$
declare
  uid text := current_setting('seed.user_id');
  v_plan_id uuid;
  w_id uuid;
  we_id uuid;
  s_id uuid;
  se_id uuid;
  e record;
  ses record;
  n int;
  k int;
  w_names text[] := array['Upper A', 'Lower A', 'Upper B', 'Lower B'];
  w_descs text[] := array[
    'Heavy horizontal push and pull, then shoulders and arms.',
    'Squat-focused lower day with hinge and single-leg work.',
    'Incline press and vertical pulling, with delt and arm accessories.',
    'Deadlift-focused lower day with glutes and core.'
  ];
  -- the 11 finished sessions: days ago and which workout (1-based)
  days_ago int[] := array[18, 17, 15, 14, 11, 10, 8, 7, 4, 3, 1];
  wk_of int[] := array[2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
  start_hour numeric[] := array[18.5, 18.25, 7.0, 18.5, 18.75, 18.5, 7.25, 18.0, 18.5, 18.25, 7.0];
  minutes int[] := array[58, 62, 64, 55, 61, 57, 66, 59, 63, 60, 65];
  progress numeric;
  start_ts timestamptz;
  finish_ts timestamptz;
  wt numeric;
  reps int;
  i int;
begin
  insert into plans (user_id, name, description, goal, place, frequency, is_active,
                     experience_level, workout_duration, note, created_at)
  values (uid, 'Upper / Lower — 4 days',
          'Four sessions a week alternating upper and lower body. Compound lifts first in lower rep ranges, accessories after for volume.',
          'muscle-gain', 'gym', 4, true, 'intermediate', 60, null,
          now() - interval '20 days')
  returning id into v_plan_id;

  -- workout -> exercises: slug, sets, reps, weight (kg), rest (s)
  create temp table seed_plan (w int, pos int, slug text, sets int, reps int, weight numeric, rest int) on commit drop;
  insert into seed_plan values
    (1, 1, 'bench-press-flat-barbell', 4, 6, 82.5, 150),
    (1, 2, 'barbell-bent-over-row', 4, 8, 70, 120),
    (1, 3, 'shoulder-press-dumbbells', 3, 10, 24, 90),
    (1, 4, 'lat-pulldown', 3, 10, 65, 90),
    (1, 5, 'cable-pushdown-with-rope-attachment', 3, 12, 25, 60),
    (1, 6, 'barbell-curl', 3, 10, 32.5, 60),
    (2, 1, 'barbell-back-squat', 4, 5, 110, 180),
    (2, 2, 'dumbbell-romanian-deadlift', 3, 10, 34, 120),
    (2, 3, 'leg-press', 3, 12, 180, 90),
    (2, 4, 'bulgarian-split-squat', 3, 10, 16, 90),
    (2, 5, 'standing-calf-raise', 4, 12, 60, 60),
    (2, 6, 'hanging-leg-raises', 3, 12, 0, 60),
    (3, 1, 'incline-dumbbell-press', 4, 8, 30, 120),
    (3, 2, 'pull-ups', 4, 8, 0, 120),
    (3, 3, 'cable-seated-row-back', 3, 10, 60, 90),
    (3, 4, 'dumbbell-lateral-raise', 3, 15, 10, 60),
    (3, 5, 'face-pulls', 3, 15, 20, 60),
    (3, 6, 'hammer-curl', 3, 12, 16, 60),
    (4, 1, 'barbell-deadlift', 4, 4, 145, 180),
    (4, 2, 'barbell-front-squat', 3, 8, 70, 150),
    (4, 3, 'barbell-hip-thrust', 3, 10, 100, 90),
    (4, 4, 'reverse-lunge-dumbbells', 3, 12, 18, 90),
    (4, 5, 'cable-rope-crunches', 3, 15, 35, 60);

  create temp table seed_workouts (wnum int, id uuid) on commit drop;

  -- Plan order after rotation: Upper A is up next (it's in progress today)
  for i in 1..4 loop
    insert into workouts (plan_id, "order", name, description, created_at)
    values (v_plan_id, i, w_names[i], w_descs[i], now() - interval '20 days')
    returning id into w_id;
    insert into seed_workouts values (i, w_id);
    for e in select sp.*, ex.id as exercise_id from seed_plan sp join exercises ex on ex.slug = sp.slug where sp.w = i order by sp.pos loop
      insert into workout_exercises (workout_id, exercise_id, "order")
      values (w_id, e.exercise_id, e.pos) returning id into we_id;
      for n in 1..e.sets loop
        insert into workout_exercise_sets (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        values (we_id, n, e.reps, e.weight, e.rest);
      end loop;
    end loop;
  end loop;

  -- finished sessions, plus the in-progress one as index 12
  for i in 1..12 loop
    if i <= 11 then
      k := wk_of[i];
      start_ts := date_trunc('day', now()) - make_interval(days => days_ago[i]) + make_interval(mins => (start_hour[i] * 60)::int);
      finish_ts := start_ts + make_interval(mins => minutes[i]);
      -- from ~92% of today's targets three weeks ago up to 100%
      progress := 0.92 + 0.08 * (i - 1) / 10.0;
    else
      k := 1;
      start_ts := now() - interval '35 minutes';
      finish_ts := null;
      progress := 1;
    end if;
    select id into w_id from seed_workouts where wnum = k;
    insert into workout_sessions (workout_id, plan_id, user_id, started_at, finished_at, created_at)
    values (w_id, v_plan_id, uid, start_ts, finish_ts, start_ts)
    returning id into s_id;
    for e in select sp.*, ex.id as exercise_id from seed_plan sp join exercises ex on ex.slug = sp.slug where sp.w = k order by sp.pos loop
      insert into workout_session_exercises (workout_session_id, exercise_id, "order", created_at)
      values (s_id, e.exercise_id, e.pos, start_ts) returning id into se_id;
      for n in 1..e.sets loop
        if e.weight = 0 then
          wt := 0;
        elsif e.weight < 40 then
          wt := round(e.weight * progress / 2) * 2;      -- dumbbells / cables in 2 kg steps
        else
          wt := round(e.weight * progress / 2.5) * 2.5;  -- barbells / machines in 2.5 kg steps
        end if;
        reps := e.reps;
        -- the last set of a compound sometimes falls one rep short
        if n = e.sets and e.pos <= 2 and (i + e.pos) % 3 = 0 then
          reps := reps - 1;
        end if;
        if i <= 11 then
          insert into workout_session_exercise_sets (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended, reps_completed, weight_completed, logged_at, created_at)
          values (se_id, n, e.reps, e.weight, e.rest, reps, wt, start_ts + make_interval(mins => e.pos * 9 + n * 2), start_ts);
        elsif e.pos <= 2 and not (e.pos = 2 and n = 4) then
          -- in progress: bench done, rows 3 of 4 logged
          insert into workout_session_exercise_sets (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended, reps_completed, weight_completed, logged_at, created_at)
          values (se_id, n, e.reps, e.weight, e.rest, e.reps, e.weight, start_ts + make_interval(mins => e.pos * 9 + n * 2), start_ts);
        else
          insert into workout_session_exercise_sets (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended, created_at)
          values (se_id, n, e.reps, e.weight, e.rest, start_ts);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

commit;
