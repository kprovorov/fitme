-- store_plan has no callers: plan writes go through create_plan / update_plan
-- (ADR 0004). Drop every overload.
DROP FUNCTION IF EXISTS public.store_plan(jsonb, text);
DROP FUNCTION IF EXISTS public.store_plan(jsonb, uuid);
DROP FUNCTION IF EXISTS public.store_plan(jsonb);
