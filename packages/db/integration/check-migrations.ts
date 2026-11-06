/// <reference lib="es2023.array" />

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

/**
 * Each worktree's local stack only has the migrations from when it was started
 * or last reset, so after a rebase onto a main with new ones every integration
 * suite fails deep inside a test ("relation … does not exist", 42P01). This
 * checks up front that every migration file is applied and names the command
 * that applies them.
 */

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../supabase/supabase/migrations", import.meta.url)
);

const MIGRATION_FILE = /^(?<version>\d+)_.*\.sql$/u;

export const APPLY_MIGRATIONS_COMMAND =
  "pnpm --filter @fitme/supabase exec supabase migration up --local";

/** The versions of the migration files in `dir`, oldest first. */
export const migrationVersions = (dir = MIGRATIONS_DIR): string[] =>
  readdirSync(dir)
    .map((file) => MIGRATION_FILE.exec(file)?.groups?.version)
    .filter((version): version is string => version !== undefined)
    .toSorted();

/** The versions in `files` that `applied` lacks, in order. */
export const missingMigrations = (
  files: readonly string[],
  applied: Iterable<string>
): string[] => {
  const done = new Set(applied);

  return files.filter((version) => !done.has(version));
};

/** The versions recorded in the stack's `supabase_migrations.schema_migrations`. */
const appliedVersions = async (adminUrl: string): Promise<string[]> => {
  const client = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });

  try {
    await client.connect();

    const { rows } = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations"
    );

    return rows.map((row) => row.version);
  } finally {
    await client.end().catch(() => null);
  }
};

/**
 * The error for migration files the stack hasn't applied, or `null` with none
 * missing. A missing version older than the newest applied one (a rebase
 * brought in an out-of-order migration) needs `--include-all`, or the CLI
 * refuses to insert it before the last applied one.
 */
export const migrationsError = (
  files: readonly string[],
  applied: readonly string[]
): Error | null => {
  const missing = missingMigrations(files, applied);

  if (missing.length === 0) {
    return null;
  }

  const newestApplied = applied.toSorted().at(-1);

  const outOfOrder =
    newestApplied !== undefined &&
    missing.some((version) => version < newestApplied);

  const command = outOfOrder
    ? `${APPLY_MIGRATIONS_COMMAND} --include-all`
    : APPLY_MIGRATIONS_COMMAND;

  return new Error(
    `the local Supabase stack is missing ${missing.length} migration(s) from this checkout (${missing.join(", ")}); run \`${command}\``
  );
};

/**
 * Throws when a migration file in this checkout isn't applied on the local
 * stack at `adminUrl` (its superuser's direct URL: the fitme login can't read
 * `supabase_migrations`), naming the missing versions and the command to run.
 */
export const checkMigrationsApplied = async (
  adminUrl: string,
  dir = MIGRATIONS_DIR
): Promise<void> => {
  const error = migrationsError(
    migrationVersions(dir),
    await appliedVersions(adminUrl)
  );

  if (error) {
    throw error;
  }
};
