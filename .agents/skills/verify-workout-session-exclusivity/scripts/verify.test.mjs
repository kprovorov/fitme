import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, "../../../..");
const migrations = "packages/supabase/supabase/migrations";
const outputDirectory = /generated model\/configs: (.+)/;
const userKey = /Index key: user/;
const unreviewedMigration =
  /touches workout_sessions after the covered migration/;

for (const scenario of ["reviewed", "edited", "new"]) {
  test(`migration guard: ${scenario} session reference`, () => {
    const scratch = mkdtempSync(join(tmpdir(), "fitme-migration-guard-"));
    let out;
    try {
      const target = join(scratch, migrations);
      cpSync(join(root, migrations), target, { recursive: true });
      if (scenario === "edited") {
        const file = join(target, "20261031130000_personal_records.sql");
        writeFileSync(
          file,
          `${readFileSync(file, "utf8")}\nDROP INDEX public.workout_sessions_one_open_per_user_idx;\n`
        );
      }
      if (scenario === "new") {
        writeFileSync(
          join(target, "20261101120000_drop_session_index.sql"),
          "DROP INDEX public.workout_sessions_one_open_per_user_idx;\n"
        );
      }
      const result = spawnSync(
        process.execPath,
        [
          join(scripts, "verify.mjs"),
          "--prepare-only",
          "--source-root",
          scratch,
        ],
        { encoding: "utf8", timeout: 10_000 }
      );
      assert.ifError(result.error);
      out = result.stdout.match(outputDirectory)?.[1];
      if (scenario === "reviewed") {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, userKey);
      } else {
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stderr, unreviewedMigration);
      }
    } finally {
      rmSync(scratch, { force: true, recursive: true });
      if (out) {
        rmSync(out, { force: true, recursive: true });
      }
    }
  });
}
