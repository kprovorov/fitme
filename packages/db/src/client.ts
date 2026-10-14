import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The raw pool and Drizzle client. Internal to packages/db: apps only ever get
 * a transaction through asUser or withService (ADR 0003), so nothing outside
 * this package may import this module.
 */

/** The fitme login's pooler connection string, with `application_name`. */
export const DATABASE_URL_ENV = "FITME_DATABASE_URL";

// Fluid instances each hold their own pool; keep it small (research §9.5).
const POOL_MAX = 5;
// attachDatabasePool recognizes pg by this option and keeps the function
// alive until idle clients are released.
const IDLE_TIMEOUT_MS = 10_000;

interface Database {
  applicationName: string;
  db: NodePgDatabase;
  pool: Pool;
}

let database: Database | undefined;

const readConfig = () => {
  const connectionString = process.env[DATABASE_URL_ENV];
  if (!connectionString) {
    throw new Error(`${DATABASE_URL_ENV} is not set`);
  }
  const applicationName = new URL(connectionString).searchParams.get(
    "application_name"
  );
  if (!applicationName) {
    throw new Error(
      `${DATABASE_URL_ENV} must set application_name so database activity stays attributable`
    );
  }
  return { applicationName, connectionString };
};

/** The pool, created from env on first use. */
export const getDatabase = (): Database => {
  if (database) {
    return database;
  }
  const { applicationName, connectionString } = readConfig();
  const pool = new Pool({
    application_name: applicationName,
    connectionString,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    max: POOL_MAX,
  });
  // An idle client that errors (the pooler or Postgres dropped it) is removed
  // from the pool; without a listener the error would crash the process.
  pool.on("error", () => undefined);
  // A no-op off Vercel.
  attachDatabasePool(pool);
  database = { applicationName, db: drizzle({ client: pool }), pool };
  return database;
};

/** Closes the pool. For tests and scripts that must exit. */
export const closeDatabase = async () => {
  const current = database;
  database = undefined;
  await current?.pool.end();
};
