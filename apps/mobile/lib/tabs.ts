import { Platform } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { i18n } from "~/lib/i18n";

/** Each tab's route name and the catalog key of its tab bar title. */
export const TAB_TITLE_KEYS = {
  "(home)": "tabs.workout",
  arnold: "tabs.arnold",
  history: "tabs.history",
  library: "tabs.library",
} as const;

type TabRouteName = keyof typeof TAB_TITLE_KEYS;

interface TabSymbol {
  /** The symbol shown below `since`, where `symbol` would leave the tab without an icon. */
  fallback?: SFSymbol;
  /** The iOS major version that brought `symbol`, when the app supports older ones. */
  since?: number;
  /** Figma's symbol, the same for the tab's selected and unselected state. */
  symbol: SFSymbol;
}

/**
 * Each tab's symbol. `book.pages` came with iOS 17 and `sparkles.2` with
 * iOS 26, but the app supports iOS 16.4, so an older symbol stands in below
 * those.
 */
const TAB_SYMBOLS: Record<TabRouteName, TabSymbol> = {
  "(home)": { symbol: "dumbbell.fill" },
  arnold: { fallback: "sparkles", since: 26, symbol: "sparkles.2" },
  history: { fallback: "book.closed", since: 17, symbol: "book.pages" },
  library: { symbol: "book" },
};

const deviceIosMajor = () => Number.parseInt(String(Platform.Version), 10);

/** The tab's SF Symbol on this device's iOS (`iosMajor` for tests). */
export const getTabSymbol = (
  routeName: TabRouteName,
  iosMajor = deviceIosMajor()
): SFSymbol => {
  const { fallback, since, symbol } = TAB_SYMBOLS[routeName];
  return fallback && since && iosMajor < since ? fallback : symbol;
};

const isTabRouteName = (name: string): name is TabRouteName =>
  Object.hasOwn(TAB_TITLE_KEYS, name);

/**
 * The title of the focused tab, in the App language, so a screen pushed over
 * the tabs gets a back button that names the tab it goes back to (VoiceOver
 * reads it even when the button shows only the chevron). Before any tab was
 * focused it's the first one, Workout.
 */
export const getTabTitle = (routeName: string | undefined): string =>
  i18n.t(
    routeName && isTabRouteName(routeName)
      ? TAB_TITLE_KEYS[routeName]
      : TAB_TITLE_KEYS["(home)"]
  );
