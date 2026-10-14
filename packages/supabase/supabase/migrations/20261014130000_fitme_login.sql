-- The fitme login (FIT-99, ADR 0003).
--
-- Backend apps reach Postgres through packages/db, over the Supavisor
-- transaction pooler, with this one shared login. It holds no grants of its
-- own: a query only works inside asUser (SET LOCAL ROLE authenticated, RLS
-- applies) or withService (SET LOCAL ROLE service_role). A query that slips
-- past both fails with "permission denied" instead of skipping RLS.
--
-- NOINHERIT: membership in authenticated and service_role only allows
-- switching to them; their privileges never apply to fitme itself.
--
-- The password is not set here. Local stacks get a fixed development password
-- from supabase/roles.sql (which runs before migrations, so the role may
-- already exist); hosted projects get theirs by hand (ALTER ROLE ... PASSWORD).
-- Without one the login can't authenticate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fitme') THEN
    CREATE ROLE fitme WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT authenticated, service_role TO fitme;
