// Picks the local Supabase stacks scripts/destroy-stale-stacks.sh destroys:
// every stack of a checkout that no longer exists, plus, given a checkout path,
// every stack of that checkout.
//
// Usage: node scripts/stale-stacks.mjs <supabase stack list --output-format json output> [checkout]
// Prints one stack id per line on stdout, and what it picked on stderr.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const staleStacks = (
  output,
  { checkout, exists = fs.existsSync } = {}
) => {
  const json = output
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{"));
  if (!json) {
    throw new Error("no JSON in the `supabase stack list` output");
  }
  const own = checkout && path.join(checkout, "packages/supabase");
  return JSON.parse(json).stacks.filter(
    (stack) => stack.project_root === own || !exists(stack.project_root)
  );
};

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
