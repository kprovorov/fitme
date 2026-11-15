import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { replay } from "./replay.mjs";

const indexSql = `CREATE UNIQUE INDEX workout_sessions_one_open_per_user_idx
  ON public.workout_sessions (user_id) WHERE finished_at IS NULL;`;

for (const scenario of ["host address", "service file"]) {
  void test(`SQL replay ignores inherited libpq ${scenario}`, () => {
    const out = mkdtempSync(path.join(tmpdir(), "fitme-replay-env-"));

    const settings =
      scenario === "host address"
        ? { PGHOSTADDR: "127.0.0.1", PGPORT: "1", PGCONNECT_TIMEOUT: "1" }
        : {
            PGSERVICE: "fitme_formal_must_not_be_loaded",
            PGSERVICEFILE: path.join(out, "missing-service.conf"),
          };

    const before = Object.fromEntries(
      Object.keys(settings).map((key) => [key, process.env[key]])
    );

    try {
      Object.assign(process.env, settings);
      assert.equal(replay(indexSql, out), false);
    } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = value;
        }
      }

      rmSync(out, { recursive: true, force: true });
    }
  });
}

// On macOS a postmaster started with no locale in its environment can abort
// ("postmaster became multithreaded during startup"). The replay must start
// without one from the caller.
void test("SQL replay starts without an inherited locale", () => {
  const out = mkdtempSync(path.join(tmpdir(), "fitme-replay-env-"));

  const before = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key === "LANG" || key.startsWith("LC_")
    )
  );

  try {
    for (const key of Object.keys(before)) {
      Reflect.deleteProperty(process.env, key);
    }

    assert.equal(replay(indexSql, out), false);
  } finally {
    Object.assign(process.env, before);
    rmSync(out, { recursive: true, force: true });
  }
});
