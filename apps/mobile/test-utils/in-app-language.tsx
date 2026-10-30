/**
 * Renders a screen under the root layout's language sync, so the App
 * language follows `setDeviceLanguages`, as it does in the app:
 *
 *   render(<InAppLanguage><SettingsScreen /></InAppLanguage>);
 *
 * The sync only changes the language while it's mounted: an English test
 * rendered without it afterwards needs `i18n.changeLanguage("en")` first.
 */
import type { ReactNode } from "react";
import { useAppLanguageSync } from "~/lib/i18n";

export function InAppLanguage({ children }: { children: ReactNode }) {
  useAppLanguageSync();
  return children;
}
