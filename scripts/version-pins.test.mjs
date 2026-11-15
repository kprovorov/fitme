import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { versionPinProblems } from "./version-pins.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** @type {string[]} */
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

/** @param {string} version The resolved Node runtime. */
const lockfile = (version) =>
  [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    devDependencies:",
    "      husky:",
    "        specifier: ^9.1.7",
    "        version: 9.1.7",
    "      node:",
    "        specifier: runtime:^26.13.1",
    `        version: runtime:${version}`,
    "",
  ].join("\n");

/**
 * A repo root whose pins all agree, with any file's JSON replaced by `files`
 * (a path → its content; a string is written as is).
 * @param {Record<string, unknown>} [files] Files to override or add.
 */
const fixture = (files = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-pins-"));
  tempDirs.push(root);

  /** @type {Record<string, unknown>} */
  const defaults = {
    "apps/api/package.json": {
      devDependencies: { "@types/node": "26.6.6" },
      engines: { node: "26.x" },
    },
    "apps/api/vercel.json": {},
    "apps/mobile/eas.json": {
      build: { base: { node: "26.13.1", pnpm: "12.18.0" } },
    },
    "apps/mobile/package.json": {},
    "apps/web/package.json": { engines: { node: "26.x" } },
    "apps/web/vercel.json": {},
    "package.json": {
      devEngines: { runtime: { name: "node", version: "^26.13.1" } },
      engines: { node: ">=26" },
      packageManager: "pnpm@12.18.0",
    },
    "packages/core/package.json": {
      dependencies: { "@types/node": "26.6.6" },
    },
    "pnpm-lock.yaml": lockfile("26.13.1"),
  };

  for (const [file, content] of Object.entries({ ...defaults, ...files })) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(
      full,
      typeof content === "string" ? content : JSON.stringify(content)
    );
  }

  return root;
};

void describe("versionPinProblems", () => {
  void test("every Node and pnpm pin in this repo is in step", () => {
    assert.deepEqual(versionPinProblems(REPO_ROOT), []);
  });

  void test("passes when every pin agrees", () => {
    assert.deepEqual(versionPinProblems(fixture()), []);
  });

  void test("ignores an app without a vercel.json", () => {
    // apps/mobile has no vercel.json and no engines: nothing to report.
    assert.deepEqual(
      versionPinProblems(fixture({ "apps/mobile/package.json": {} })),
      []
    );
  });

  void test("fails when the root engines.node isn't Node's major and up", () => {
    const root = fixture({
      "package.json": {
        devEngines: { runtime: { name: "node", version: "^26.13.1" } },
        engines: { node: ">=24" },
        packageManager: "pnpm@12.18.0",
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'package.json engines.node is ">=24", not ">=26" (the major of package.json devEngines.runtime ^26.13.1)',
    ]);
  });

  void test("fails for a Vercel app on another Node major", () => {
    const root = fixture({
      "apps/web/package.json": { engines: { node: "24.x" } },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/web/package.json engines.node is "24.x", not "26.x" (the major of package.json devEngines.runtime ^26.13.1)',
    ]);
  });

  void test("fails for a Vercel app without engines.node", () => {
    const root = fixture({ "apps/web/package.json": {} });

    assert.deepEqual(versionPinProblems(root), [
      'apps/web/package.json engines.node is undefined, not "26.x" (the major of package.json devEngines.runtime ^26.13.1)',
    ]);
  });

  void test("fails when the EAS pnpm differs from packageManager", () => {
    const root = fixture({
      "apps/mobile/eas.json": {
        build: { base: { node: "26.13.1", pnpm: "11.28.2" } },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.base.pnpm is "11.28.2", not "12.18.0" (package.json packageManager pnpm@12.18.0)',
    ]);
  });

  void test("fails when the EAS Node is outside devEngines' range", () => {
    const root = fixture({
      "apps/mobile/eas.json": {
        build: { base: { node: "24.11.0", pnpm: "12.18.0" } },
      },
      "pnpm-lock.yaml": lockfile("24.11.0"),
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.base.node is "24.11.0", outside package.json devEngines.runtime ^26.13.1',
    ]);
  });

  void test("fails when the EAS Node is below the range's minimum", () => {
    const root = fixture({
      "apps/mobile/eas.json": {
        build: { base: { node: "26.12.9", pnpm: "12.18.0" } },
      },
      "pnpm-lock.yaml": lockfile("26.12.9"),
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.base.node is "26.12.9", outside package.json devEngines.runtime ^26.13.1',
    ]);
  });

  void test("fails when the EAS Node isn't an exact version", () => {
    const root = fixture({
      "apps/mobile/eas.json": {
        build: { base: { node: "26", pnpm: "12.18.0" } },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.base.node is "26", outside package.json devEngines.runtime ^26.13.1',
      'apps/mobile/eas.json build.base.node is "26", not "26.13.1" (the Node runtime pnpm-lock.yaml resolved)',
    ]);
  });

  void test("fails when the EAS Node differs from the lockfile's Node", () => {
    const root = fixture({ "pnpm-lock.yaml": lockfile("26.14.0") });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.base.node is "26.13.1", not "26.14.0" (the Node runtime pnpm-lock.yaml resolved)',
    ]);
  });

  void test("fails for another EAS profile overriding Node or pnpm", () => {
    const root = fixture({
      "apps/mobile/eas.json": {
        build: {
          base: { node: "26.13.1", pnpm: "12.18.0" },
          preview: { extends: "base" },
          production: { extends: "base", node: "24.11.0", pnpm: "11.28.2" },
        },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/mobile/eas.json build.production.pnpm is "11.28.2", not "12.18.0" (package.json packageManager pnpm@12.18.0)',
      'apps/mobile/eas.json build.production.node is "24.11.0", outside package.json devEngines.runtime ^26.13.1',
      'apps/mobile/eas.json build.production.node is "24.11.0", not "26.13.1" (the Node runtime pnpm-lock.yaml resolved)',
    ]);
  });

  void test("reads the lockfile's Node past the env document's root importer", () => {
    const envDocument = [
      "---",
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    packageManagerDependencies:",
      "      pnpm:",
      "        specifier: 12.18.0",
      "        version: 12.18.0",
      "",
      "---",
      "",
    ].join("\n");

    const root = fixture({
      "pnpm-lock.yaml": `${envDocument}${lockfile("26.13.1")}`,
    });

    assert.deepEqual(versionPinProblems(root), []);
  });

  void test("reads a lockfile checked out with CRLF line endings", () => {
    const root = fixture({
      "pnpm-lock.yaml": lockfile("26.13.1").replaceAll("\n", "\r\n"),
    });

    assert.deepEqual(versionPinProblems(root), []);
  });

  void test("reads only the root importer's Node, not a workspace's", () => {
    const workspaceOnly = [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    devDependencies:",
      "      husky:",
      "        specifier: ^9.1.7",
      "        version: 9.1.7",
      "",
      "  apps/api:",
      "    devDependencies:",
      "      node:",
      "        specifier: runtime:^26.13.1",
      "        version: runtime:26.13.1",
      "",
    ].join("\n");

    assert.deepEqual(
      versionPinProblems(fixture({ "pnpm-lock.yaml": workspaceOnly })),
      [
        "pnpm-lock.yaml has no resolved Node runtime for the root importer: run `pnpm install`",
      ]
    );
  });

  void test("fails when the lockfile has no resolved Node", () => {
    const root = fixture({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });

    assert.deepEqual(versionPinProblems(root), [
      "pnpm-lock.yaml has no resolved Node runtime for the root importer: run `pnpm install`",
    ]);
  });

  void test("fails for a workspace whose @types/node differs from the rest", () => {
    const root = fixture({
      "packages/db/package.json": {
        devDependencies: { "@types/node": "24.19.2" },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'packages/db/package.json @types/node is "24.19.2", not "26.6.6" (apps/api/package.json and the other workspaces)',
    ]);
  });

  void test("fails for an @types/node range among exact versions", () => {
    const root = fixture({
      "packages/db/package.json": { devDependencies: { "@types/node": "^26" } },
    });

    assert.deepEqual(versionPinProblems(root), [
      'packages/db/package.json @types/node is "^26", not "26.6.6" (apps/api/package.json and the other workspaces)',
    ]);
  });

  void test("fails when the shared @types/node isn't on Node's major", () => {
    const root = fixture({
      "apps/api/package.json": {
        devDependencies: { "@types/node": "24.19.2" },
        engines: { node: "26.x" },
      },
      "packages/core/package.json": {
        dependencies: { "@types/node": "24.19.2" },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/api/package.json @types/node is "24.19.2", not on Node\'s major 26 (package.json devEngines.runtime ^26.13.1)',
      'packages/core/package.json @types/node is "24.19.2", not on Node\'s major 26 (package.json devEngines.runtime ^26.13.1)',
    ]);
  });

  void test("on a tie, names the workspaces off Node's major", () => {
    const root = fixture({
      "apps/api/package.json": {
        devDependencies: { "@types/node": "24.19.2" },
        engines: { node: "26.x" },
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'apps/api/package.json @types/node is "24.19.2", not "26.6.6" (packages/core/package.json and the other workspaces)',
    ]);
  });

  void test("fails when devEngines.runtime isn't a caret range", () => {
    const root = fixture({
      "package.json": {
        devEngines: { runtime: { name: "node", version: ">=26" } },
        packageManager: "pnpm@12.18.0",
      },
    });

    assert.deepEqual(versionPinProblems(root), [
      'package.json devEngines.runtime.version is ">=26", not a caret range (^x.y.z)',
    ]);
  });
});
