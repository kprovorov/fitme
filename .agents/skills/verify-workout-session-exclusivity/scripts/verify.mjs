/// <reference lib="es2023.array" />

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { replay } from "./replay.mjs";

const skill = path.resolve(import.meta.dirname, "..");
const root = path.resolve(skill, "../../..");
const migrationName = "20261029120000_one_open_session_per_user.sql";
const migrationDir = "packages/supabase/supabase/migrations";

const checksum =
  "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";

// Reviewed child tables, policies, and progress-cache triggers only read
// sessions or follow their changes; they never write the parent or its index.
// Pin the complete file so an edit to this migration requires review again.
const reviewedMigrations = new Map([
  [
    "20261031130000_personal_records.sql",
    "bd431d7748c13666b728072e463a35b5c063329902a7a58a58440c736eb39c69",
  ],
  [
    "20261101100000_workout_session_progress.sql",
    "7b1a09093747e2e7ac00da82a4acaa40fefcf15dcf35ffc21cbc13ca45ae8653",
  ],
]);

const { values } = parseArgs({
  options: {
    "prepare-only": { default: false, type: "boolean" },
    "source-root": { default: root, type: "string" },
  },
});

const sourceRoot = path.resolve(values["source-root"]);

const source = readFileSync(
  path.join(sourceRoot, migrationDir, migrationName),
  "utf-8"
);

const uncommented = source
  .replaceAll(/--[^\n]*/gu, "")
  .replaceAll(/\/\*[\s\S]*?\*\//gu, "");

const declaration =
  /CREATE\s+(?<unique>UNIQUE\s+)?INDEX\s+workout_sessions_one_open_per_user_idx\s+ON\s+public\.workout_sessions\s*\(\s*(?<key>user_id|workout_id)\s*\)\s+WHERE\s+finished_at\s+IS\s+NULL\s*;/iu.exec(
    uncommented
  );

if (!declaration) {
  throw new Error(
    "Unsupported index declaration: recheck and update the model; refusing to guess."
  );
}

const tail = uncommented.slice(declaration.index + declaration[0].length);

if (!/^\s*END\s*\$\$\s*;\s*$/iu.test(tail)) {
  throw new Error(
    "Unexpected SQL after the covered index declaration; recheck the migration before trusting this model."
  );
}

// A later migration that mentions this table requires review before this
// historical declaration can be treated as the current database contract.
for (const name of readdirSync(
  path.join(sourceRoot, migrationDir)
).toSorted()) {
  if (name > migrationName && name.endsWith(".sql")) {
    const migration = readFileSync(
      path.join(sourceRoot, migrationDir, name),
      "utf-8"
    );

    const sql = migration
      .replaceAll(/--[^\n]*/gu, "")
      .replaceAll(/\/\*[\s\S]*?\*\//gu, "");

    if (
      /\bworkout_sessions\b|workout_sessions_one_open_per_user_idx/iu.test(sql)
    ) {
      if (
        reviewedMigrations.get(name) ===
        createHash("sha256").update(migration).digest("hex")
      ) {
        continue;
      }

      throw new Error(
        `${name} touches workout_sessions after the covered migration. Review its effect and update this guard.`
      );
    }
  }
}

let keyMode = "none";

if (declaration.groups.unique) {
  keyMode =
    declaration.groups.key.toLowerCase() === "user_id" ? "user" : "workout";
}

const out = mkdtempSync(path.join(tmpdir(), "fitme-session-proof-"));

writeFileSync(
  path.join(out, "WorkoutSessions.tla"),
  readFileSync(path.join(skill, "WorkoutSessions.tla"))
);

writeFileSync(
  path.join(out, "view.mjs"),
  readFileSync(path.join(skill, "view.mjs"))
);

for (const [name, twoUsers] of [
  ["same-user", false],
  ["two-users", true],
]) {
  writeFileSync(
    path.join(out, `${name}.cfg`),
    `INIT Init\nNEXT Next\nCONSTANTS\n  KeyMode = "${keyMode}"\n  TwoUsers = ${String(twoUsers).toUpperCase()}\nINVARIANT OneOpenPerUser\n`
  );
}

writeFileSync(
  path.join(out, "source.json"),
  JSON.stringify({ index: declaration[0], keyMode, sourceRoot }, null, 2)
);

console.log(`Index key: ${keyMode}; generated model/configs: ${out}`);

if (values["prepare-only"]) {
  process.exit(0);
}

const jar =
  process.env.TLA2TOOLS ?? path.join(tmpdir(), "fitme-tla2tools-1.7.4.jar");

if (!existsSync(jar)) {
  execFileSync(
    "curl",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      "60",
      "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
      "--output",
      jar,
    ],
    { stdio: "inherit" }
  );
}

if (createHash("sha256").update(readFileSync(jar)).digest("hex") !== checksum) {
  throw new Error(
    `TLC checksum mismatch at ${jar}; expected the pinned 1.7.4 artifact.`
  );
}

let failed = false;

for (const name of ["same-user", "two-users"]) {
  const result = spawnSync(
    process.env.JAVA ?? "java",
    [
      "-XX:+UseParallelGC",
      "-Xmx512m",
      "-cp",
      jar,
      "tlc2.TLC",
      "-workers",
      "1",
      "-config",
      `${name}.cfg`,
      "-metadir",
      `${name}-states`,
      "WorkoutSessions.tla",
    ],
    { cwd: out, encoding: "utf-8", maxBuffer: 8 * 1024 * 1024, timeout: 60_000 }
  );

  const log = (result.stdout ?? "") + (result.stderr ?? "");
  writeFileSync(path.join(out, `${name}.out`), log);

  if (result.error) {
    throw result.error;
  }

  const violation = log.includes("Invariant OneOpenPerUser is violated");

  if (result.status !== 0 && !violation) {
    throw new Error(`TLC could not check ${name}; see ${out}/${name}.out`);
  }

  if (
    !(
      violation ||
      log.includes("Model checking completed. No error has been found.")
    )
  ) {
    throw new Error(`Incomplete TLC result; see ${out}/${name}.out`);
  }

  console.log(
    `${name}: ${violation ? "FAIL OneOpenPerUser" : "PASS"}; ${/\d+ states generated, [^\n]*/u.exec(log)?.[0] ?? "see log"}`
  );
  failed ||= violation;
}

// Replay the same property with the actual index SQL in isolated Postgres.
// A failure must be witnessed in SQL as well as in the model.
const sqlFailure = replay(declaration[0], out);

if (sqlFailure !== failed) {
  throw new Error(
    `Model/SQL disagreement: model violation=${failed}, SQL violation=${sqlFailure}. Fix the model or replay before trusting this result.`
  );
}

console.log(
  `${failed ? "FAIL" : "PASS"}: model and SQL agree. Evidence: ${out}`
);

process.exitCode = failed ? 1 : 0;
