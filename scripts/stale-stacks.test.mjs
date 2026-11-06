import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { staleStacks } from "./stale-stacks.mjs";

const NO_JSON = /no JSON/;
const DESTROYING_GONE = /Destroying gone-id/;
const USAGE = /Usage/;

const SCRIPT = fileURLToPath(new URL("stale-stacks.mjs", import.meta.url));

/** @type {string[]} */
const tempDirs = [];

/** @param {string} prefix Temporary directory name prefix. */
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

/** @param {unknown} stacks Stacks to serialize as CLI output. */
const listOutput = (stacks) =>
  `Listing stacks...\n${JSON.stringify({ stacks })}\n`;

/**
 * @param {string} id Stack identifier.
 * @param {string} projectRoot Stack checkout path.
 */
const stack = (id, projectRoot) => ({
  branch_context: "main",
  id,
  project_root: projectRoot,
});

void describe("staleStacks", () => {
  test("picks the stacks of checkouts that no longer exist", () => {
    const exists = (dir) => dir === "/live/packages/supabase";

    const stacks = [
      stack("a", "/live/packages/supabase"),
      stack("b", "/gone/packages/supabase"),
    ];

    assert.deepEqual(
      staleStacks(listOutput(stacks), { exists }).map((s) => s.id),
      ["b"]
    );
  });

  test("picks every stack of the given checkout, even a live one", () => {
    const exists = () => true;

    const stacks = [
      stack("a", "/mine/packages/supabase"),
      stack("b", "/mine/packages/supabase"),
      stack("c", "/other/packages/supabase"),
    ];

    assert.deepEqual(
      staleStacks(listOutput(stacks), { checkout: "/mine", exists }).map(
        (s) => s.id
      ),
      ["a", "b"]
    );
  });

  test("throws without a JSON line", () => {
    assert.throws(() => staleStacks("nothing\n"), NO_JSON);
  });
});

void describe("the CLI", () => {
  test("prints one id per line, the rest on stderr", () => {
    const live = tempDir("stale-stacks-");
    fs.mkdirSync(path.join(live, "packages/supabase"), { recursive: true });

    const output = listOutput([
      stack("live-id", path.join(live, "packages/supabase")),
      stack("gone-id", path.join(live, "missing/packages/supabase")),
    ]);

    const run = spawnSync(process.execPath, [SCRIPT, output], {
      encoding: "utf-8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "gone-id\n");
    assert.match(run.stderr, DESTROYING_GONE);
  });

  test("fails without its arguments", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, USAGE);
  });
});
