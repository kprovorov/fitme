/**
 * Renders screens on the real expo-router, for a test of what a screen does
 * to the stack (which screens close, what shows underneath). `routes` are
 * route files by path without `.tsx` (`"(tabs)/index"`, `_layout`), and
 * `path` where the app opens.
 *
 * expo-router's own `renderRouter` (`expo-router/testing-library`) isn't
 * used: it turns on fake timers, which `settle` can't wait under, and its
 * types replace `expect`'s matchers in every test file.
 */
import { render } from "@testing-library/react-native";
import { ExpoRoot } from "expo-router";
import { inMemoryContext } from "expo-router/build/testing-library/context-stubs";

export const renderRouter = async (
  routes: Parameters<typeof inMemoryContext>[0],
  path: string
) => {
  // Every route is mounted at once, not behind a lazy import.
  process.env.EXPO_ROUTER_IMPORT_MODE = "sync";
  await render(<ExpoRoot context={inMemoryContext(routes)} location={path} />);
};
