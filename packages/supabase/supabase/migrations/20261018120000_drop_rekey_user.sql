-- Drop rekey_user (FIT-77, ADR 0001).
--
-- It only existed for the one-shot Supabase Auth -> Clerk User migration
-- (FIT-73), which ran at the production cutover (FIT-76). The 30-day rollback
-- window is over and the migration script is gone, so nothing calls it.
-- The retired-id rules stay (current_user_id(), the reject_retired_user_id
-- triggers, private.retired_user_ids with its rekeyed_to pointers), and so
-- does deleteUserData's refusal of an id that was rekeyed away.
DROP FUNCTION public.rekey_user(text, text);
