/// <reference types="node" />
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
import path from "node:path";
import test from "node:test";

const scripts = import.meta.dirname;
const root = path.resolve(scripts, "../../../..");
const migrations = "packages/supabase/supabase/migrations";
const outputDirectory = /generated model\/configs: (.+)/u;
const userKey = /Index key: user/u;

const unreviewedMigration =
  /touches workout_sessions after the covered migration/u;

for (const scenario of [
  "reviewed",
  "edited-records",
  "edited-progress",
  "new",
]) {
  void test(`migration guard: ${scenario} session reference`, () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "fitme-migration-guard-"));
    let out;

    try {
      const target = path.join(scratch, migrations);
      cpSync(path.join(root, migrations), target, { recursive: true });

      if (scenario.startsWith("edited-")) {
        const file = path.join(
          target,
          scenario === "edited-records"
            ? "20261031130000_personal_records.sql"
            : "20261101100000_workout_session_progress.sql"
        );

        writeFileSync(
          file,
          `${readFileSync(file, "utf-8")}\nDROP INDEX public.workout_sessions_one_open_per_user_idx;\n`
        );
      }

      if (scenario === "new") {
        writeFileSync(
          path.join(target, "20261101120000_drop_session_index.sql"),
          "DROP INDEX public.workout_sessions_one_open_per_user_idx;\n"
        );
      }

      const result = spawnSync(
        process.execPath,
        [
          path.join(scripts, "verify.mjs"),
          "--prepare-only",
          "--source-root",
          scratch,
        ],
        { encoding: "utf-8", timeout: 10_000 }
      );

      assert.ifError(result.error);
      out = outputDirectory.exec(result.stdout)?.[1];

      if (scenario === "reviewed") {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, userKey);
      } else {
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stderr, unreviewedMigration);
      }
    } finally {
      rmSync(scratch, { force: true, recursive: true });

      if (out !== undefined && out !== "") {
        rmSync(out, { force: true, recursive: true });
      }
    }
  });
}
