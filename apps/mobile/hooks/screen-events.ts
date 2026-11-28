/**
 * Screen events (FIT-878): the root layout records a screen event through the
 * analytics wrapper each time the focused route changes. PostHog's own screen
 * tracking needs a navigation package the app doesn't have (expo-router ships
 * its own copy), so the app records screens itself.
 */
import { usePathname, useRootNavigationState, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { analytics } from "~/lib/analytics";

/**
 * A route's screen name: its template as expo-router's segments give it,
 * route groups and brackets kept (`/(tabs)/history`, `/plans/[planId]`), so
 * one screen is one name and no id or param is ever in it.
 */
export const screenNameOf = (segments: readonly string[]): string =>
  `/${segments.join("/")}`;

/**
 * Records the focused route once per navigation: opening a screen and coming
 * back to it each record it, a re-render records nothing. The concrete path
 * only says when the focus moved (two Plans are two navigations); it's never
 * sent. Nothing is recorded before the navigation state is known.
 */
export const useScreenEvents = (): void => {
  const segments = useSegments();
  const pathname = usePathname();
  const ready = useRootNavigationState()?.key !== undefined;
  const name = screenNameOf(segments);
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || recorded.current === pathname) {
      return;
    }

    recorded.current = pathname;
    void analytics.screen(name);
  }, [name, pathname, ready]);
};
