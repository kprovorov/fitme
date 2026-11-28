/// <reference types="node" />

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { pruneHookStubs } from "./prune-git-hooks.mjs";

const STUB = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"';

/** @param {string[]} hooks The hooks the repo has under `.husky`. */
const huskyDirWith = (hooks) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitme-husky-"));
  const stubDir = path.join(dir, "_");

  fs.mkdirSync(stubDir);

  for (const name of [".gitignore", "h", "husky.sh"]) {
    fs.writeFileSync(path.join(stubDir, name), "");
  }

  for (const name of ["pre-commit", "pre-push", "post-checkout"]) {
    fs.writeFileSync(path.join(stubDir, name), STUB, { mode: 0o755 });
  }

  for (const name of hooks) {
    fs.writeFileSync(path.join(dir, name), "echo hook\n");
  }

  return dir;
};

void test("deletes the stubs of hooks the repo hasn't got", () => {
  const dir = huskyDirWith(["pre-commit"]);

  assert.deepEqual(pruneHookStubs(dir), ["post-checkout", "pre-push"]);
  assert.deepEqual(fs.readdirSync(path.join(dir, "_")).toSorted(), [
    ".gitignore",
    "h",
    "husky.sh",
    "pre-commit",
  ]);
});

void test("keeps the stub of a hook added later", () => {
  const dir = huskyDirWith(["pre-commit", "pre-push"]);

  assert.deepEqual(pruneHookStubs(dir), ["post-checkout"]);
  assert.ok(fs.existsSync(path.join(dir, "_", "pre-push")));
});

void test("a second run deletes nothing", () => {
  const dir = huskyDirWith(["pre-commit"]);

  pruneHookStubs(dir);

  assert.deepEqual(pruneHookStubs(dir), []);
});

void test("changes nothing without .husky/_", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitme-husky-"));

  assert.deepEqual(pruneHookStubs(dir), []);
});
