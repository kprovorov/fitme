import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  APPLY_MIGRATIONS_COMMAND,
  checkMigrationsApplied,
  migrationVersions,
  missingMigrations,
} from "./check-migrations";
import { localAdminDatabaseUrl } from "./local-database-url";

const dir = mkdtempSync(join(tmpdir(), "fitme-migrations-"));
afterAll(() => rmSync(dir, { force: true, recursive: true }));

describe("migration check", () => {
  it("reads the versions of the migration files, oldest first", () => {
    writeFileSync(join(dir, "20261102120000_b.sql"), "");
    writeFileSync(join(dir, "20261101120000_a.sql"), "");
    writeFileSync(join(dir, "README.md"), "");
    expect(migrationVersions(dir)).toEqual([
      "20261101120000",
      "20261102120000",
    ]);
  });

  it("names every file version not applied, older ones included", () => {
    expect(missingMigrations(["1", "2", "3", "4"], ["1", "3", "9"])).toEqual([
      "2",
      "4",
    ]);
    expect(missingMigrations(["1"], ["1"])).toEqual([]);
  });

  it("passes on this checkout's stack, which the suite runs against", async () => {
    await expect(
      checkMigrationsApplied(localAdminDatabaseUrl())
    ).resolves.toBeUndefined();
  });

  it("fails with the command to run when a migration file isn't applied", async () => {
    writeFileSync(join(dir, "99991231235959_not_applied.sql"), "");
    const check = checkMigrationsApplied(localAdminDatabaseUrl(), dir);
    await expect(check).rejects.toThrow("99991231235959");
    await expect(check).rejects.toThrow(APPLY_MIGRATIONS_COMMAND);
  });
});
