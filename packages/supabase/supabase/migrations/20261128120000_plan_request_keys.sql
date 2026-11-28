-- Request keys on Plans (FIT-899, project "Arnold redesign: cards and Plan
-- Proposals", ADR 0027).
--
-- When the User accepts a Plan Proposal for a new Plan, Arnold creates it in a
-- durable eve step, which can re-run after its tool already committed. As with
-- the appending Plan edits (20261015120000_plan_edit_request_keys.sql), a key
-- derived from the step is stored on the Plan, so a repeated create finds the
-- Plan the first one made instead of making another.
--
-- Unique per User where it is set: two Users may hold the same key, and Plans
-- written any other way leave it NULL, as every existing Plan does. A nullable
-- column with no default is a catalog-only change, so no table is rewritten.
-- RLS, grants and the retired-id trigger on plans are unchanged: the own-rows
-- policy and the table's grants cover the new column.
ALTER TABLE public.plans ADD COLUMN request_key text;

CREATE UNIQUE INDEX plans_user_id_request_key_key
  ON public.plans(user_id, request_key) WHERE request_key IS NOT NULL;
