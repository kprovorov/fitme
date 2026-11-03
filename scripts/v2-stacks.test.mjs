import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { staleV2Stacks } from "./v2-stacks.mjs";

const DESTROYING_GONE = /Destroying gone-id/;
const USAGE = /Usage/;

const SCRIPT = fileURLToPath(new URL("./v2-stacks.mjs", import.meta.url));

const tempDirs = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

// A stack's state.json as the CLI writes it: v3 records a `pin` in every
// instance's `creation`, v2 doesn't.
const writeState = (root, id, projectRoot, { v2 = true } = {}) => {
  const creation = v2 ? { config: {} } : { config: {}, pin: {} };
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(
    path.join(root, id, "state.json"),
    JSON.stringify({
      id,
      identity: { projectRoot },
      instances: [{ creation }, { creation }],
    })
  );
};

describe("staleV2Stacks", () => {
  test("picks the v2 stacks of checkouts that no longer exist", () => {
    const root = tempDir("v2-stacks-");
    writeState(root, "live", "/live/packages/supabase");
    writeState(root, "gone", "/gone/packages/supabase");
    writeState(root, "gone-v3", "/gone/packages/supabase", { v2: false });
    const exists = (dir) => dir === "/live/packages/supabase";

    assert.deepEqual(
      staleV2Stacks(root, { exists }).map((s) => s.id),
      ["gone"]
    );
  });

  test("picks every v2 stack of the given checkout, even a live one", () => {
    const root = tempDir("v2-stacks-");
    writeState(root, "mine", "/mine/packages/supabase");
    writeState(root, "mine-v3", "/mine/packages/supabase", { v2: false });
    writeState(root, "other", "/other/packages/supabase");

    assert.deepEqual(
      staleV2Stacks(root, { checkout: "/mine", exists: () => true }).map(
        (s) => s.id
      ),
      ["mine"]
    );
  });

  test("skips a stack without a readable state, and a missing root", () => {
    const root = tempDir("v2-stacks-");
    fs.mkdirSync(path.join(root, "empty"));
    fs.mkdirSync(path.join(root, "broken"));
    fs.writeFileSync(path.join(root, "broken", "state.json"), "{");
    writeState(root, "gone", "/gone/packages/supabase");

    assert.deepEqual(
      staleV2Stacks(root, { exists: () => false }).map((s) => s.id),
      ["gone"]
    );
    assert.deepEqual(staleV2Stacks(path.join(root, "missing")), []);
  });
});

describe("the CLI", () => {
  test("prints one id per line, the rest on stderr", () => {
    const root = tempDir("v2-stacks-");
    const live = tempDir("v2-stacks-live-");
    writeState(root, "live-id", live);
    writeState(root, "gone-id", path.join(live, "missing"));

    const run = spawnSync(process.execPath, [SCRIPT, root], {
      encoding: "utf8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "gone-id\n");
    assert.match(run.stderr, DESTROYING_GONE);
  });

  test("fails without its arguments", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, USAGE);
  });
});
