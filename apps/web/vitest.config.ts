import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next's tsconfig leaves JSX to the compiler (`jsx: preserve`), which Vite
  // won't do, so the test files that render a component need it set here.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "~": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
});
