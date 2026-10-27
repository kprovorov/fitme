import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isAlive, removeStaleBeamDumps } from "./stale-beam-dumps.mjs";

const REMOVED = /Removed 2 BEAM perf\/jit dump/;

const SCRIPT = fileURLToPath(
  new URL("./stale-beam-dumps.mjs", import.meta.url)
);

const tempDirs = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beam-dumps-"));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

const touch = (dir, ...names) => {
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), "x");
  }
};

describe("removeStaleBeamDumps", () => {
  test("removes the perf maps and jit dumps of dead pids, keeps live ones", () => {
    const dir = tempDir();
    touch(dir, "perf-100.map", "jit-100.dump", "perf-200.map", "jit-200.dump");
    const alive = (pid) => pid === 200;

    const removed = removeStaleBeamDumps({ dir, isAlive: alive });

    assert.deepEqual(removed.map((file) => path.basename(file)).sort(), [
      "jit-100.dump",
      "perf-100.map",
    ]);
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      "jit-200.dump",
      "perf-200.map",
    ]);
  });

  test("leaves every other file alone", () => {
    const dir = tempDir();
    const others = [
      "perf-abc.map",
      "perf-100.map.bak",
      "jit-100.dump.old",
      "xperf-100.map",
      "perf-100.txt",
      "notes",
    ];
    touch(dir, ...others);

    assert.deepEqual(removeStaleBeamDumps({ dir, isAlive: () => false }), []);
    assert.deepEqual(fs.readdirSync(dir).sort(), [...others].sort());
  });

  test("skips a file it can't remove and carries on", () => {
    const dir = tempDir();
    touch(dir, "perf-100.map", "perf-101.map");
    const unlink = (file) => {
      if (file.endsWith("perf-100.map")) {
        throw Object.assign(new Error("not permitted"), { code: "EPERM" });
      }
      fs.unlinkSync(file);
    };

    const removed = removeStaleBeamDumps({ dir, isAlive: () => false, unlink });

    assert.deepEqual(
      removed.map((file) => path.basename(file)),
      ["perf-101.map"]
    );
  });

  test("answers nothing for a missing directory", () => {
    assert.deepEqual(
      removeStaleBeamDumps({ dir: path.join(tempDir(), "missing") }),
      []
    );
  });
});

describe("isAlive", () => {
  test("is true for this process and false for an exited one", async () => {
    assert.equal(isAlive(process.pid), true);
    const child = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(isAlive(child.pid), false);
  });
});

describe("the script", () => {
  test("removes the dead pids' files in the given directory", () => {
    const dir = tempDir();
    // A pid no process has: above Linux's and macOS's pid_max.
    const dead = 2 ** 30;
    touch(
      dir,
      `perf-${dead}.map`,
      `jit-${dead}.dump`,
      `perf-${process.pid}.map`
    );

    const result = spawnSync(process.execPath, [SCRIPT, dir], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, REMOVED);
    assert.deepEqual(fs.readdirSync(dir), [`perf-${process.pid}.map`]);
  });
});
