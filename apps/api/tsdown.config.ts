import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  // Workspace packages are source-only, so inline them into the bundle.
  deps: { alwaysBundle: [/^@fitme\//] },
  entry: ["src/index.ts"],
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
});
