import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

// The dry run (FITME_RELEASE_DRY_RUN=1) is the only way to smoke-test the
// release script: every command reaching EAS, Infisical, npm or the remote is
// printed instead of run. These tests run it against a throwaway repository,
// with tripwires on PATH for every external command; the dry run must never
// reach one.

const SCRIPT = fileURLToPath(new URL("release-ios-local.sh", import.meta.url));
const TAG = "v1.2.3";
const TRIPWIRES = ["eas", "npx", "infisical", "pnpm", "fastlane"];

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

/**
 * @param {string} cwd Repository to run git in.
 * @param {string[]} args git arguments.
 */
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" });

/**
 * A clone of a repository with main and the release tag on origin/main, the
 * listing config and app.json committed as placeholders.
 */
const releaseRepo = () => {
  const root = tempDir("fitme-release-");
  const origin = path.join(root, "origin");
  const checkout = path.join(root, "checkout");

  fs.mkdirSync(path.join(origin, "apps/mobile"), { recursive: true });
  git(origin, ["init", "-q", "-b", "main"]);
  git(origin, ["config", "user.email", "test@example.com"]);
  git(origin, ["config", "user.name", "Test"]);
  fs.writeFileSync(
    path.join(origin, "apps/mobile/app.json"),
    `${JSON.stringify({ expo: { version: "0.0.0" } })}\n`
  );
  fs.writeFileSync(
    path.join(origin, "apps/mobile/store.config.json"),
    `${JSON.stringify({ apple: { version: "0.0.0" }, configVersion: 0 })}\n`
  );
  git(origin, ["add", "."]);
  git(origin, ["commit", "-q", "-m", "release"]);
  git(origin, ["tag", TAG]);
  git(root, ["clone", "-q", origin, checkout]);

  return checkout;
};

/** A PATH directory whose external commands record that they ran, and fail. */
const tripwires = () => {
  const bin = tempDir("fitme-tripwires-");
  const log = path.join(bin, "calls.log");

  for (const name of TRIPWIRES) {
    const file = path.join(bin, name);
    fs.writeFileSync(
      file,
      `#!/bin/sh\necho "${name} $*" >>"${log}"\nexit 97\n`
    );
    fs.chmodSync(file, 0o755);
  }

  return { bin, log };
};

/**
 * @param {string[]} args The script's arguments.
 * @param {{ dryRun?: boolean }} [options] Whether to set FITME_RELEASE_DRY_RUN.
 */
const runRelease = (args, { dryRun = true } = {}) => {
  const checkout = releaseRepo();
  const { bin, log } = tripwires();

  const result = spawnSync("bash", [SCRIPT, ...args], {
    cwd: checkout,
    encoding: "utf-8",
    env: {
      ...process.env,
      FITME_RELEASE_DRY_RUN: dryRun ? "1" : "",
      PATH: `${bin}:${process.env.PATH}`,
    },
  });

  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf-8") : "";

  return { calls, checkout, result };
};

const METADATA_PUSH =
  /\[dry run\] .*eas-cli@\S+ metadata:push --profile production --non-interactive/u;

const BUILD =
  /\[dry run\] .*infisical run --env=prod --path=\/Mobile -- eas build --platform ios --profile production --local/u;

const SUBMIT = /\[dry run\] .*eas submit --platform ios --profile production/u;

const NO_CHANGES = "";

void describe("release-ios-local.sh dry run", () => {
  void test("--listing-only prints the push and runs no external command", () => {
    const { calls, checkout, result } = runRelease(["--listing-only", TAG]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, METADATA_PUSH);
    assert.doesNotMatch(result.stdout, BUILD);
    assert.doesNotMatch(result.stdout, SUBMIT);
    assert.equal(calls, "");
    assert.equal(git(checkout, ["status", "--porcelain"]), NO_CHANGES);
  });

  void test("a full release prints the build, the submit and the push", () => {
    const { calls, checkout, result } = runRelease([TAG]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, BUILD);
    assert.match(result.stdout, SUBMIT);
    assert.match(result.stdout, METADATA_PUSH);
    assert.equal(calls, "");
    assert.equal(git(checkout, ["status", "--porcelain"]), NO_CHANGES);
    assert.equal(
      git(checkout, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
      "main"
    );
  });

  void test("without it, the release reaches the external commands", () => {
    const { calls, result } = runRelease(["--listing-only", TAG], {
      dryRun: false,
    });

    assert.notEqual(result.status, 0);
    assert.notEqual(calls, "");
  });
});
