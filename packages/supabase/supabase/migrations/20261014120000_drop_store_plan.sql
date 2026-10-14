-- Drop store_plan (FIT-107). Nothing calls it: plan writes go through
-- create_plan / update_plan (ADR 0004). (jsonb, text) is its only overload
-- left; 20261011120000_user_id_text_key.sql dropped (jsonb, uuid).
DROP FUNCTION public.store_plan(jsonb, text);
