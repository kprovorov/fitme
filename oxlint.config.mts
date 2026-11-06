import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import drizzle from "ultracite/oxlint/drizzle";
import jest from "ultracite/oxlint/jest";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import next from "ultracite/oxlint/next";
import nextJsPlugins from "ultracite/oxlint/next/js-plugins";
import react from "ultracite/oxlint/react";
import reactNative from "ultracite/oxlint/react-native";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["github", "react-doctor"]);

export default defineConfig({
  env: core.env,
  extends: [
    antiSlop,
    core,
    drizzle,
    next,
    nextJsPlugins,
    react,
    reactNative,
    shadcn,
    tanstack,
    tanstackJsPlugins,
    jsPlugins,
  ],
  // CI regenerates these files; lint fixes must not rewrite their public types.
  ignorePatterns: [
    ...core.ignorePatterns,
    "apps/mobile/uniwind-types.d.ts",
    "packages/api-client/src/schema.ts",
    "packages/db/src/{schema,relations}.ts",
    "packages/supabase/src/database.types.ts",
  ],
  jsPlugins: [...jsPlugins.jsPlugins, ...shadcn.jsPlugins],
  settings: jsPluginSettings,
  options: { typeAware: true },
  overrides: [
    ...(jest.overrides ?? []).map((override) => ({
      ...override,
      files: override.files.map((pattern) => `apps/mobile/${pattern}`),
      rules: {
        ...override.rules,
        "jest/no-untyped-mock-factory": "off",
        "jest/prefer-mock-promise-shorthand": "off",
      },
    })),
    ...(vitest.overrides ?? []).map((override) => ({
      ...override,
      files: override.files.flatMap((pattern) => [
        `apps/{api,arnold,library,mcp,web,webhooks}/${pattern}`,
        `packages/${pattern}`,
      ]),
    })),
  ],
});
