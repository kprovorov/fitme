import { execFileSync } from "node:child_process";

/**
 * URLs on the running local stack. Each worktree's stack gets its own ports
 * (`[experimental] stack` in config.toml), so they come from `supabase status`.
 */

/** The fitme login on the pooler; the password is from supabase/roles.sql. */
const LOCAL_POOLER_USER = "fitme.pooler-dev";
const LOCAL_PASSWORD = "fitme-local-only";
/** The local stack's superuser, for schema introspection only. */
const LOCAL_ADMIN_USER = "postgres";
const LOCAL_ADMIN_PASSWORD = "postgres";

interface StackStatus {
  endpoints?: Record<string, { address: string; port: number } | undefined>;
}

const readStatus = (): StackStatus =>
  JSON.parse(
    execFileSync(
      "pnpm",
      [
        "--silent",
        "--filter",
        "@fitme/supabase",
        "exec",
        "supabase",
        "status",
        "--output-format",
        "json",
      ],
      { encoding: "utf8" }
    )
  );

const endpointHost = (name: string, missing: string): string => {
  const endpoint = readStatus().endpoints?.[name];
  if (!endpoint) {
    throw new Error(missing);
  }
  return `${endpoint.address}:${endpoint.port}`;
};

/** The fitme login's URL on the local stack's Supavisor pooler. */
export const localDatabaseUrl = (applicationName: string): string => {
  const host = endpointHost(
    "pooler.sql",
    "No pooler in `supabase status`; start the local stack (`pnpm db start`) with [db.pooler] enabled."
  );
  return `postgresql://${LOCAL_POOLER_USER}:${LOCAL_PASSWORD}@${host}/postgres?application_name=${applicationName}`;
};

/**
 * The superuser's direct URL, bypassing the pooler. Only for tooling that
 * introspects the schema (`schema:generate`), never for app code.
 */
export const localAdminDatabaseUrl = (): string => {
  const host = endpointHost(
    "database.sql",
    "No database in `supabase status`; start the local stack (`pnpm db start`)."
  );
  return `postgresql://${LOCAL_ADMIN_USER}:${LOCAL_ADMIN_PASSWORD}@${host}/postgres`;
};
