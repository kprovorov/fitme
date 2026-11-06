/// <reference types="node" />
/// <reference lib="es2023.array" />

// Picks the local Supabase stacks scripts/destroy-stale-stacks.sh destroys:
// every stack of a checkout that no longer exists, plus, given a checkout path,
// every stack of that checkout.
//
// Usage: node scripts/stale-stacks.mjs <supabase stack list --output-format json output> [checkout]
// Prints one stack id per line on stdout, and what it picked on stderr.
import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} output Supabase CLI output.
 * @param {{checkout?: string, exists?: (path: string) => boolean}} [options] Stack selection options.
 */
export const staleStacks = (
  output,
  { checkout, exists = fs.existsSync } = {}
) => {
  const json = output
    .split("\n")
    .toReversed()
    .find((line) => line.startsWith("{"));

  if (json === undefined) {
    throw new Error("no JSON in the `supabase stack list` output");
  }

  const own =
    checkout === undefined || checkout === ""
      ? checkout
      : path.join(checkout, "packages/supabase");

  /** @type {unknown} */
  const parsed = JSON.parse(json);

  if (
    !(parsed instanceof Object) ||
    !("stacks" in parsed) ||
    !Array.isArray(parsed.stacks)
  ) {
    throw new Error("invalid stack JSON in the `supabase stack list` output");
  }

  /** @type {{stacks: unknown[]}} */
  const { stacks } = parsed;

  return stacks
    .map((stack) => {
      if (
        !(stack instanceof Object) ||
        !("id" in stack) ||
        !("project_root" in stack) ||
        !("branch_context" in stack)
      ) {
        throw new Error(
          "invalid stack JSON in the `supabase stack list` output"
        );
      }

      return Object.assign(stack, {
        id: String.prototype.valueOf.call(stack.id),
        project_root: String.prototype.valueOf.call(stack.project_root),
        branch_context: String.prototype.valueOf.call(stack.branch_context),
      });
    })
    .filter(
      (stack) => stack.project_root === own || !exists(stack.project_root)
    );
};

/** @param {string[]} args Command-line arguments. */
const main = ([output, checkout]) => {
  if (!output) {
    console.error(
      "Usage: node scripts/stale-stacks.mjs <supabase stack list output> [checkout]"
    );

    return 2;
  }

  for (const stack of staleStacks(output, { checkout })) {
    console.error(
      `Destroying ${stack.id.slice(0, 8)} (${stack.project_root}, ${stack.branch_context})`
    );
    console.log(stack.id);
  }

  return 0;
};

if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2));
}
