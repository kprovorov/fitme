/// <reference types="node" />
/// <reference lib="es2023.array" />

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

/** @param {string} file Stack state file. */
const readState = (file) => {
  try {
    /** @type {unknown} */
    const state = JSON.parse(fs.readFileSync(file, "utf-8"));

    if (
      !(state instanceof Object) ||
      !("instances" in state) ||
      !Array.isArray(state.instances) ||
      !("identity" in state) ||
      !(state.identity instanceof Object) ||
      !("projectRoot" in state.identity)
    ) {
      return null;
    }

    /** @type {{instances: unknown[]}} */
    const { instances } = state;

    return {
      projectRoot: String.prototype.valueOf.call(state.identity.projectRoot),
      isV2: instances.some((instance) => {
        const creation =
          instance instanceof Object && "creation" in instance
            ? instance.creation
            : null;

        return (
          creation === null ||
          creation === undefined ||
          (creation instanceof Object && !("pin" in creation))
        );
      }),
    };
  } catch {
    return null;
  }
};

/**
 * @param {string} stateRoot Stack state directory.
 * @param {{checkout?: string, exists?: (path: string) => boolean}} [options] Stack selection options.
 */
export const staleV2Stacks = (
  stateRoot,
  { checkout, exists = fs.existsSync } = {}
) => {
  if (!fs.existsSync(stateRoot)) {
    return [];
  }

  const own =
    checkout === undefined || checkout === ""
      ? checkout
      : path.join(checkout, "packages/supabase");

  return fs
    .readdirSync(stateRoot)
    .toSorted()
    .flatMap((id) => {
      const state = readState(path.join(stateRoot, id, "state.json"));

      return state !== null && state.isV2
        ? [{ id, projectRoot: state.projectRoot }]
        : [];
    })
    .filter(({ projectRoot }) => projectRoot === own || !exists(projectRoot));
};

/** @param {string[]} args Command-line arguments. */
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
