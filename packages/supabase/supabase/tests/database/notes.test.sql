-- Notes (20261126120000_notes.sql): a nullable note on a Workout Session set,
-- and exercise_notes, one note per User and Exercise slug. Both hold at most
-- 500 characters and never an empty or blank one.
-- Run with `pnpm db test:db` (supabase test db).
begin;

select plan(31);

-- ------------------------------------------------------------
-- Shape
-- ------------------------------------------------------------
select has_column('public', 'workout_session_exercise_sets', 'note', 'a set has a note');
select col_is_null('public', 'workout_session_exercise_sets', 'note', 'a set''s note is nullable');
select col_type_is('public', 'workout_session_exercise_sets', 'note', 'text', 'a set''s note is text');
select col_hasnt_default('public', 'workout_session_exercise_sets', 'note', 'a set''s note has no default');

select has_table('public', 'exercise_notes', 'exercise_notes exists');
select col_is_pk('public', 'exercise_notes', array['user_id', 'exercise_slug'],
  'one note per User and Exercise slug');
select col_not_null('public', 'exercise_notes', 'note', 'an Exercise note always has text');
select col_not_null('public', 'exercise_notes', 'updated_at', 'an Exercise note records when it changed');
select col_has_default('public', 'exercise_notes', 'updated_at', 'updated_at defaults to now');

-- Postgres evaluates every permissive policy of a command, so one each
-- (Supabase's multiple_permissive_policies advisor, FIT-778)
select results_eq(
  $$select c.command::text, count(p.policyname)
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as c(command)
    left join pg_policies p
      on p.schemaname = 'public' and p.tablename = 'exercise_notes'
      and p.permissive = 'PERMISSIVE' and p.cmd in (c.command, 'ALL')
    group by c.command
    order by c.command$$,
  $$values ('DELETE', 1::bigint), ('INSERT', 1::bigint), ('SELECT', 1::bigint), ('UPDATE', 1::bigint)$$,
  'each exercise_notes command runs one permissive policy'
);

-- The sets keep the one own-rows policy they had: it covers the new column
select policies_are('public', 'workout_session_exercise_sets',
  array['workout_session_exercise_sets_all'],
  'no new policy on the sets for the note');

-- The Progress trigger counts a set's reps and Exercise only, so a note
-- write never fires it
select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_trigger t
   join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr)
   where t.tgname = 'count_workout_session_logged_sets'
     and t.tgrelid = 'public.workout_session_exercise_sets'::regclass),
  array['reps_completed', 'workout_session_exercise_id'],
  'the logged-set count fires on reps and the Exercise only, never on the note'
);

-- ------------------------------------------------------------
-- Fixtures (as postgres): two Users, each with a logged set
-- ------------------------------------------------------------
insert into public.workout_sessions (id, user_id, started_at)
values
  ('82200000-0000-4000-8000-000000000001', 'user_noteOwner', now()),
  ('82200000-0000-4000-8000-000000000002', 'user_noteOther', now());
insert into public.workout_session_exercises (id, workout_session_id, exercise_slug, "order")
values
  ('82200000-0000-4000-8000-000000000011', '82200000-0000-4000-8000-000000000001', 'leg-press', 1),
  ('82200000-0000-4000-8000-000000000012', '82200000-0000-4000-8000-000000000002', 'leg-press', 1);
insert into public.workout_session_exercise_sets (id, workout_session_exercise_id, "order", reps_completed)
values
  ('82200000-0000-4000-8000-000000000021', '82200000-0000-4000-8000-000000000011', 1, 8),
  ('82200000-0000-4000-8000-000000000022', '82200000-0000-4000-8000-000000000012', 1, 8);
insert into public.exercise_notes (user_id, exercise_slug, note)
values ('user_noteOther', 'leg-press', 'Seat on hole 4');

create temporary table progress_before on commit drop as
select * from public.workout_session_progress;
grant select on progress_before to authenticated;

-- ------------------------------------------------------------
-- As the owner
-- ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_noteOwner","role":"authenticated"}', true);
set local role authenticated;

-- Set notes
select lives_ok(
  $$update public.workout_session_exercise_sets set note = 'Left shoulder clicked on rep 6'
    where id = '82200000-0000-4000-8000-000000000021'$$,
  'a User writes a note on their own set'
);
select lives_ok(
  $$update public.workout_session_exercise_sets set note = repeat('a', 500)
    where id = '82200000-0000-4000-8000-000000000021'$$,
  'a set note of 500 characters is taken'
);
select lives_ok(
  $$update public.workout_session_exercise_sets set note = repeat('ї', 500)
    where id = '82200000-0000-4000-8000-000000000021'$$,
  'the limit counts characters, not bytes'
);
select throws_ok(
  $$update public.workout_session_exercise_sets set note = repeat('a', 501)
    where id = '82200000-0000-4000-8000-000000000021'$$,
  '23514', null, 'a set note over 500 characters is refused'
);
select throws_ok(
  $$update public.workout_session_exercise_sets set note = ''
    where id = '82200000-0000-4000-8000-000000000021'$$,
  '23514', null, 'an empty set note is refused'
);
select throws_ok(
  $$update public.workout_session_exercise_sets set note = E' \n\t '
    where id = '82200000-0000-4000-8000-000000000021'$$,
  '23514', null, 'a blank set note is refused'
);
select lives_ok(
  $$update public.workout_session_exercise_sets set note = null
    where id = '82200000-0000-4000-8000-000000000021'$$,
  'a set note is cleared with NULL'
);
with changed as (
  update public.workout_session_exercise_sets set note = 'Not mine'
  where id = '82200000-0000-4000-8000-000000000022' returning id
)
select is((select count(*) from changed), 0::bigint, 'a User can''t write a note on another User''s set');

select results_eq(
  $$select * from public.workout_session_progress
    except select * from progress_before$$,
  $$select * from progress_before where false$$,
  'note writes leave the Progress counts alone'
);

-- Exercise notes
select lives_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteOwner', 'leg-press', 'Feet high')$$,
  'a User writes their own Exercise note'
);
select throws_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteOwner', 'leg-press', 'Again')$$,
  '23505', null, 'a second note on the same Exercise is refused'
);
select throws_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteOther', 'squat', 'Forged')$$,
  '42501', null, 'a User can''t write a note under another User'
);
select throws_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteOwner', 'squat', repeat('a', 501))$$,
  '23514', null, 'an Exercise note over 500 characters is refused'
);
select throws_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteOwner', 'squat', E'  \n ')$$,
  '23514', null, 'a blank Exercise note is refused'
);
select is(
  array(select exercise_slug || ':' || note from public.exercise_notes),
  array['leg-press:Feet high'],
  'a User reads only their own Exercise notes'
);
with changed as (
  update public.exercise_notes set note = 'Overwritten'
  where user_id = 'user_noteOther' returning 1
)
select is((select count(*) from changed), 0::bigint, 'a User can''t change another User''s Exercise note');
with removed as (
  delete from public.exercise_notes where user_id = 'user_noteOther' returning 1
)
select is((select count(*) from removed), 0::bigint, 'a User can''t clear another User''s Exercise note');
with removed as (
  delete from public.exercise_notes where exercise_slug = 'leg-press' returning 1
)
select is((select count(*) from removed), 1::bigint, 'a User clears their own Exercise note');

reset role;

-- ------------------------------------------------------------
-- A retired id writes nothing, around RLS too
-- ------------------------------------------------------------
insert into private.retired_user_ids (user_id) values ('user_noteRetired');
set local role service_role;
select throws_ok(
  $$insert into public.exercise_notes (user_id, exercise_slug, note)
    values ('user_noteRetired', 'leg-press', 'Back again')$$,
  '42501', 'User id user_noteRetired is retired',
  'service_role can''t write an Exercise note under a retired id'
);
reset role;

select * from finish();
rollback;
