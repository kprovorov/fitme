import { execFileSync } from "node:child_process";

/**
 * The fitme login's URL on the running local stack's Supavisor pooler. Each
 * worktree's stack gets its own ports (`[experimental] stack` in config.toml),
 * so the pooler's port comes from `supabase status`. The password is the
 * development one from supabase/roles.sql.
 */

const POOLER_KEY = /pooler|supavisor/i;
const LOCAL_POOLER_USER = "fitme.pooler-dev";
const LOCAL_PASSWORD = "fitme-local-only";

const readStatus = (): unknown =>
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

const portOf = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.includes("://")) {
    return new URL(value).port || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "port" in value) {
    return portOf(value.port);
  }
};

/** The port of the first pooler endpoint anywhere in the status output. */
const findPoolerPort = (
  value: unknown,
  underPooler = false
): string | undefined => {
  if (!value || typeof value !== "object") {
    return underPooler ? portOf(value) : undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    const isPooler = underPooler || POOLER_KEY.test(key);
    const port =
      (isPooler ? portOf(child) : undefined) ?? findPoolerPort(child, isPooler);
    if (port) {
      return port;
    }
  }
};

export const localDatabaseUrl = (applicationName: string): string => {
  const status = readStatus();
  const port = findPoolerPort(status);
  if (!port) {
    throw new Error(
      `No pooler endpoint in \`supabase status\`; is the local stack running with [db.pooler] enabled?\n${JSON.stringify(status, null, 2)}`
    );
  }
  return `postgresql://${LOCAL_POOLER_USER}:${LOCAL_PASSWORD}@127.0.0.1:${port}/postgres?application_name=${applicationName}`;
};
