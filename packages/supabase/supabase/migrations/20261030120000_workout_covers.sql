-- A Workout's Cover (ADR 0014, FIT-443): the id of a Library photo its card
-- shows. Nullable until one is assigned; no foreign key and no format check,
-- since the Library isn't in Postgres. The table's grants cover it.
ALTER TABLE public.workouts ADD COLUMN cover text;
