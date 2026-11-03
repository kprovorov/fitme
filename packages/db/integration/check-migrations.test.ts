import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  APPLY_MIGRATIONS_COMMAND,
  migrationsError,
  migrationVersions,
  missingMigrations,
} from "./check-migrations";

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

  it("answers no error when every file is applied", () => {
    expect(migrationsError(["1", "2"], ["1", "2", "3"])).toBeNull();
  });

  it("names the missing versions and the command to apply them", () => {
    const message = migrationsError(["1", "2", "3"], ["1"])?.message;
    expect(message).toContain("(2, 3)");
    expect(message).toContain(`\`${APPLY_MIGRATIONS_COMMAND}\``);
  });

  it("adds --include-all for a missing version older than the newest applied", () => {
    expect(migrationsError(["1", "2", "3"], ["1", "3"])?.message).toContain(
      `\`${APPLY_MIGRATIONS_COMMAND} --include-all\``
    );
  });
});
