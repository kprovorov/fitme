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

// Two separate builds so neither entry is split into a shared chunk: Vercel's
// Hono preset only picks dist/app.js if it imports "hono" directly.
export default defineConfig([
  // Vercel entrypoint: default-exports the Hono app.
  { ...shared, clean: true, entry: ["src/app.ts"], outDir: "dist" },
  // Standalone Node server (`pnpm start`), in a subdirectory so Vercel doesn't
  // see a second entrypoint (dist/index.js) next to dist/app.js.
  { ...shared, clean: false, entry: ["src/index.ts"], outDir: "dist/node" },
]);
