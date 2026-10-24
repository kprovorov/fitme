import pg from "pg";
import type { TestProject } from "vitest/node";

/**
 * Warms the local Supavisor pooler before an integration suite starts. A cold
 * pooler starts its tenant pool on the first connection, and test files that
 * all connect at once then wait on it for over 30s, so hooks time out. One
 * `select 1` first, retried until it answers, makes the first run pass.
 */

/** How long a cold pooler gets to answer. */
const DEADLINE_MS = 90_000;
/** Nothing listening on the port: the stack is down, so give up early. */
const REFUSED_GRACE_MS = 5000;
const RETRY_DELAY_MS = 1000;

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

/**
 * A wrong login, password or database in the URL: retrying won't help, and
 * Postgres' own message says what's wrong.
 */
const isConfigError = (error: unknown): boolean => {
  const code = errorCode(error);
  return code !== undefined && (code.startsWith("28") || code === "3D000");
};

/** The URL without its password, for messages. */
const redact = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.password = "";
    return parsed.toString();
  } catch {
    return "(unparseable FITME_DATABASE_URL)";
  }
};

const selectOne = async (url: string, timeoutMs: number): Promise<void> => {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("select 1");
  } finally {
    await client.end().catch(() => undefined);
  }
};

/**
 * Resolves once `select 1` answers through `url`; throws "local Supabase
 * pooler not reachable" when it doesn't within the deadline (or within a few
 * seconds when nothing listens on the port).
 */
export const waitForPooler = async (url: string): Promise<void> => {
  const started = Date.now();
  const attempt = async (): Promise<void> => {
    const left = DEADLINE_MS - (Date.now() - started);
    try {
      await selectOne(url, Math.max(left, 1));
    } catch (error) {
      if (isConfigError(error)) {
        throw error;
      }
      const stackDown =
        errorCode(error) === "ECONNREFUSED" &&
        Date.now() - started >= REFUSED_GRACE_MS;
      if (stackDown || Date.now() - started + RETRY_DELAY_MS >= DEADLINE_MS) {
        throw new Error(
          `local Supabase pooler not reachable at ${redact(url)}; run \`pnpm db start\``,
          { cause: error }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return attempt();
    }
  };
  await attempt();
};

/**
 * Vitest `globalSetup`: warms the pooler at the suite's FITME_DATABASE_URL
 * (from the config's `test.env`) before any test file starts.
 */
export default async function setup(project: TestProject): Promise<void> {
  const url =
    project.config.env?.FITME_DATABASE_URL ?? process.env.FITME_DATABASE_URL;
  if (typeof url !== "string" || url === "") {
    throw new Error("No FITME_DATABASE_URL for the integration suite");
  }
  await waitForPooler(url);
}
