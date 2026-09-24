import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  // Workspace packages are source-only, so inline them into the bundle. The
  // bundle is what Vercel deploys (see vercel.json), so it must not depend on
  // any workspace package at runtime.
  deps: { alwaysBundle: [/^@fitme\//] },
  entry: ["src/index.ts"],
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
});
