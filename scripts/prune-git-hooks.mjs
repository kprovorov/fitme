/// <reference types="node" />
/// <reference lib="es2023.array" />

// Deletes the hook stubs husky writes into `.husky/_` for hooks this repo
// doesn't have. Husky 9 points `core.hooksPath` at `.husky/_` and writes an
// executable stub there for every git hook; a stub whose `.husky/<hook>` is
// missing does nothing but exit 0. T3 still sees an executable `pre-push` and
// asks "run this repo's pre-push hooks?" before every push its tools make, in
// every new worktree, and a push nobody answers fails after about an hour
// (FIT-890). With the stub gone git runs no hook, so nothing is asked. A hook
// added later (`.husky/pre-push`) keeps its stub.
//
// Run after husky by the root `prepare` script, so every `pnpm install` (and
// `scripts/setup.sh`'s `pnpm run prepare`) leaves only the stubs that run a
// hook. No `.husky/_` (husky skipped: no `.git`, or `HUSKY=0`) changes nothing.
//
// Usage: node scripts/prune-git-hooks.mjs [<.husky directory>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Husky's own files in `.husky/_`, which aren't stubs.
const HUSKY_FILES = new Set([".gitignore", "h", "husky.sh"]);

/**
 * @param {string} huskyDir The `.husky` directory.
 * @returns {string[]} The stubs deleted, by hook name.
 */
export const pruneHookStubs = (huskyDir) => {
  const stubDir = path.join(huskyDir, "_");

  if (!fs.existsSync(stubDir)) {
    return [];
  }

  /** @type {string[]} */
  const pruned = [];

  for (const name of fs.readdirSync(stubDir).toSorted()) {
    if (HUSKY_FILES.has(name) || fs.existsSync(path.join(huskyDir, name))) {
      continue;
    }

    fs.rmSync(path.join(stubDir, name), { force: true });
    pruned.push(name);
  }

  return pruned;
};

if (process.argv[1] === import.meta.filename) {
  const huskyDir =
    process.argv[2] ?? fileURLToPath(new URL("../.husky", import.meta.url));

  pruneHookStubs(huskyDir);
}
