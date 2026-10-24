/** Each tab's route name and the title its tab bar item shows. */
export const TAB_TITLES = {
  "(home)": "Home",
  arnold: "Arnold",
  history: "History",
  library: "Library",
  profile: "Profile",
} as const;

type TabRouteName = keyof typeof TAB_TITLES;

const isTabRouteName = (name: string): name is TabRouteName =>
  Object.hasOwn(TAB_TITLES, name);

/**
 * The title of the focused tab, so a screen pushed over the tabs gets a back
 * button that names the tab it goes back to (VoiceOver reads it even when the
 * button shows only the chevron). Before any tab was focused it's the first
 * one, Home.
 */
export const getTabTitle = (routeName: string | undefined): string =>
  routeName && isTabRouteName(routeName)
    ? TAB_TITLES[routeName]
    : TAB_TITLES["(home)"];
