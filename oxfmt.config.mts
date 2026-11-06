import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  overrides: [
    {
      files: ["**/*.test.{ts,tsx}"],
      options: { sortTailwindcss: false },
    },
  ],
});
