import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseStackOutput, rewriteEnvText } from "./rewrite-env.mjs";

const NO_JSON = /no JSON/;
const POINTED_MOBILE = /Pointed apps\/mobile\/\.env at the local stack/;
const USAGE = /Usage/;

const SCRIPT = fileURLToPath(new URL("./rewrite-env.mjs", import.meta.url));

const tempDirs = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

const stack = {
  apiUrl: "http://127.0.0.1:55321",
  poolerPort: 55_329,
  publishableKey: "sb_publishable_new",
};

const stackOutput = (mcpUrl = "http://127.0.0.1:55321/mcp") =>
  [
    "Starting database...",
    JSON.stringify({
      endpoints: { "pooler.sql": { port: stack.poolerPort } },
      env: {
        API_URL: stack.apiUrl,
        MCP_URL: mcpUrl,
        PUBLISHABLE_KEY: stack.publishableKey,
      },
    }),
    "",
  ].join("\n");

describe("parseStackOutput", () => {
  test("reads the JSON line after any progress lines", () => {
    assert.deepEqual(parseStackOutput(stackOutput()), {
      ...stack,
      mcpUrl: "http://127.0.0.1:55321/mcp",
    });
  });

  test("throws without a JSON line", () => {
    assert.throws(() => parseStackOutput("Starting database...\n"), NO_JSON);
  });
});

describe("rewriteEnvText", () => {
  test("points a local Supabase URL and its key at the stack", () => {
    const before =
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=old\nOTHER=1\n";
    assert.equal(
      rewriteEnvText(before, stack),
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_new\nOTHER=1\n"
    );
  });

  test("reads values quoted the way `infisical export` writes them", () => {
    const before =
      "NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321'\nNEXT_PUBLIC_SUPABASE_ANON_KEY='old'\n";
    assert.equal(
      rewriteEnvText(before, stack),
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_new\n"
    );
  });

  test("rewrites an empty URL (a placeholder) too", () => {
    const before =
      'EXPO_PUBLIC_SUPABASE_URL=""\nEXPO_PUBLIC_SUPABASE_ANON_KEY=\n';
    assert.equal(
      rewriteEnvText(before, stack),
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_new\n"
    );
  });

  test("leaves a remote Supabase URL and its key alone", () => {
    const before =
      "EXPO_PUBLIC_SUPABASE_URL=https://abc.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=remote\n";
    assert.equal(rewriteEnvText(before, stack), before);
  });

  test("moves a local pooler URL to the stack's pooler port, quoted or not", () => {
    for (const quote of ["", "'", '"']) {
      const before = `FITME_DATABASE_URL=${quote}postgresql://fitme.pooler-dev:pw@127.0.0.1:54329/postgres?application_name=api${quote}\n`;
      assert.equal(
        rewriteEnvText(before, stack),
        `FITME_DATABASE_URL=${quote}postgresql://fitme.pooler-dev:pw@127.0.0.1:55329/postgres?application_name=api${quote}\n`
      );
    }
  });

  test("leaves a remote pooler URL alone", () => {
    const before =
      "FITME_DATABASE_URL=postgresql://fitme.ref:pw@aws-0.pooler.supabase.com:6543/postgres\n";
    assert.equal(rewriteEnvText(before, stack), before);
  });
});

describe("the CLI", () => {
  const checkout = () => {
    const root = tempDir("rewrite-env-");
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    write("apps/mobile/package.json", "{}");
    write(
      "apps/mobile/.env",
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=old\n"
    );
    write("apps/mobile/.env.example", "EXPO_PUBLIC_SUPABASE_URL=\n");
    write("packages/db/package.json", "{}");
    write(
      "packages/db/.env",
      "FITME_DATABASE_URL=postgresql://u:p@localhost:54329/postgres\n"
    );
    // An orphan: a renamed app's leftover env file, no package.json.
    write(
      "apps/retired/.env",
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n"
    );
    return root;
  };

  const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");

  test("rewrites every app's and package's env files and prints the MCP URL", () => {
    const root = checkout();
    const run = spawnSync(process.execPath, [SCRIPT, root, stackOutput()], {
      encoding: "utf8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "http://127.0.0.1:55321/mcp\n");
    assert.equal(
      read(root, "apps/mobile/.env"),
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_new\n"
    );
    assert.equal(
      read(root, "packages/db/.env"),
      "FITME_DATABASE_URL=postgresql://u:p@localhost:55329/postgres\n"
    );
    assert.equal(
      read(root, "apps/mobile/.env.example"),
      "EXPO_PUBLIC_SUPABASE_URL=\n"
    );
    assert.equal(
      read(root, "apps/retired/.env"),
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n"
    );
    assert.match(run.stderr, POINTED_MOBILE);
  });

  test("fails without its arguments", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, USAGE);
  });

  test("fails on output with no JSON, printing nothing to stdout", () => {
    const run = spawnSync(process.execPath, [SCRIPT, checkout(), "oops"], {
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdout, "");
  });
});
