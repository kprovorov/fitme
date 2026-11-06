/// <reference types="node" />

// Removes the BEAM perf maps and JIT dumps (/tmp/perf-<pid>.map,
// /tmp/jit-<pid>.dump) of processes that are gone. The Supabase CLI's native
// pooler (Supavisor) runs with `+JPperf true`, so every local stack start
// writes them, and nothing removes them when the stack goes (FIT-341). A live
// process's files stay.
//
// Usage: node scripts/stale-beam-dumps.mjs [dir]   (default /tmp)
import fs from "node:fs";
import path from "node:path";

const DUMP = /^(?:perf-(?<perfPid>\d+)\.map|jit-(?<jitPid>\d+)\.dump)$/u;

/** @param {number} pid Process ID to check. */
export const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // EPERM: alive, just another user's.
    return error.code === "EPERM";
  }
};

export const removeStaleBeamDumps = ({
  dir = "/tmp",
  isAlive: alive = isAlive,
  unlink = fs.unlinkSync,
} = {}) => {
  let names;

  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  /** @type {string[]} */
  const removed = [];

  for (const name of names) {
    const match = DUMP.exec(name);

    if (!match || alive(Number(match.groups.perfPid ?? match.groups.jitPid))) {
      continue;
    }

    const file = path.join(dir, name);

    try {
      unlink(file);
      removed.push(file);
    } catch {
      // Another user's file under /tmp's sticky bit, or already gone.
    }
  }

  return removed;
};

/** @param {string[]} args Command-line arguments. */
const main = ([dir]) => {
  const removed = removeStaleBeamDumps({ dir });
  console.log(
    removed.length === 0
      ? "No stale BEAM perf/jit dumps"
      : `Removed ${removed.length} BEAM perf/jit dump(s) of dead processes`
  );

  return 0;
};

if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2));
}
