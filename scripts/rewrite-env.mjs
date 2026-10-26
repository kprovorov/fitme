// Points a checkout's env files at its own local Supabase stack: the local
// Supabase URL and key, and the pooler port of a local FITME_DATABASE_URL. A
// remote value is left alone, and so is a dir without a package.json (a renamed
// app's leftover env file). Run by scripts/setup.sh after `supabase start`.
//
// Usage: node scripts/rewrite-env.mjs <checkout> <supabase start --output-format json output>
// Prints the stack's MCP URL on stdout, and each file it changed on stderr.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_URL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?)?$/;
const URL_KEY_PAIRS = [
  ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"],
  ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
];
const LOCAL_POOLER_URL =
  /^(FITME_DATABASE_URL=["']?postgres(?:ql)?:\/\/[^@\s]*@(?:127\.0\.0\.1|localhost):)[^/\n]+/m;
const QUOTED = /^(["'])(.*)\1$/;

// Values may be quoted: `infisical export` (scripts/pull-env.sh) writes KEY='value'.
const unquote = (value) => value.trim().replace(QUOTED, "$2");

// The CLI prints progress lines before the JSON, which is on one line.
export const parseStackOutput = (output) => {
  const json = output
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{"));
  if (!json) {
    throw new Error("no JSON in the `supabase start` output");
  }
  const stack = JSON.parse(json);
  return {
    apiUrl: stack.env.API_URL,
    mcpUrl: stack.env.MCP_URL,
    poolerPort: stack.endpoints["pooler.sql"].port,
    publishableKey: stack.env.PUBLISHABLE_KEY,
  };
};

export const rewriteEnvText = (
  text,
  { apiUrl, publishableKey, poolerPort }
) => {
  let result = text;
  for (const [urlKey, anonKey] of URL_KEY_PAIRS) {
    const current = result.match(new RegExp(`^${urlKey}=(.*)$`, "m"));
    if (!(current && LOCAL_URL.test(unquote(current[1])))) {
      continue;
    }
    result = result.replace(
      new RegExp(`^${urlKey}=.*$`, "m"),
      `${urlKey}=${apiUrl}`
    );
    result = result.replace(
      new RegExp(`^${anonKey}=.*$`, "m"),
      `${anonKey}=${publishableKey}`
    );
  }
  return result.replace(LOCAL_POOLER_URL, `$1${poolerPort}`);
};

const envFiles = function* (checkout) {
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

const main = ([checkout, output]) => {
  if (!(checkout && output)) {
    console.error(
      "Usage: node scripts/rewrite-env.mjs <checkout> <supabase start output>"
    );
    return 2;
  }
  const stack = parseStackOutput(output);
  for (const file of envFiles(checkout)) {
    const before = fs.readFileSync(file, "utf8");
    const after = rewriteEnvText(before, stack);
    if (after !== before) {
      fs.writeFileSync(file, after);
      console.error(
        `Pointed ${path.relative(checkout, file)} at the local stack`
      );
    }
  }
  console.log(stack.mcpUrl);
  return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
