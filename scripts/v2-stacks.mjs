// Picks the local Supabase stacks Supabase CLI v2 left behind that
// scripts/destroy-stale-stacks.sh destroys: the same rule as stale-stacks.mjs
// (a checkout that no longer exists, or the given checkout), for the stacks v3
// can't see. v3 can't decode a v2 stack's state (no `pin` in its instances'
// `creation`): `stack list` skips it with a warning and `stack destroy` refuses
// it, so only the v2 CLI can stop its processes and remove it. Transitional
// (FIT-536): drop it, and its call, once no v2 stack is left on any machine.
//
// Usage: node scripts/v2-stacks.mjs <stacks state root> [checkout]
// Prints one stack id per line on stdout, and what it picked on stderr.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const readState = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
};

const isV2 = (state) =>
  Array.isArray(state?.instances) &&
  state.instances.some((instance) => !("pin" in (instance?.creation ?? {})));

export const staleV2Stacks = (
  stateRoot,
  { checkout, exists = fs.existsSync } = {}
) => {
  if (!fs.existsSync(stateRoot)) {
    return [];
  }

  const own = checkout && path.join(checkout, "packages/supabase");

  return fs
    .readdirSync(stateRoot)
    .sort()
    .map((id) => ({
      id,
      state: readState(path.join(stateRoot, id, "state.json")),
    }))
    .filter(({ state }) => isV2(state))
    .map(({ id, state }) => ({ id, projectRoot: state.identity?.projectRoot }))
    .filter(
      ({ projectRoot }) =>
        typeof projectRoot === "string" &&
        (projectRoot === own || !exists(projectRoot))
    );
};

const main = ([stateRoot, checkout]) => {
  if (!stateRoot) {
    console.error(
      "Usage: node scripts/v2-stacks.mjs <stacks state root> [checkout]"
    );

    return 2;
  }

  for (const stack of staleV2Stacks(stateRoot, { checkout })) {
    console.error(
      `Destroying ${stack.id.slice(0, 8)} (${stack.projectRoot}, left by Supabase CLI v2)`
    );
    console.log(stack.id);
  }

  return 0;
};

if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2));
}
