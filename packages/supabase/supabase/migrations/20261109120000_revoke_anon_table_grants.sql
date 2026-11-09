-- The Data API is closed: anon loses every table grant on public (FIT-551,
-- ADR 0019).
--
-- Until now every app table granted anon, authenticated and service_role
-- everything (20261016120000_explicit_table_grants.sql), because PostgREST ran
-- a request carrying no token, or one whose `role` claim was `anon`, as that
-- role. No client reads or writes User data through the Data API any more
-- (ADR 0011, and the minimum version gate cut off the last build that did), so
-- anon needs nothing: the Data API is switched off on the hosted project
-- (FIT-552) and in config.toml, and this is the second lock behind it.
--
-- `authenticated` and `service_role` keep every grant they have: asUser and
-- withService (ADR 0003) run as those roles through the fitme login, and they
-- are how every backend app reaches a table.
--
-- anon keeps USAGE on the schema and EXECUTE on current_user_id(), which the
-- policies of every app table call (they target PUBLIC, so the function has to
-- stay callable by every role a policy can run under; function_grants.test.sql
-- checks it). Without a table grant it can still reach no row.
--
-- The REVOKE covers the tables that exist today. The default privileges are
-- narrowed too, for the role the migrations run as, so a table a later
-- migration creates without naming its grants doesn't hand anon one through
-- Supabase's default (hosted projects keep that default; local stacks and CI
-- drop it for all three roles in supabase/roles.sql). A table created by
-- another role is not covered by either, which is why every migration grants
-- explicitly and tests/database/table_grants.test.sql proves anon holds
-- nothing on any public table.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
