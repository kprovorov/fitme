import { defineConfig, type UserConfig } from "tsdown";

const shared: UserConfig = {
  deps: {
    // Workspace packages are source-only, so inline them into the bundle.
    alwaysBundle: [/^@fitme\//],
    // Anything else inlined fails the build: declare it in package.json so it
    // stays external and Vercel traces it into the function instead.
    onlyBundle: [/^@fitme\//],
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
};

// Two separate builds so neither entry is split into a shared chunk: Vercel's
// Hono preset only picks dist/app.js if it imports "hono" directly.
export default defineConfig([
  // Vercel entrypoint: default-exports the Hono app.
  { ...shared, clean: true, entry: ["src/app.ts"], outDir: "dist" },
  // Standalone Node server (`pnpm start`), in a subdirectory so Vercel doesn't
  // see a second entrypoint (dist/index.js) next to dist/app.js.
  { ...shared, clean: false, entry: ["src/index.ts"], outDir: "dist/node" },
]);
