/// <reference types="node" />
/// <reference lib="es2023.array" />

// Points the apps that reach Postgres at the checkout's own local Supabase
// stack: sets FITME_DATABASE_URL in each one's `.env` to the stack's pooler,
// with the app's own application_name. The file is created (owner-only) when
// it's missing, the line added when the file hasn't got it, and every other
// line left alone. A value pointing at a remote database is left as it is. Run
// by scripts/setup.sh after `supabase start`.
//
// Usage: node scripts/rewrite-env.mjs <checkout> <supabase start --output-format json output>
// Prints the stack's MCP URL on stdout, and each file it changed on stderr.
import fs from "node:fs";
import path from "node:path";

// The app directories under apps/ whose `.env` gets the line; each one's
// directory name is its application_name.
export const DATABASE_APPS = ["api", "arnold", "mcp", "webhooks"];

const LOCAL_POOLER_USER = "fitme.pooler-dev";

// The fitme login's development password (packages/supabase/supabase/roles.sql).
const LOCAL_POOLER_PASSWORD = "fitme-local-only";

const DATABASE_URL_LINE = /^FITME_DATABASE_URL=(?<value>.*)$/u;

// dotenv's value syntax: a quoted value ends at its closing quote, an unquoted
// one at an inline ` #` comment; whatever follows is a comment.
const QUOTED = /^(?<quote>["'`])(?<inner>.*?)\k<quote>/u;
const INLINE_COMMENT = /\s+#.*$/u;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

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

/**
 * @param {number} poolerPort The stack's pooler port.
 * @param {string} app The app's application_name.
 */
export const localDatabaseUrl = (poolerPort, app) =>
  `postgresql://${LOCAL_POOLER_USER}:${LOCAL_POOLER_PASSWORD}@127.0.0.1:${poolerPort}/postgres?application_name=${app}`;

// A Postgres URL on any host but this machine's. Values may be quoted:
// `infisical export` (scripts/pull-env.sh) writes KEY='value'. An empty value,
// a placeholder or anything else that isn't a URL counts as local.
/** @param {string} value The line's value, as written. */
const isRemote = (value) => {
  const trimmed = value.trim();

  const unquoted =
    QUOTED.exec(trimmed)?.groups?.inner ?? trimmed.replace(INLINE_COMMENT, "");

  if (!URL.canParse(unquoted)) {
    return false;
  }

  const { hostname, protocol } = new URL(unquoted);

  return (
    (protocol === "postgres:" || protocol === "postgresql:") &&
    !LOCAL_HOSTS.has(hostname)
  );
};

/**
 * @param {string} text Env file contents (empty for a missing file).
 * @param {{app: string, poolerPort: number}} target The app and its stack.
 */
export const setDatabaseUrl = (text, { app, poolerPort }) => {
  const line = `FITME_DATABASE_URL=${localDatabaseUrl(poolerPort, app)}`;
  const lines = text === "" ? [] : text.split("\n");
  let found = false;

  const updated = lines.map((current) => {
    // A CRLF file keeps its line endings.
    const ending = current.endsWith("\r") ? "\r" : "";

    const value = DATABASE_URL_LINE.exec(
      current.slice(0, current.length - ending.length)
    )?.groups?.value;

    if (value === undefined) {
      return current;
    }

    found = true;

    return isRemote(value) ? current : `${line}${ending}`;
  });

  if (found) {
    return updated.join("\n");
  }

  // A file ending in a newline splits into a trailing "": add the line before it.
  if (updated.at(-1) === "") {
    updated.splice(-1, 0, line);
  } else {
    updated.push(line, "");
  }

  return updated.join("\n");
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

  for (const app of DATABASE_APPS) {
    const dir = path.join(checkout, "apps", app);

    if (!fs.existsSync(path.join(dir, "package.json"))) {
      continue;
    }

    const file = path.join(dir, ".env");
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
    const after = setDatabaseUrl(before, { app, poolerPort: stack.poolerPort });

    if (after !== before) {
      // `mode` only applies when the file is created; an existing one keeps its own.
      fs.writeFileSync(file, after, { mode: 0o600 });
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
