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
