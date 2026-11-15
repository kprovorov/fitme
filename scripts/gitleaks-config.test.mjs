// What .gitleaks.toml's `password-literal` rule flags and what it lets through
// (FIT-425). Runs gitleaks itself over fixture files laid out at their repo
// paths in a temporary directory, so the path allowlists see the same relative
// paths a scan of the checkout does. Skipped without gitleaks on PATH, unless
// FITME_REQUIRE_GITLEAKS is set (the CI `secrets` job, which installs it).
//
// The fixtures' passwords are assembled from pieces, so this file never holds
// a literal the rule would flag in its own commit.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const CONFIG = fileURLToPath(new URL("../.gitleaks.toml", import.meta.url));
const RULE = "password-literal";
const PASS = "pass";
const WORD = `${PASS}word`;
const CAPITAL_WORD = `P${WORD.slice(1)}`;
const MADE_UP_SECRET = `"hunter2hunter2"`;

const hasGitleaks =
  spawnSync("gitleaks", ["version"], { encoding: "utf-8" }).status === 0;

if (!hasGitleaks && process.env.FITME_REQUIRE_GITLEAKS) {
  throw new Error("gitleaks is not on PATH, and FITME_REQUIRE_GITLEAKS is set");
}

/** @type {string[]} */
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

/**
 * The rule ids gitleaks reports for one file at `file` (a repo-relative path)
 * holding `content`.
 *
 * @param {string} file Repo-relative path the fixture is written at.
 * @param {string} content The fixture's content.
 * @returns {string[]} The rule id of each finding.
 */
const findings = (file, content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitme-gitleaks-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
  const report = path.join(dir, "report.json");

  const result = spawnSync(
    "gitleaks",
    [
      "dir",
      file,
      "--config",
      CONFIG,
      "--redact",
      "--no-banner",
      "--log-level",
      "error",
      "--exit-code",
      "0",
      "--report-format",
      "json",
      "--report-path",
      report,
    ],
    { cwd: dir, encoding: "utf-8" }
  );

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(fs.readFileSync(report, "utf-8")).map(
    (/** @type {{ RuleID: string }} */ finding) => finding.RuleID
  );
};

describe("gitleaks password-literal", { skip: !hasGitleaks }, () => {
  test("lets a catalog's UI strings about passwords through", () => {
    const catalog = JSON.stringify(
      {
        auth: {
          [`forgot${CAPITAL_WORD}`]: "Forgot your password?",
          [`remember${CAPITAL_WORD}`]: "Remember your password",
          [`reset${CAPITAL_WORD}`]: "Reset password",
        },
      },
      null,
      2
    );

    for (const language of ["en", "uk", "pt-BR", "zh-Hant"]) {
      assert.deepEqual(
        findings(`packages/i18n/src/catalogs/${language}.json`, catalog),
        []
      );
    }
  });

  test("lets kebab-case route and purpose names through", () => {
    const source = [
      "const descriptions = {",
      `  "reset-${WORD}": "verifyCode.description.reset",`,
      `  'forgot-${WORD}': "verifyCode.description.forgot",`,
      "};",
      "",
    ].join("\n");

    assert.deepEqual(
      findings("apps/mobile/components/views/verify-code-view.tsx", source),
      []
    );
  });

  test("still flags a password outside the allowlisted paths", () => {
    assert.deepEqual(
      findings(
        "apps/mobile/lib/sign-in.ts",
        `const ${WORD} = ${MADE_UP_SECRET};\n`
      ),
      [RULE]
    );
  });

  test("still flags a password in a JSON file outside the catalogs", () => {
    assert.deepEqual(
      findings(
        "packages/i18n/src/config.json",
        `{ "${WORD}": ${MADE_UP_SECRET} }\n`
      ),
      [RULE]
    );
  });

  test("still flags a kebab-case key that isn't a route name", () => {
    assert.deepEqual(
      findings(
        "apps/mobile/lib/config.ts",
        `const config = { "db-${WORD}": ${MADE_UP_SECRET} };\n`
      ),
      [RULE]
    );
  });
});
