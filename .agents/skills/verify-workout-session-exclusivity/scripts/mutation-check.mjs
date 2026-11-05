/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scripts = import.meta.dirname;
const root = path.resolve(scripts, "../../../..");
const migrations = "packages/supabase/supabase/migrations";
const file = "20261029120000_one_open_session_per_user.sql";
const scratch = mkdtempSync(path.join(tmpdir(), "fitme-session-mutations-"));

/** @type {Record<string, (source: string) => string>} */
const variants = {
  "non-unique-index": (source) =>
    source.replace(
      "CREATE UNIQUE INDEX workout_sessions_one_open_per_user_idx",
      "CREATE INDEX workout_sessions_one_open_per_user_idx"
    ),
  "per-workout-index": (source) =>
    source.replace(
      "ON public.workout_sessions (user_id)",
      "ON public.workout_sessions (workout_id)"
    ),
};

for (const [name, mutate] of Object.entries(variants)) {
  const target = path.join(scratch, name);
  cpSync(path.join(root, migrations), path.join(target, migrations), { recursive: true });
  const original = readFileSync(path.join(target, migrations, file), "utf-8");
  const broken = mutate(original);

  if (broken === original) {
    throw new Error(
      `${name}: mutation no longer matches the real SQL; update it.`
    );
  }

  writeFileSync(path.join(target, migrations, file), broken);

  const result = spawnSync(
    process.execPath,
    [path.join(scripts, "verify.mjs"), "--source-root", target],
    { encoding: "utf-8", timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }
  );

  const log = (result.stdout ?? "") + (result.stderr ?? "");
  writeFileSync(path.join(scratch, `${name}.out`), log);

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 1 ||
    !log.includes("FAIL OneOpenPerUser") ||
    !log.includes("FAIL: model and SQL agree.")
  ) {
    throw new Error(
      `${name}: verification failed to catch the real SQL mutation, or could not run. See ${scratch}/${name}.out`
    );
  }

  console.log(`${name}: detected by TLC and Postgres. ${scratch}/${name}.out`);
}

const baseline = spawnSync(process.execPath, [path.join(scripts, "verify.mjs")], {
  stdio: "inherit",
  timeout: 90_000,
});

if (baseline.error) {
  throw baseline.error;
}

if (baseline.status !== 0) {
  throw new Error(
    "Unmodified source did not pass after the scratch mutations."
  );
}

console.log(
  `Both real SQL mutations caught; repository source untouched. Mutation evidence: ${scratch}`
);
