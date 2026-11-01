-- Marketing screenshot seed: a lived-in account for one Clerk test User.
--
-- Run against a LOCAL stack only, as the superuser (bypasses RLS):
--   psql "$DB_URL" -v user_id=user_xxx -v open_session=off -f marketing/screenshots/seed/seed.sql
-- Then run initialize-personal-records.mts next to this file (see README).
--
-- Creates (replacing anything the User had):
--   * a Profile (male, 29, 182 cm, 81.5 kg, metric)
--   * the active Plan "Upper / Lower — 4 days" with four Workouts
--   * nine completed Madrid calendar weeks, four sessions each (Mon/Tue/Thu/Fri),
--     plus this week's elapsed training days, with gently progressing weights
--   * a retained Weekly goal of 4, recorded before the oldest seeded week
--   * real Library Cover ids on all four Workouts
--   * optionally one in-progress Upper A (35 minutes ago, 7 sets logged),
--     whose bench and row weights beat the entire finished History
-- open_session=on (default): set logging / finish with >=2 PRs (shots 02/03).
-- open_session=off: next Workout with Preview/Start (shot 06).
-- Shot 07: in the active session, ADD one bench set and log it, then finish.
-- This produces an add_sets Plan Update. Changing only a weight does not.
-- Historical PRs use the real service replay, never SQL award logic.
-- Timestamps are relative to now(), so rerun it on the day you shoot.

\set ON_ERROR_STOP on
\if :{?open_session}
\else
\set open_session on
\endif

begin;

-- session times are local wall-clock times (the simulator uses the Mac's zone)
set local time zone 'Europe/Madrid';

select set_config('seed.user_id', :'user_id', true);
select set_config('seed.open_session', :'open_session', true);

-- Validate before deleting anything. Cast also rejects a misspelled switch.
do $$ begin
  if current_setting('seed.user_id') !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'Use the fictional Clerk development User id (user_...)';
  end if;
  perform current_setting('seed.open_session')::boolean;
end $$;

-- Follow account-deletion lock order before the cascades, so this local
-- fixture also coexists with the integration suites' User cleanup.
lock table profiles, plans, workout_sessions, workouts, workout_exercises,
  workout_exercise_sets, workout_session_exercises, workout_session_exercise_sets,
  personal_records, weekly_goal_changes, personal_record_initializations
  in row exclusive mode;

delete from personal_records where user_id = current_setting('seed.user_id');
delete from personal_record_initializations where user_id = current_setting('seed.user_id');
delete from weekly_goal_changes where user_id = current_setting('seed.user_id');

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
  n int;
  k int;
  w_names text[] := array['Upper A', 'Lower A', 'Upper B', 'Lower B'];
  w_descs text[] := array[
    'Heavy horizontal push and pull, then shoulders and arms.',
    'Squat-focused lower day with hinge and single-leg work.',
    'Incline press and vertical pulling, with delt and arm accessories.',
    'Deadlift-focused lower day with glutes and core.'
  ];
  -- Calendar arithmetic in Madrid keeps Mondays at midnight across DST.
  this_monday timestamptz := date_trunc('week', now());
  first_monday timestamptz := this_monday - interval '9 weeks';
  training_days int[] := array[0, 1, 3, 4];
  covers text[] := array[
    '09dbfdc3-e5e3-40b7-af50-130feb180fa2', -- back / lats
    '1efd6fb2-a9eb-4801-b0ad-a1b4ac95d840', -- quadriceps / glutes
    '44aee640-9c3d-497b-8522-278bcae654e2', -- chest / shoulders / triceps
    'c14716d5-1355-4ae7-a997-2c06414487de'  -- glutes / hamstrings
  ];
  finished_count int;
  current_count int;
  is_finished boolean;
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
          first_monday - interval '1 day')
  returning id into v_plan_id;

  insert into weekly_goal_changes (user_id, recorded_at, target)
  values (uid, first_monday - interval '1 day', 4);

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

  -- History's rotation ends at Lower B, leaving Upper A up next.
  for i in 1..4 loop
    insert into workouts (plan_id, "order", name, description, cover, created_at)
    values (v_plan_id, i, w_names[i], w_descs[i], covers[i], first_monday - interval '1 day')
    returning id into w_id;
    insert into seed_workouts values (i, w_id);
    for e in select sp.* from seed_plan sp where sp.w = i order by sp.pos loop
      insert into workout_exercises (workout_id, exercise_slug, "order")
      values (w_id, e.slug, e.pos) returning id into we_id;
      for n in 1..e.sets loop
        insert into workout_exercise_sets (workout_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
        values (we_id, n, e.reps, e.weight, e.rest);
      end loop;
    end loop;
  end loop;

  -- Only elapsed DAYS this week: no future finished sessions, even when
  -- shooting just after midnight. Tuesday already has Monday's training.
  create temp table seed_history (seq int, week int, started_at timestamptz) on commit drop;
  insert into seed_history
  select row_number() over (order by week, day)::int, week,
    first_monday + make_interval(weeks => week, days => day, hours => 18)
  from generate_series(0, 9) as week
  cross join unnest(training_days) as day
  where first_monday + make_interval(weeks => week, days => day) < date_trunc('day', now());
  select count(*), count(*) filter (where week = 9)
    into finished_count, current_count from seed_history;

  for i in 1..(finished_count + current_setting('seed.open_session')::boolean::int) loop
    is_finished := i <= finished_count;
    if is_finished then
      -- Keep the four-day cycle continuous across week boundaries, aligned
      -- so the next Workout is Upper A regardless of the day of shooting.
      k := 1 + mod(i - 1 - current_count + 4, 4);
      select h.started_at, 0.80 + 0.02 * h.week
        into start_ts, progress from seed_history h where h.seq = i;
      finish_ts := start_ts + make_interval(mins => 64 + mod(i, 7));
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
    for e in select sp.* from seed_plan sp where sp.w = k order by sp.pos loop
      insert into workout_session_exercises (workout_session_id, exercise_slug, "order", created_at)
      values (s_id, e.slug, e.pos, start_ts) returning id into se_id;
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
        if is_finished then
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
