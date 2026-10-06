import { defineConfig, type UserConfig } from "tsdown";

const shared: UserConfig = {
  // Workspace packages are source-only, so inline them into the bundle.
  deps: { alwaysBundle: [/^@fitme\//] },
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
};

// Two separate builds so neither entry is split into a shared chunk: Vercel's
// Hono preset only picks dist/app.js if it imports "hono" directly.
export default defineConfig([
  // Vercel entrypoint: default-exports the Hono app.
  { ...shared, clean: true, entry: ["src/app.ts"] },
  // Standalone Node server (`pnpm start`).
  { ...shared, clean: false, entry: ["src/index.ts"] },
]);
