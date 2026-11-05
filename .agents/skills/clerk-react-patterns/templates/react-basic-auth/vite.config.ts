import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import { defineConfig } from "vite";

const isPluginFactory = (value: unknown): value is () => PluginOption =>
  typeof value === "function";

if (!isPluginFactory(react)) {
  throw new TypeError("@vitejs/plugin-react must export a plugin factory");
}

export default defineConfig({
  plugins: [react()],
});
