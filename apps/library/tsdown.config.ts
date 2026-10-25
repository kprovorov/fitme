import { sentryRollupPlugin } from "@sentry/node/rollup";
import { defineConfig, type UserConfig } from "tsdown";

const shared: UserConfig = {
  deps: {
    // Workspace packages are source-only, so inline them into the bundle.
    alwaysBundle: [/^@fitme\//],
    // No package from node_modules may be inlined (workspace packages resolve
    // to source, so they don't count): a dependency of one must be declared in
    // package.json too, so it stays external and Vercel traces it instead.
    onlyBundle: [],
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
};

const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

// Source maps for the deployed bundle, uploaded to the Sentry project
// (SENTRY_ORG / SENTRY_PROJECT) for the release: the commit, as
// @fitme/observability reports it. Without SENTRY_AUTH_TOKEN (local, CI) the
// build skips the upload, keeps the maps and still passes. A failed upload
// (Sentry down, a wrong project) is logged, never blocks a deployment.
const sentry = sentryRollupPlugin({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  errorHandler: (error) => {
    console.warn("Sentry source map upload failed", error);
  },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  sourcemaps: uploadSourceMaps
    ? { filesToDeleteAfterUpload: ["dist/**/*.map"] }
    : { disable: "disable-upload" },
  telemetry: false,
});

// Two separate builds so neither entry shares a chunk with the other. Each
// still splits off the modules src/app.ts imports dynamically; Vercel's Hono
// preset only picks dist/app.js if it imports "hono" directly.
export default defineConfig([
  // Vercel entrypoint: default-exports the Hono app.
  {
    ...shared,
    clean: true,
    entry: ["src/app.ts"],
    outDir: "dist",
    plugins: [sentry],
    sourcemap: true,
  },
  // Standalone Node server (`pnpm start`), in a subdirectory so Vercel doesn't
  // see a second entrypoint (dist/index.js) next to dist/app.js.
  { ...shared, clean: false, entry: ["src/index.ts"], outDir: "dist/node" },
]);
