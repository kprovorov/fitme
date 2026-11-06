/// <reference types="node" />
/// <reference lib="es2023.array" />

// Points a checkout's env files at its own local Supabase stack: the pooler
// port of a local FITME_DATABASE_URL. A remote value is left alone, and so is a
// dir without a package.json (a renamed app's leftover env file). Run by
// scripts/setup.sh after `supabase start`. No app reads the Data API's URL or
// key any more (FIT-549), so those are left as they are.
//
// Usage: node scripts/rewrite-env.mjs <checkout> <supabase start --output-format json output>
// Prints the stack's MCP URL on stdout, and each file it changed on stderr.
import fs from "node:fs";
import path from "node:path";

const LOCAL_POOLER_URL =
  /^(?<prefix>FITME_DATABASE_URL=["']?postgres(?:ql)?:\/\/[^@\s]*@(?:127\.0\.0\.1|localhost):)[^/\n]+/mu;

// The CLI prints progress lines before the JSON, which is on one line.
/** @param {string} output Supabase CLI output. */
export const parseStackOutput = (output) => {
  const json = output
    .split("\n")
    .toReversed()
    .find((line) => line.startsWith("{"));

  if (json === undefined) {
    throw new Error("no JSON in the `supabase start` output");
  }

  /** @type {unknown} */
  const stack = JSON.parse(json);

  if (
    !(stack instanceof Object) ||
    !("env" in stack) ||
    !(stack.env instanceof Object) ||
    !("endpoints" in stack) ||
    !(stack.endpoints instanceof Object) ||
    !("pooler.sql" in stack.endpoints) ||
    !(stack.endpoints["pooler.sql"] instanceof Object) ||
    !("port" in stack.endpoints["pooler.sql"]) ||
    !Number.isInteger(stack.endpoints["pooler.sql"].port)
  ) {
    throw new Error("invalid stack JSON in the `supabase start` output");
  }

  return {
    mcpUrl: "MCP_URL" in stack.env ? stack.env.MCP_URL : undefined,
    poolerPort: Number(stack.endpoints["pooler.sql"].port),
  };
};

// Values may be quoted: `infisical export` (scripts/pull-env.sh) writes KEY='value'.
/**
 * @param {string} text Env file contents.
 * @param {{poolerPort: number}} stack Local stack connection details.
 */
export const rewriteEnvText = (text, { poolerPort }) =>
  text.replace(LOCAL_POOLER_URL, `$<prefix>${poolerPort}`);

/**
 * @param {string} checkout Checkout root directory.
 * @yields {string} Env file paths belonging to current workspaces.
 */
const envFiles = function* envFiles(checkout) {
  for (const parent of ["apps", "packages"]) {
    const parentDir = path.join(checkout, parent);

    if (!fs.existsSync(parentDir)) {
      continue;
    }

    for (const dir of fs.readdirSync(parentDir)) {
      const full = path.join(parentDir, dir);

      if (!fs.existsSync(path.join(full, "package.json"))) {
        continue;
      }

      for (const name of fs.readdirSync(full)) {
        if (name.startsWith(".env") && !name.endsWith(".example")) {
          yield path.join(full, name);
        }
      }
    }
  }
};

/** @param {string[]} args Command-line arguments. */
const main = ([checkout, output]) => {
  if (!(checkout && output)) {
    console.error(
      "Usage: node scripts/rewrite-env.mjs <checkout> <supabase start output>"
    );

    return 2;
  }

  const stack = parseStackOutput(output);

  for (const file of envFiles(checkout)) {
    const before = fs.readFileSync(file, "utf-8");
    const after = rewriteEnvText(before, stack);

    if (after !== before) {
      fs.writeFileSync(file, after);
      console.error(
        `Pointed ${path.relative(checkout, file)} at the local stack`
      );
    }
  }

  console.log(stack.mcpUrl ?? "");

  return 0;
};

if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2));
}
