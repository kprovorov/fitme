import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseStackOutput, setDatabaseUrl } from "./rewrite-env.mjs";

const NO_JSON = /no JSON/u;
const POINTED_API = /Pointed apps\/api\/\.env at the local stack/u;
const USAGE = /Usage/u;

const SCRIPT = fileURLToPath(new URL("rewrite-env.mjs", import.meta.url));

/** @type {string[]} */
const tempDirs = [];

/** @param {string} prefix Temporary directory name prefix. */
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

const POOLER_PORT = 55_329;
const target = { app: "api", poolerPort: POOLER_PORT };

/** @param {string} app The app's application_name. */
const localLine = (app) =>
  `FITME_DATABASE_URL=postgresql://fitme.pooler-dev:fitme-local-only@127.0.0.1:55329/postgres?application_name=${app}`;

const REMOTE =
  "FITME_DATABASE_URL=postgresql://fitme.ref:pw@aws-0.pooler.supabase.com:6543/postgres?application_name=api";

const stackOutput = (mcpUrl = "http://127.0.0.1:55321/mcp") =>
  [
    "Starting database...",
    JSON.stringify({
      endpoints: { "pooler.sql": { port: POOLER_PORT } },
      env: {
        API_URL: "http://127.0.0.1:55321",
        MCP_URL: mcpUrl,
        PUBLISHABLE_KEY: "sb_publishable_new",
      },
    }),
    "",
  ].join("\n");

void describe("parseStackOutput", () => {
  void test("reads the JSON line after any progress lines", () => {
    assert.deepEqual(parseStackOutput(stackOutput()), {
      mcpUrl: "http://127.0.0.1:55321/mcp",
      poolerPort: POOLER_PORT,
    });
  });

  void test("throws without a JSON line", () => {
    assert.throws(() => parseStackOutput("Starting database...\n"), NO_JSON);
  });
});

void describe("setDatabaseUrl", () => {
  void test("writes the one line into an empty file", () => {
    assert.equal(setDatabaseUrl("", target), `${localLine("api")}\n`);
  });

  void test("adds the line to a file without it, leaving the others alone", () => {
    assert.equal(
      setDatabaseUrl("CLERK_JWT_KEY='key'\nOTHER=1\n", target),
      `CLERK_JWT_KEY='key'\nOTHER=1\n${localLine("api")}\n`
    );
  });

  void test("adds the line to a file with no final newline", () => {
    assert.equal(
      setDatabaseUrl("OTHER=1", target),
      `OTHER=1\n${localLine("api")}\n`
    );
  });

  void test("replaces a local URL with this stack's port and the app's name, quoted or not", () => {
    for (const quote of ["", "'", '"']) {
      const before = `A=1\nFITME_DATABASE_URL=${quote}postgresql://u:p@localhost:54329/postgres?application_name=web${quote}\nB=2\n`;

      assert.equal(
        setDatabaseUrl(before, { app: "mcp", poolerPort: POOLER_PORT }),
        `A=1\n${localLine("mcp")}\nB=2\n`
      );
    }
  });

  void test("replaces an empty value or a placeholder", () => {
    for (const value of [
      "",
      "postgresql://u:p@127.0.0.1:<pooler port>/postgres",
    ]) {
      assert.equal(
        setDatabaseUrl(`FITME_DATABASE_URL=${value}\n`, target),
        `${localLine("api")}\n`
      );
    }
  });

  void test("leaves a remote URL alone, quoted or not", () => {
    for (const before of [
      `${REMOTE}\n`,
      `X=1\n${REMOTE.replace("=", "='")}'\n`,
    ]) {
      assert.equal(setDatabaseUrl(before, target), before);
    }
  });

  void test("reads a CRLF file's lines, keeping their endings", () => {
    const remote = `A=1\r\n${REMOTE}\r\n`;

    assert.equal(setDatabaseUrl(remote, target), remote);
    assert.equal(
      setDatabaseUrl(
        "A=1\r\nFITME_DATABASE_URL=postgresql://u:p@127.0.0.1:1/postgres\r\n",
        target
      ),
      `A=1\r\n${localLine("api")}\r\n`
    );
  });

  void test("leaves a commented-out line alone", () => {
    assert.equal(
      setDatabaseUrl("# FITME_DATABASE_URL=old\n", target),
      `# FITME_DATABASE_URL=old\n${localLine("api")}\n`
    );
  });
});

void describe("the CLI", () => {
  const checkout = () => {
    const root = tempDir("rewrite-env-");

    /**
     * @param {string} rel Path relative to the checkout.
     * @param {string} text File contents.
     */
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };

    for (const app of ["api", "arnold", "mcp", "webhooks", "mobile"]) {
      write(`apps/${app}/package.json`, "{}");
    }

    write(
      "apps/api/.env",
      "CLERK_JWT_KEY='key'\nFITME_DATABASE_URL='postgresql://u:p@127.0.0.1:54329/postgres?application_name=api'\n"
    );
    write("apps/mcp/.env", "LIBRARY_URL=http://localhost:3006\n");
    write("apps/webhooks/.env", `${REMOTE}\n`);
    write(
      "apps/api/.env.example",
      "FITME_DATABASE_URL=postgresql://u:p@127.0.0.1:54329/postgres\n"
    );
    write("apps/mobile/.env", "EXPO_PUBLIC_API_URL=http://localhost:3003\n");

    return root;
  };

  /**
   * @param {string} root Checkout directory.
   * @param {string} rel Path relative to the checkout.
   */
  const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf-8");

  void test("points the four database apps' .env at the stack and prints the MCP URL", () => {
    const root = checkout();

    const run = spawnSync(process.execPath, [SCRIPT, root, stackOutput()], {
      encoding: "utf-8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "http://127.0.0.1:55321/mcp\n");
    assert.equal(
      read(root, "apps/api/.env"),
      `CLERK_JWT_KEY='key'\n${localLine("api")}\n`
    );
    assert.equal(read(root, "apps/arnold/.env"), `${localLine("arnold")}\n`);
    assert.equal(
      (fs.statSync(path.join(root, "apps/arnold/.env")).mode % 0o1000).toString(
        8
      ),
      "600"
    );
    assert.equal(
      read(root, "apps/mcp/.env"),
      `LIBRARY_URL=http://localhost:3006\n${localLine("mcp")}\n`
    );
    assert.equal(read(root, "apps/webhooks/.env"), `${REMOTE}\n`);
    assert.equal(
      read(root, "apps/api/.env.example"),
      "FITME_DATABASE_URL=postgresql://u:p@127.0.0.1:54329/postgres\n"
    );
    assert.equal(
      read(root, "apps/mobile/.env"),
      "EXPO_PUBLIC_API_URL=http://localhost:3003\n"
    );
    assert.match(run.stderr, POINTED_API);
  });

  void test("skips an app the checkout hasn't got", () => {
    const root = checkout();
    fs.rmSync(path.join(root, "apps/arnold"), { recursive: true });

    const run = spawnSync(process.execPath, [SCRIPT, root, stackOutput()], {
      encoding: "utf-8",
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.existsSync(path.join(root, "apps/arnold")), false);
  });

  void test("fails without its arguments", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, USAGE);
  });

  void test("fails on output with no JSON, printing nothing to stdout", () => {
    const run = spawnSync(process.execPath, [SCRIPT, checkout(), "oops"], {
      encoding: "utf-8",
    });

    assert.notEqual(run.status, 0);
    assert.equal(run.stdout, "");
  });
});
