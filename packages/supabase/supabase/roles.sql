-- Local stacks only: the Supabase CLI runs this file before the migrations on
-- `supabase start` and `supabase db reset`; it is never pushed to hosted
-- projects. It gives the fitme login (migration 20261014130000_fitme_login.sql,
-- ADR 0003) the fixed development password local stacks and CI share, and
-- drops Supabase's default table grants in public (below). Hosted
-- projects set their own password by hand. Keep the role's attributes in line
-- with the migration; the fitme_login pgTAP test checks them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fitme') THEN
    CREATE ROLE fitme WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE fitme WITH PASSWORD 'fitme-local-only';

-- Supabase's default privileges give anon, authenticated and service_role
-- every privilege on any table the migrations create in public. Hosted
-- projects keep that default, but our migrations grant table access
-- explicitly (FIT-95, 20261016120000_explicit_table_grants.sql), so local
-- stacks and CI drop it: a table whose migration forgets its grants fails here
-- with "permission denied" instead of only on a stack without the default.
-- Functions and sequences keep their defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
