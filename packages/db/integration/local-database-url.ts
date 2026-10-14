import { execFileSync } from "node:child_process";

/**
 * The fitme login's URL on the running local stack's Supavisor pooler. Each
 * worktree's stack gets its own ports (`[experimental] stack` in config.toml),
 * so the pooler's SQL port comes from `supabase status`. The password is the
 * development one from supabase/roles.sql.
 */

const LOCAL_POOLER_USER = "fitme.pooler-dev";
const LOCAL_PASSWORD = "fitme-local-only";

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

export const localDatabaseUrl = (applicationName: string): string => {
  const pooler = readStatus().endpoints?.["pooler.sql"];
  if (!pooler) {
    throw new Error(
      "No pooler in `supabase status`; start the local stack (`pnpm db start`) with [db.pooler] enabled."
    );
  }
  return `postgresql://${LOCAL_POOLER_USER}:${LOCAL_PASSWORD}@${pooler.address}:${pooler.port}/postgres?application_name=${applicationName}`;
};

/**
 * The running local stack's direct URL as the `postgres` superuser, bypassing
 * the pooler. Only for tooling that introspects the schema
 * (`schema:generate`), never for app code.
 */
export const localAdminDatabaseUrl = (): string => {
  const database = readStatus().endpoints?.["database.sql"];
  if (!database) {
    throw new Error(
      "No database in `supabase status`; start the local stack (`pnpm db start`)."
    );
  }
  return `postgresql://postgres:postgres@${database.address}:${database.port}/postgres`;
};
