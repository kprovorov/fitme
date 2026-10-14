-- Drop delete_user_data (FIT-105, ADR 0004).
--
-- apps/webhooks handles Clerk's user.deleted on both instances, running
-- deleteUserData from packages/services inside withService, so nothing calls
-- the SQL function any more. rekey_user stays, and so do the retired-id rules
-- (current_user_id(), the reject_retired_user_id triggers) and the grants
-- service_role needs for deleteUserData (20261014140000).
DROP FUNCTION public.delete_user_data(text);
