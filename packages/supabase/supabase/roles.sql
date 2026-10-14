-- Local stacks only: the Supabase CLI runs this file before the migrations on
-- `supabase start` and `supabase db reset`; it is never pushed to hosted
-- projects. It gives the fitme login (migration 20261014130000_fitme_login.sql,
-- ADR 0003) the fixed development password local stacks and CI share. Hosted
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
