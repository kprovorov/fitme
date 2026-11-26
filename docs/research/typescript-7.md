# Should the repo move to TypeScript 7?

Research note, 2026-11-24 (FIT-155). Three questions come from the issue. Which of our tools work with TypeScript 7 today, and which still need the JS API? Can we run the native compiler for `pnpm typecheck` only? What changes in `packages/typescript-config`? The issue's comments add a fourth: is 6.x a required stepping stone?

Repo facts are cited as `path:line` at `b99cb39e`. Tool facts come from the installed versions (`pnpm-lock.yaml`) in `node_modules`, and from npm through `npm view`. External claims link to the source that owns them. Anything I couldn't check is marked **(unverified)**. What was run, and where, is in §7.

## TL;DR

- **Recommendation: move `typescript` to 6.0.3 everywhere now and run `pnpm typecheck` on 7.0.2 beside it. Don't make 7 the only compiler yet.** First, add `"types": ["node"]` to `apps/mobile/tsconfig.json`. That is the only tsconfig change 6 or 7 needs.
- **All 19 workspaces typecheck on 6.0.3 and 7.0.2.** With today's tsconfigs 18 pass and `apps/mobile` fails with the same 9 errors on both, all from the new `types` default. The one line fixes it, and 5.9.3 stays green with it (§1).
- **The issue's premise doesn't hold: the bundlers don't need the JS API.** tsdown (no declaration output), Metro, Jest, `eve build`, knip and `next build` all ran with `typescript` swapped for 7.0.2. Four things break: our three AST scripts and `openapi-typescript` (§3).
- **6 isn't a required stepping stone for typechecking.** 5.9 → 7 works. 6 is still the right version for the JS API: TypeScript calls it API-compatible with 5.9, Expo SDK 58 expects `~6.0.3`, and it's what TypeScript supports next to 7 (§2).
- **The gain is real but small today.** A cold `turbo run typecheck` went from 14–15 s to 11–12 s on an M4 Pro; the rest is mostly pnpm and turbo start-up. The compiler's own CPU time halves (45 s → 21 s), which should matter more on the 2-core agent box. The CI step is 32–46 s; its saving is **(unverified)**.
- **We already run TypeScript 7's checker**: `pnpm check` is type-aware (`oxlint.config.mts:50`) through `oxlint-tsgolint` 7.0.2007, [built on TypeScript 7.0.2](https://github.com/oxc-project/tsgolint#versioning). So lint and typecheck use different checkers today, and lint sees mobile without Node's types (§4).
- **The lasting blocker is `openapi-typescript`.** It needs the 5.x/6.x API, and its author [ended updates on 2026-09-19](https://github.com/openapi-ts/openapi-typescript/issues/2874). Waiting won't fix it; it has to be replaced, or kept on 6.
- **7.1 brings the new JS API but isn't out.** Its [iteration plan](https://github.com/microsoft/TypeScript/issues/63703) put stable at today. npm has `7.1.0-beta` and no RC. The beta fails six of our workspaces on a compiler bug that is [fixed](https://github.com/microsoft/TypeScript/issues/64974) in the nightly. Skip the beta.

## 1. Typecheck results

`tsc -p <workspace> --noEmit --incremental false`, one at a time, from a scratch install outside the repo. 5.9.3 is green everywhere, so a failure is the newer version's. Times are approximate seconds (Apple M4 Pro, 12 cores, shared machine).

| Workspace | 5.9.3 | 6.0.3 | 7.0.2 | 7.1.0-beta |
| --- | --- | --- | --- | --- |
| `apps/api` | ok 2.9 | ok 2.6 | ok 1.3 | 5 × TS7031 |
| `apps/arnold` | ok 1.9 | ok 1.8 | ok 0.4 | 5 × TS7031 |
| `apps/library` | ok 1.4 | ok 1.3 | ok 0.3 | ok |
| `apps/mcp` | ok 1.9 | ok 1.9 | ok 0.4 | 14 × TS7031 |
| `apps/mobile` | ok 5.0 | **9 errors** 4.2 | **9 errors** 1.0 | 9 + 16 × TS7031 |
| `apps/site` | ok 1.3 | ok 1.1 | ok 0.2 | ok |
| `apps/web` | ok 1.6 | ok 1.4 | ok 0.2 | ok |
| `apps/webhooks` | ok 1.2 | ok 1.3 | ok 0.3 | ok |
| `packages/api-client` | ok 0.5 | ok 0.3 | ok 0.1 | ok |
| `packages/core` | ok 0.5 | ok 0.3 | ok 0.1 | ok |
| `packages/db` | ok 0.8 | ok 0.9 | ok 0.4 | ok |
| `packages/design-tokens` | ok 0.4 | ok 0.4 | ok 0.1 | ok |
| `packages/i18n` | ok 1.1 | ok 1.1 | ok 0.4 | ok |
| `packages/library-bundle` | ok 0.7 | ok 0.6 | ok 0.1 | 5 × TS7031 |
| `packages/library-sdk` | ok 0.6 | ok 0.3 | ok 0.1 | 11 × TS7031 |
| `packages/observability` | ok 0.4 | ok 0.4 | ok 0.1 | ok |
| `packages/rate-limit` | ok 0.3 | ok 0.3 | ok 0.1 | ok |
| `packages/services` | ok 1.6 | ok 1.6 | ok 0.3 | ok |
| `packages/supabase` | ok 0.3 | ok 0.3 | ok 0.1 | ok |
| **Sum of wall times** | 24.5 | 22.0 | 5.5 | 4.6 |

`packages/typescript-config` has no tsconfig of its own.

**Mobile's 9 errors, one cause: [`types` now defaults to `[]`](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/#types-now-defaults-to).** On 5.9 every `@types/*` in the hoisted `node_modules` was included. The first error, the same on both versions:

```
__tests__/app-languages-config.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
```

| Code | Count | Where |
| --- | --- | --- |
| TS2591 (`node:fs`, `node:path`, `node:crypto`, `Buffer`) | 7 | `__tests__/app-languages-config.test.ts`, `__tests__/arnold-screen.test.tsx`, `__tests__/planner-screen.test.tsx`, `test-utils/in-memory-file-system.ts`, and `packages/library-bundle/src/in-memory-library.ts` (in mobile's program through the fake Public API) |
| TS2304 (`global`) | 1 | `components/__tests__/minimum-version-gate.test.tsx:79` |
| TS2322 (`fetch` without Node's overload) | 1 | `lib/__tests__/library.test.tsx:48` |

Mobile error counts with `types` set:

| `types`            | 5.9.3 | 6.0.3 | 7.0.2 |
| ------------------ | ----- | ----- | ----- |
| `["node"]`         | 0     | 0     | 0     |
| `["node", "jest"]` | 0     | 0     | 0     |
| `["*"]`            | 1     | 0     | 0     |

With `["node"]`, every workspace passed on 5.9.3, 6.0.3 and 7.0.2. The 2026-11-24 nightly (`7.1.0-dev.20261124.1`) passed all 19 too. `web` and `site` also pass on 5.9.3, 6.0.3 and 7.0.2 with `next-env.d.ts` and `.next/types` present, after a `next build`.

**The 7.1 beta's TS7031** ("Binding element 'language' implicitly has an 'any' type") is every extra error it reports. It's [TypeScript #64974](https://github.com/microsoft/TypeScript/issues/64974), a destructured parameter with a `= {}` default losing its contextual type (closed 2026-11-18). The affected lines have that form, for example `packages/library-sdk/src/client.ts:292`.

**Cost of a run** (§7 explains the method):

|  | 5.9.3 | 7.0.2 |
| --- | --- | --- |
| CPU (user + sys), all 19, one at a time | 45 s (6.0.3: 42 s) | 21 s |
| Cold `turbo run typecheck --force`, two runs each | 14.1 / 15.4 s | 11.2 / 11.8 s |
| `apps/mobile`, wall / peak memory | 4.1 s / 1.37 GB | 0.9 s / 1.24 GB (4 checkers); 1.5 s / 0.88 GB (`--checkers 1`) |
| `next build` type step, web | 1.9 s | 0.3 s |
| `next build` type step, site | 1.6 s | 0.5 s |

## 2. What 6.0, 7.0 and 7.1 ship

Dates are from `npm view typescript time`.

|  | Version, date | Facts |
| --- | --- | --- |
| 5.9 | 5.9.3, 2025-09-30 | What we run. |
| 6.0 | 6.0.2 on 2026-03-23, 6.0.3 on 2026-04-16 | Last JS compiler line. "[API compatible with TypeScript 5.9](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/#breaking-changes-and-deprecations-in-typescript-60)". Ships `tsc` and `tsserver`. |
| 7.0 | 7.0.2, 2026-07-08 (`latest`) | Package `typescript`, one binary, **`tsc`**. The root export is only `version`. "[It does not ship with an API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)"; `typescript/unstable/*` exists. No `tsserver` (the editor uses LSP), no install script, about 26 MB per platform binary. |
| `tsgo` | `@typescript/native-preview`, last build 2026-07-07 | The preview's binary name. Nightlies [moved to `typescript@next`](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#nightly-builds-and-typescriptnative-preview). There is no `tsgo` in `typescript` 7. |
| 7.1 | 7.1.0-beta, 2026-10-20; no RC on npm | [New API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/#typescript-71-api) at `typescript/sync`, `/async`, `/fs`, `/ast`. The root export is still only `version`, so an old `import ts from "typescript"` won't come back. |

**Is 6 a required step?**

- For typechecking, no: §1 went from 5.9.3 to 7.0.2 with one tsconfig line. TypeScript says code clean on 6.0 (with `stableTypeOrdering`, without `ignoreDeprecations`) "[should compile identically](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#updates-since-5x-and-new-behaviors-from-60)" on 7.0. It encourages adopting 6 first but doesn't require it.
- For the JS API, 6 is the official neighbour. The announcement's setup is `typescript` aliased to [`@typescript/typescript6`](https://www.npmjs.com/package/@typescript/typescript6) (binary `tsc6`, re-exports the 6.0 API) plus `@typescript/native` aliased to `typescript@^7.0.2` ([same section](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)).
- Expo SDK 58 [expects `typescript ~6.0.3`](https://api.expo.dev/v2/versions). With `typescript` taken out of `apps/mobile/package.json:152`, `expo install --check` says `typescript@5.9.3 - expected version: ~6.0.3`.

**CLI parity in 7.0.** `--build`, `--incremental`, `--watch`, `--declaration` and `--plugins` are all in `tsc --help --all`. `--watch` is [rebuilt on a port of Parcel's watcher](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#improved---watch-mode), and `--builders` parallelizes project references. We use none of `--build`, project references, `tsc --watch` or `tsc` emit: every typecheck script is `tsc --noEmit`, and every preset sets `noEmit`. So only `incremental` (the Next apps) applies, and it worked under 7.0.2. JavaScript/JSDoc checking [differs](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md). No tsconfig here sets `checkJs`.

**Language service plugins.** TypeScript recommends 7 "[in scenarios where language server plugins are not required](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#typescript-and-embedded-languages)". 7.1's [content mappers](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/#content-mappers) serve embedded file types (Vue, MDX) and aren't a port of tsserver plugins, so the Next plugin (§4) has no 7.x home that I found **(unverified)**.

## 3. What needs the JS API

### 3.1 Our own code

A grep of every tracked `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` and `.mts` file finds three importers. The issue knew of two.

| File | Uses | On 6.0.3 | On 7.0.2 |
| --- | --- | --- | --- |
| `packages/design-tokens/src/literal-check.ts:5`, `:193` | `createSourceFile`, `forEachChild`, node guards, `SyntaxKind` | ok | `TypeError: Cannot read properties of undefined (reading 'Latest')`; 20 of 153 tests fail |
| `packages/i18n/src/text-check.ts:5`, `:255` | the same | ok | `TypeError … (reading 'PlusToken')` at import; its test file fails |
| `packages/db/scripts/sort-generated-members.ts:2`, `:21` | `ts.transform`, `visitEachChild`, `context.factory`, `createPrinter` (for `schema:generate`) | ok | 3 of 3 tests fail |

Porting to 7.1 looks possible, but it's a rewrite. `typescript/sync`'s `API` has `createSourceFile` and a `printNode`, and `typescript/ast/is` has the guards. There is no `ts.transform` or top-level `forEachChild` in the beta's exports I looked at, and every parse goes through the native process. I read the exports only; no port was written **(unverified)**. `oxc-parser` is the other obvious parser for the two checks **(unverified)**.

### 3.2 Every `typescript` peer or dependency in `pnpm-lock.yaml`

| Package | Declares | Here through | On 7 |
| --- | --- | --- | --- |
| `openapi-typescript` 7.13.0 | peer `^5.x`, required | `packages/api-client/package.json:13`, `:23` | **Breaks** (exits 1; [#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841)). On 6.0.3 it runs and its output is byte-identical to 5.9.3's; only the peer range complains. [Unmaintained](https://github.com/openapi-ts/openapi-typescript/issues/2874). |
| `typescript-eslint` 8.72.1, its seven `@typescript-eslint/*` packages, `ts-api-utils` 2.5.0 | peer `>=4.8.4 <6.1.0`, required (`ts-api-utils`: `>=4.8.4`) | `eslint-plugin-github` 6.1.2, which depends on `typescript ^6.0.3` (an oxlint JS plugin) | Doesn't matter: it already resolves its own nested 6.0.3. The latest, 8.74.0, still caps at `<6.1.0`; [tracking issue](https://github.com/typescript-eslint/typescript-eslint/issues/10940) open. |
| `just-bash` 3.6.0 | dependency `^5.9.3` | eve, `apps/arnold` | Gets its own nested 5.9.3. |
| `run` 2.1.3 | peer `>=5.1.6 <7`, optional | `just-bash` | Gets the nested 5.9.3 too. |
| `rolldown-plugin-dts` 0.30.2 | peer `^5 \|\| ^6 \|\| ~7.0.0 \|\| ~7.1.0-0`, optional | tsdown | Not used: no `tsdown.config.ts` sets `dts`. Its classic generator throws on 7 (`dist/require-SnCWGmPf.mjs:39`). |
| `tsdown` 0.23.7 | peer `^5 \|\| ^6 \|\| ^7`, optional | api, library, mcp, webhooks | ok (built webhooks). |
| `@expo/require-utils` 58.0.6 | peer `^5 \|\| ^6 \|\| ^7`, optional | Expo, for `app.config.ts` | ok: no `transpileModule` in 7.0, so it falls back to Node's `stripTypeScriptTypes` with an experimental warning (`build/typescript.js`; [#47759](https://github.com/expo/expo/pull/47759)). 7.1 support [merged](https://github.com/expo/expo/pull/51076). |
| `2g` 1.0.1 | peer `>=5.8.0`, optional | `@expo/cli` | It imports the API in one chunk (`generateEventRegistryTypes`). `2g --help`, `expo config` and `expo export` ran; that command wasn't exercised **(unverified)**. |
| `i18next` 27.1.2, `react-i18next` 18.0.1 | peer `^5 \|\| ^6 \|\| ^7`, optional | `packages/i18n`, mobile | Types only; ok, typed keys included (`packages/i18n` typechecks its `@ts-expect-error` cases). |
| `abitype`, `ox`, `viem` | peers `>=5.0.4` / `>=5.4.0`, optional | `@clerk/clerk-js`'s wallet SDKs | Types only. |

### 3.3 The tools the issue named

"Swapped" means `node_modules/typescript` replaced by 7.0.2 in a throwaway copy.

| Tool | Loads the JS API? | Result |
| --- | --- | --- |
| Next 16.4.6, `next build` | No: runs the project's `tsc` CLI by default ([docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli); also `node_modules/next/dist/docs/…/useTypeScriptCli.md`). Neither app's `next.config.ts` opts out. | Swapped: web and site build, and `tsconfig.json` is left as it was. Error output is plain `tsc`, without Next's code frames. |
| Next's `{ "name": "next" }` plugin | Editor only (tsserver) | `tsc` 6 and 7 accept the entry and ignore it. Not served by the 7 language server (§2). |
| Expo SDK 58, Metro, `babel-preset-expo`, uniwind 1.12.2 | No (Babel) | Swapped: `expo config` and `expo export --platform ios` pass. |
| `jest` 30.5.2 / `jest-expo` | No (Babel) | Swapped: one screen test passes. The whole suite wasn't run. |
| `expo lint` (`apps/mobile`) | – | Not a useful check: the workspace has no ESLint config, so the command starts by generating one. CI runs ultracite instead. |
| eve 1.3.0 | No. `bin/eve.js:211` resolves `typescript/bin/tsc` only to build eve itself from source. | Swapped: `eve build`, and Arnold's 348 tests. `eve eval` wasn't run. |
| vitest 5.1.0 / vite 7.3.7, tsx 4.23.15 | No (tsx reads `typescript/package.json` for its version) | Swapped: every suite I ran passes except the three in §3.1. |
| knip 6.43.0 | No | Swapped: clean. |
| ultracite 8.1.1 / oxlint 1.93.0 | No: type-aware rules run in `oxlint-tsgolint`, which carries its own TypeScript 7 | Already on 7. |
| drizzle-kit 0.31.11 | No | Only `--version` was run swapped; `schema:generate` needs a stack. Its own step, `sort-generated-members`, breaks (§3.1). |
| Supabase type generation | No (Go CLI) | Not run **(unverified)**. |
| shadcn CLI | Not installed (`@shadcn/lint` is, and ran under ultracite) | – |
| MCP SDK 1.32.1, zod 4.6.7 | Types only | `apps/mcp` typechecks on 6.0.3 and 7.0.2. |

## 4. tsconfigs, editor, CI

### 4.1 Every tsconfig against the 6.0 / 7.0 lists

The lists: [6.0 deprecations and defaults](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/#breaking-changes-and-deprecations-in-typescript-60) and [7.0's hard errors](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#updates-since-5x-and-new-behaviors-from-60). This covers the three presets, the 19 workspace tsconfigs and `expo/tsconfig.base`. The two templates under `.agents/skills` aren't built.

| Option | Here | Change needed |
| --- | --- | --- |
| `types` (default now `[]`) | Set to `["node"]` in 12 workspaces; unset in mobile, web, site, api-client, core, library-bundle, library-sdk | **mobile: add `["node"]`.** web, site and library-bundle pass only because a dependency references Node's types (`next/dist/types.d.ts`; `undici/types/formdata.d.ts`). Make library-bundle explicit: it imports `node:crypto`, `node:fs` and others itself, and fails inside mobile's program today. |
| `baseUrl` (removed) | Not used; every `paths` entry is already `./`-relative (for example `apps/api/tsconfig.json:7`) | None |
| `moduleResolution` `node` / `classic` (removed) | `bundler` (`packages/typescript-config/base.json:15`, Expo's base) | None |
| `module` amd / umd / systemjs / none (removed) | `ESNext` (`base.json:14`), `esnext` (`nextjs.json:8`), `preserve` (Expo) | None |
| `target` `es5`, `downlevelIteration`, `outFile` (removed) | `ES2022` (`base.json:12`), `ESNext` (Expo) | None |
| `esModuleInterop: false` (removed) | `true` (`base.json:5`, Expo) | None; now redundant |
| `strict`, `module`, `target`, `lib` (new defaults) | All set explicitly | None |
| `rootDir` (default `.`) | `noEmit` everywhere (`base.json:16`, Expo) | None |
| `noUncheckedSideEffectImports` (default on), `libReplacement` (default off) | Not set | None: the CSS and side-effect imports pass |
| `stableTypeOrdering` (always on in 7) | Not set | None |
| `declaration`, `declarationMap` with `noEmit` (`library.json:5-6`) | Checked, never emitted | None |
| `allowImportingTsExtensions` (`packages/design-tokens`) | With `noEmit` | None |
| `incremental`, `plugins` (`nextjs.json:7`, `:9`) | – | None for `tsc` |
| `asserts` imports, `module Foo {}`, `no-default-lib` | None reported by 6 or 7 | None |
| File arguments to `tsc` with a tsconfig present (TS5112) | No script passes any | None |

So **nothing in `packages/typescript-config` has to change**. Putting `"types": ["node"]` in `base.json` would be wrong: `core`, `api-client` and `library-sdk` must stay free of Node types, since the app imports them.

**Found on the way:** oxlint's TypeScript 7 engine already applies the `[]` default, so type-aware lint sees mobile's `node:fs` and `Buffer` as unresolved today. `oxlint --type-aware --type-check` on two of those files prints the same TS2591 errors, and none once `types` is set. So the mobile line is worth landing even if nothing else here is.

### 4.2 Editors

| Editor | Today | With 6.0.3 | With 7 |
| --- | --- | --- | --- |
| Zed (`.zed/settings.json`) | `vtsls` | Same | [vtsls doesn't support TypeScript 7](https://github.com/zed-industries/zed/issues/60761); it falls back to its bundled TypeScript. To use 7: the [tsgo extension](https://github.com/zed-extensions/tsgo) and `typescript-ls` in `language_servers` with `!vtsls`. An open Zed bug: it [stops responding after a large git commit](https://github.com/zed-industries/zed/issues/62390). |
| VS Code (`.vscode/settings.json:14`, `js/ts.tsdk.path` = `node_modules/typescript/lib`) | Workspace tsserver | Same | The [TypeScript 7 extension](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript) takes the package directory (`./node_modules/typescript`), not `lib`. |

The workspace tsserver needs `typescript/lib/tsserver.js`. Plain `typescript@6.0.3` has it. The `@typescript/typescript6` wrapper doesn't (it sits in the nested `@typescript/old`), and neither does 7. Neither editor was opened for this note **(unverified)**.

### 4.3 CI, pnpm, Dependabot, knip

- CI's `checks` job runs `pnpm check`, `literal-check`, `text-check` and `typecheck` (`.github/workflows/unit-tests.yml:70-79`). In four recent runs the typecheck step took 32, 32, 32 and 46 s.
- Workspaces have no `.bin` of their own for `tsc`: with `nodeLinker: hoisted` (`pnpm-workspace.yaml:6`), every script gets the root's. One root dependency therefore moves all 19.
- Two versions can coexist, and already do: the lockfile has 5.9.3 and, under `eslint-plugin-github`, 6.0.3.
- `minimumReleaseAge` blocks nothing here: 6.0.3 and 7.0.2 are months old. Nightlies (`typescript@next`) would hit it. 7.0.2 has no build script, so `allowBuilds` needs no entry.
- Dependabot only covers Expo packages (`.github/dependabot.yml`), so TypeScript bumps stay manual.

Four layouts were tried with a real `pnpm install` in a copy:

|  | A. Official alias | **B. 6.0.3 + native (recommended)** | C. 5.9.3 + native | D. 7.0.2, `typescript6` in API users only |
| --- | --- | --- | --- | --- |
| `typescript` | `npm:@typescript/typescript6@6.0.2` | `6.0.3` | `5.9.3` | `7.0.2`; `typescript6` alias in `api-client` |
| Root `@typescript/native` | `npm:typescript@7.0.2` | same | same | – |
| `tsc` resolves to | 7.0.2 (`tsc6` is 6) | 7.0.2 | 7.0.2 | 7.0.2 |
| JS API | 6.0.3 | 6.0.3 | 5.9.3 | 7's unstable one; 6.0.3 nested for `openapi-typescript` |
| Workspace tsserver | no | **yes** | yes | no |
| `expo install --check` on TypeScript | not tried without the exclude | passes, so the exclude can go | fails (expects `~6.0.3`) | not tried |
| knip | clean | flags `@typescript/native` as unused: needs one ignore | not run | not run |
| `next build` checks with | 6 (`tsc6`) | 6 | 5.9.3 | 7 |
| Verified | full set (§7) | full set (§7) | install, `tsc`, `openapi-typescript` | install, `tsc`, `openapi-typescript` |

- **So yes: "native for `pnpm typecheck` only, 5.9 for the rest" works (C).** B costs the same and gets off a line that is 14 months old.
- **B's catch:** two packages offer `tsc`, and pnpm decides. Its rule is same package name → higher version wins ([`conflicts.rs`](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/cmd-shim/src/link_bins/conflicts.rs)), and it held across two forced reinstalls. It is implicit, so guard it: one check in `scripts/version-pins.mjs` that the root `.bin/tsc` reports `@typescript/native`'s version. A has no such clash, but loses the workspace tsserver. Next 16.4.6 does find `tsc6` (`node_modules/next/dist/lib/typescript/runTypeScriptCli.js`), though a [fix for the alias](https://github.com/vercel/next.js/pull/97334) is still open.
- **A and B both** add one new peer warning: `openapi-typescript` wants `^5.x`. `strictPeerDependencies` is off, so it only warns.

## 5. Prior decisions

- "For now we stay on 5.9 (dependency review, 2026-10-16)" is in FIT-155 itself. I found no other record: no ADR, nothing in `docs/reviews/` (only `fit-464`), and no commit message. The `expo.install.exclude` entry for `typescript` has no stated reason either.
- FIT-717 (Done 2026-11-16) put TypeScript 7 out of scope and named this issue.
- The nightly-audit comments disagree on 6.0's date. npm says 6.0.2 on 2026-03-23 (the first stable) and 6.0.3 on 2026-04-16. Their split `@types/node` is stale: the lockfile has only 26.6.6. "The bundlers still use the JS API" is wrong (§3.3).

## 6. Proposed migration

| Step | Change | Blocked by | Done when |
| --- | --- | --- | --- |
| 1 | `"types": ["node"]` in `apps/mobile/tsconfig.json` and `packages/library-bundle/tsconfig.json`, still on 5.9.3 | Nothing | 19 typechecks green on 5.9.3, `pnpm check` green. In a copy, `oxlint` (type-aware, the repo's config) over both workspaces stays clean, and both plus `apps/api` and `apps/mcp` typecheck on 5.9.3, 6.0.3 and 7.0.2 |
| 2 | `typescript` to exact `6.0.3` in all 20 manifests; drop it from `expo.install.exclude`; allow 6 for `openapi-typescript` through `peerDependencyRules.allowedVersions` | Step 1 | Full CI; `pnpm api-client generate` and `schema:generate` leave no diff; `expo install --check` doesn't name TypeScript |
| 3 | Root `@typescript/native: npm:typescript@7.0.2` (exact), a knip ignore with its reason, the `tsc` version guard, an AGENTS.md line | Step 2 | `tsc --version` is 7.0.2 in a workspace; CI typecheck time recorded before and after |
| 4 | Optional, per developer: Zed's tsgo extension or VS Code's TypeScript 7 extension | Nothing (the repo keeps tsserver) | – |
| 5 | Replace `openapi-typescript` | A maintained generator whose output we accept (the committed `schema.ts` is the diff to review) | `packages/api-client` has no `typescript` peer left |
| 6 | Port the two checks and `sort-generated-members` off the old API | 7.1 stable, or a decision to use another parser | Their tests pass with `typescript` 7 |
| 7 | `typescript` itself to 7.x; drop `@typescript/native` | Steps 5 and 6; Expo's expected version moving to 7 (or keeping the exclude); Zed's default server supporting 7, or accepting the extension; losing the Next editor plugin | One `typescript` in our manifests |

Layout D shortens step 7: our manifests can be on 7 while only the API users keep a `typescript6` alias. Only its install, `tsc` and `openapi-typescript` were verified.

Steps 1 to 3 are three small PRs. Step 3's value is the smallest of the three. If the implicit `tsc` isn't worth about 3 s locally, stop after step 2.

## 7. What was run

Machine: Apple M4 Pro, 12 cores, 48 GB, macOS 27.0.1, Node 26.13.1, pnpm 12.21.0, shared with other agents, so timings are approximate. **Nothing was run on Linux**, so CI and the 2-core box are estimates.

- **Scratch installs** of `typescript` 5.9.3, 6.0.3, 7.0.2, 7.1.0-beta and 7.1.0-dev.20261124.1 outside the repo, each run against every workspace. The first four ran against the checkout itself; the nightly ran only against the copy. `pnpm library generate` ran first and `expo-env.d.ts` was present; `next-env.d.ts` and `.next/types` weren't, as in CI's `checks` job.
- **CPU and memory**: `/usr/bin/time` around each compiler. **turbo**: `pnpm turbo run typecheck --force` in the copies, 5.9.3 against layout A.
- **Copies** (APFS clones of the checkout) with `node_modules/typescript` swapped, for §3. Layouts A to D were real `pnpm install --no-frozen-lockfile --ignore-scripts` runs.
- **The full set for A and B**: turbo typecheck (19 of 19), `literal-check`, `text-check`, `openapi-typescript` (output identical to 5.9.3's), knip, the db, i18n, design-tokens and arnold tests, and one `next build` (A: site; B: web). `expo install --check` ran on both, and reported Expo patches that aren't related. A also ran tsdown (webhooks), `eve build`, `expo config`, one Jest file and ultracite on two folders.
- **An artifact to ignore**: a copy addressed through macOS's `/var` symlink makes 7.1 report TS2883 in `packages/services`. Through `/private/var`, or in the checkout, it passes.
- **Not run**: the whole Jest suite, the integration suites, `eve eval`, `eve dev`, `next dev`, `pnpm ios`, an EAS or Vercel build, `schema:generate`, Supabase type generation, repo-wide `pnpm check`, either editor, and tsdown for api, library and mcp.

## 8. Open questions

1. Is a 7.0.2 typecheck worth a second compiler now (step 3), or is 6.0.3 alone enough until 7.1 ships?
2. Which generator replaces `openapi-typescript`? `openapi-fetch` (`packages/api-client/package.json:19`), a runtime dependency of the apps, is published from the same repository. Whether the end of updates covers it is **(unverified)**.
3. How much does the CI step drop on `ubuntu-24.04` runners, and does `--checkers 1` or `2` help on the 2-core box?
4. Should `next build` check with 7 as well? It can today (§3.3), but only with `typescript` itself on 7 (layout D).
