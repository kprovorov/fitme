-- current_user_id() only trusts authenticated tokens (FIT-92).
--
-- Supabase trusts every token Clerk signs, including OAuth access tokens
-- issued to third-party clients such as ChatGPT. Those carry a sub but no
-- role claim, and current_user_id() returned their sub anyway, so a client
-- holding one could read the User's data straight through the REST API.
--
-- The User id now comes from the sub claim only when the role claim is
-- authenticated; role-less, anon and any other tokens resolve to NULL.
-- Retired User ids still resolve to NULL (ADR 0001). Every RLS policy and RPC
-- reads the caller through this function, so this covers them all. The apps'
-- Clerk session tokens carry role: authenticated and keep working.
--
-- CREATE OR REPLACE keeps the function's owner and grants.

-- SECURITY DEFINER so it can read the retired ids the caller can't see
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT claims.sub
  FROM (
    SELECT
      nullif(auth.jwt() ->> 'sub', '') AS sub,
      auth.jwt() ->> 'role' AS role
  ) claims
  WHERE claims.role = 'authenticated'
    AND NOT EXISTS (
      SELECT 1 FROM private.retired_user_ids r
      WHERE r.user_id = claims.sub
    )
$$;
