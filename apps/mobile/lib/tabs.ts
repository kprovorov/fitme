import { i18n } from "~/lib/i18n";

/** Each tab's route name and the catalog key of its tab bar title. */
export const TAB_TITLE_KEYS = {
  "(home)": "tabs.home",
  arnold: "tabs.arnold",
  history: "tabs.history",
  library: "tabs.library",
  profile: "tabs.profile",
} as const;

type TabRouteName = keyof typeof TAB_TITLE_KEYS;

const isTabRouteName = (name: string): name is TabRouteName =>
  Object.hasOwn(TAB_TITLE_KEYS, name);

/**
 * The title of the focused tab, in the App language, so a screen pushed over
 * the tabs gets a back button that names the tab it goes back to (VoiceOver
 * reads it even when the button shows only the chevron). Before any tab was
 * focused it's the first one, Home.
 */
export const getTabTitle = (routeName: string | undefined): string =>
  i18n.t(
    routeName && isTabRouteName(routeName)
      ? TAB_TITLE_KEYS[routeName]
      : TAB_TITLE_KEYS["(home)"]
  );
