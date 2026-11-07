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
  plugins: [
    ...new Set([
      ...(core.plugins ?? []),
      ...(react.plugins ?? []),
      ...(next.plugins ?? []),
    ]),
  ],
  extends: [
    antiSlop,
    core,
    drizzle,
    reactNative,
    shadcn,
    tanstack,
    tanstackJsPlugins,
    jsPlugins,
  ],
  // CI regenerates these files; lint fixes must not rewrite their public types.
  ignorePatterns: [
    ...core.ignorePatterns,
    // Vendored skill examples have their own dependencies; Claude's skills mirror them.
    ".agents/skills/**/templates/**",
    ".claude/skills/**",
    "apps/mobile/uniwind-types.d.ts",
    "packages/api-client/src/schema.ts",
    "packages/db/src/{schema,relations}.ts",
    "packages/supabase/src/database.types.ts",
  ],
  jsPlugins: [...jsPlugins.jsPlugins, ...shadcn.jsPlugins],
  settings: jsPluginSettings,
  options: { typeAware: true },
  rules: {
    // Empty inputs intentionally fall back with ||; replacing them with ?? changes behavior.
    "typescript/prefer-nullish-coalescing": "off",
    // Native inputs and mutable feature flags deliberately retain explicit conversions.
    "typescript/no-unnecessary-type-conversion": "off",
    // The type-aware exhaustiveness rule checks discriminated unions more precisely.
    "eslint/default-case": "off",
    // Promise-returning adapters keep the callee's promise and synchronous throws.
    "typescript/promise-function-async": "off",
    // Deliberate native/AST boundary casts are explained by anti-slop's safety-comment rule.
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/non-nullable-type-assertion-style": "off",
    // Private JSON readers pair a stored key with its serialized type at the call site.
    "typescript/no-unnecessary-type-parameters": "off",
    // Expression-bodied event/state callbacks already have a void return contract.
    "typescript/no-confusing-void-expression": [
      "error",
      { ignoreArrowShorthand: true },
    ],
    "unicorn/no-useless-undefined": [
      "error",
      { checkArguments: false, checkArrowFunctionBody: false },
    ],
    // Hono middleware and React effects intentionally return Response/cleanup or void.
    "typescript/consistent-return": "off",
    // A callback may discard a value; no-misused-promises still checks discarded promises.
    "typescript/strict-void-return": "off",
    // Shape is a UI geometry term; unknown is the safe input type at an error/JSON boundary.
    "anti-slop/no-shape-in-symbol-names": "off",
    "anti-slop/no-unknown-parameters": "off",
    "anti-slop/no-unknown-returns": "off",
    // Hono's next is middleware continuation, not a Node error-first callback.
    "node/callback-return": ["error", ["callback", "cb"]],
    // Row-presence guards and ReactNode/style unions deliberately use JavaScript truthiness.
    "typescript/strict-boolean-expressions": "off",
    // Inline type imports are safe in Jest's hoisted module factories.
    "typescript/consistent-type-imports": [
      "error",
      { disallowTypeAnnotations: false },
    ],
  },
  overrides: [
    {
      files: ["apps/{web,site}/**"],
      rules: { ...next.rules, ...nextJsPlugins.rules },
    },
    {
      files: ["apps/{mobile,web,site}/**"],
      rules: {
        ...react.rules,
        "react/function-component-definition": [
          "error",
          {
            namedComponents: "arrow-function",
            unnamedComponents: "arrow-function",
          },
        ],
      },
    },
    {
      files: [
        "**/*.{test,spec}.{ts,tsx,mjs}",
        "**/__tests__/**",
        "**/test-utils/**",
      ],
      rules: {
        // Native modules and router boundaries are replaced by the documented fakes.
        "anti-slop/no-module-mocking": "off",
        // Hoisted Jest factories must own their stubs; spies are passed to expect by reference.
        "unicorn/consistent-function-scoping": "off",
        "typescript/unbound-method": "off",
        // Tests inspect raw HTTP JSON and dynamically replace native modules.
        // Application code keeps these unsafe-data checks.
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-argument": "off",
        // Mutable fixtures model several states; their casts describe the simulated boundary.
        "anti-slop/no-known-value-widening": "off",
        "anti-slop/require-safety-comment-for-type-assertion": "off",
        "typescript/no-misused-promises": "off",
        "jest/prefer-called-with": "off",
        "vitest/prefer-called-with": "off",
        // Test helpers are hoisted/referenced before the runner invokes them.
        "eslint/func-style": "off",
        "eslint/no-use-before-define": "off",
        // These tests deliberately inspect native trees, delay work, and assert shell source text.
        "anti-slop/no-runtime-typeof": "off",
        "promise/avoid-new": "off",
        "eslint/prefer-named-capture-group": "off",
        "eslint/no-template-curly-in-string": "off",
        "react/jsx-handler-names": "off",
        "react-doctor/only-export-components": "off",
        "jest/no-conditional-expect": "off",
        "typescript/no-deprecated": "off",
        // Native auth stubs only read state; render helpers deliberately return components.
        "react/hook-use-state": "off",
        "react/function-component-definition": [
          "error",
          {
            namedComponents: ["function-declaration", "arrow-function"],
            unnamedComponents: "arrow-function",
          },
        ],
        "react/display-name": "off",
        // The router stub augments child elements; its providers intentionally rerender with navigation.
        "react/no-clone-element": "off",
        "react/jsx-no-constructed-context-values": "off",
        "eslint/no-nested-ternary": "off",
      },
    },
    {
      files: ["apps/mobile/components/ui/**"],
      rules: {
        // React Native renders semantic native Text, not HTML heading tags.
        "jsx-a11y/prefer-tag-over-role": "off",
      },
    },
    {
      // UI primitives own their composition, as in the upstream shadcn preset.
      files: ["apps/mobile/components/ui/**"],
      rules: { "shadcn/no-restyle": "off" },
    },
    {
      // Expo route segments and EVE tool filenames are framework identifiers.
      files: ["apps/mobile/app/**", "apps/arnold/agent/tools/**"],
      rules: {
        "github/filenames-match-regex": "off",
        "unicorn/filename-case": "off",
      },
    },
    {
      files: ["**/*.integration.test.tsx", "**/vitest.integration.config.ts"],
      rules: { "github/filenames-match-regex": "off" },
    },
    {
      files: ["apps/mobile/hooks/revenueCat.ts"],
      rules: { "unicorn/filename-case": "off" },
    },
    {
      files: ["apps/mobile/**"],
      rules: {
        // Native layout/animation values have no CSS equivalent; token checks run separately.
        "shadcn/no-inline-styles": "off",
        // These primitives expose className for contextual HIG text styles and colors.
        "shadcn/no-restyle": [
          "error",
          {
            allow: ["layout"],
            contracts: [
              {
                pattern: "^(Text|H[1-4]|Muted|Cell|Label|CardTitle|P)$",
                allow: ["layout", "typography", "color"],
              },
              {
                pattern: "^Input$",
                allow: ["layout", "typography", "spacing"],
              },
              {
                pattern: "^(Button|DropdownMenu)$",
                allow: ["layout", "color"],
              },
              {
                pattern: "^(Table|TableRow)$",
                allow: ["layout", "color", "shape"],
              },
            ],
          },
        ],
      },
    },
    {
      // JavaScript's JSDoc casts must remain inline; TypeScript assertion fixes emit invalid JS.
      files: ["**/*.mjs"],
      rules: { "eslint/no-inline-comments": "off" },
    },
    ...(jest.overrides ?? []).map((override) => ({
      ...override,
      files: override.files.map((pattern) => `apps/mobile/${pattern}`),
      rules: {
        ...override.rules,
        "jest/no-untyped-mock-factory": "off",
        "jest/prefer-mock-promise-shorthand": "off",
        // Screen integration tests keep their full assertions and shared setup.
        "jest/max-expects": "off",
        "jest/prefer-strict-equal": "off",
        "jest/require-top-level-describe": "off",
        "jest/prefer-ending-with-an-expect": "off",
        "jest/prefer-lowercase-title": "off",
        "jest/prefer-called-with": "off",
        "jest/no-conditional-expect": "off",
      },
    })),
    ...(vitest.overrides ?? []).map((override) => ({
      ...override,
      files: override.files.flatMap((pattern) => [
        `apps/{api,arnold,library,mcp,web,webhooks}/${pattern}`,
        `packages/${pattern}`,
      ]),
      rules: { ...override.rules, "vitest/prefer-called-with": "off" },
    })),
    {
      files: ["apps/mobile/components/ui/**"],
      rules: { "shadcn/no-restyle": "off" },
    },
  ],
});
