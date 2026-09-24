import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts"],
  fixedExtension: false,
  format: "esm",
  // Workspace packages are source-only, so inline them into the bundle.
  noExternal: [/^@fitme\//],
  outDir: "dist",
  platform: "node",
});
