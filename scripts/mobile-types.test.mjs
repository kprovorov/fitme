/// <reference types="node" />

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { EXPO_ENV, UNIWIND_TYPES, writeMobileTypes } from "./mobile-types.mjs";

const tempMobileDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "fitme-mobile-types-"));

void test("writes both declaration files into an empty app directory", () => {
  const dir = tempMobileDir();

  assert.deepEqual(writeMobileTypes(dir).toSorted(), [
    "expo-env.d.ts",
    "uniwind-types.d.ts",
  ]);
  assert.equal(
    fs.readFileSync(path.join(dir, "expo-env.d.ts"), "utf-8"),
    EXPO_ENV
  );
  assert.equal(
    fs.readFileSync(path.join(dir, "uniwind-types.d.ts"), "utf-8"),
    UNIWIND_TYPES
  );
});

void test("leaves a file Metro already wrote alone", () => {
  const dir = tempMobileDir();
  fs.writeFileSync(path.join(dir, "uniwind-types.d.ts"), "metro's own\n");

  assert.deepEqual(writeMobileTypes(dir), ["expo-env.d.ts"]);
  assert.equal(
    fs.readFileSync(path.join(dir, "uniwind-types.d.ts"), "utf-8"),
    "metro's own\n"
  );
  assert.deepEqual(writeMobileTypes(dir), []);
});

// uniwind's own generator, from the install: `pnpm test:scripts` runs without
// one in CI (the Shell Scripts workflow uses Node built-ins only), so this
// check runs wherever the workspace is installed.
const UNIWIND_GENERATOR = fileURLToPath(
  new URL(
    "../node_modules/uniwind/dist/common/bundler/artifacts/dts.js",
    import.meta.url
  )
);

void test(
  "writes uniwind's own format, so Metro never rewrites it",
  { skip: !fs.existsSync(UNIWIND_GENERATOR) && "uniwind isn't installed" },
  () => {
    const source = fs.readFileSync(UNIWIND_GENERATOR, "utf-8");

    for (const line of UNIWIND_TYPES.split("\n")) {
      if (line.includes("themes:")) {
        assert.match(source, /themes: readonly \$\{stringifiedThemes\}/u);
      } else if (line !== "") {
        assert.ok(source.includes(line), `uniwind no longer writes: ${line}`);
      }
    }
  }
);
