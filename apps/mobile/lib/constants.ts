const TRAILING_SLASH = /\/$/;

export const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export const NAV_THEME = {
  dark: {
    background: "hsl(240 10% 3.9%)", // background
    border: "hsl(240 3.7% 15.9%)", // border
    card: "hsl(240 10% 3.9%)", // card
    notification: "hsl(0 72% 51%)", // destructive
    primary: "hsl(0 0% 98%)", // primary
    text: "hsl(0 0% 98%)", // foreground
  },
  light: {
    background: "hsl(0 0% 100%)", // background
    border: "hsl(240 5.9% 90%)", // border
    card: "hsl(0 0% 100%)", // card
    notification: "hsl(0 84.2% 60.2%)", // destructive
    primary: "hsl(240 5.9% 10%)", // primary
    text: "hsl(240 10% 3.9%)", // foreground
  },
};

// iOS 27 resolves the `automatic` scroll edge effect to the hard style
// (dimmed band + dividing line); pin it to the progressive blur we had on 26.
export const SCROLL_EDGE_EFFECTS = { bottom: "soft", top: "soft" } as const;

// Mirrors the minimum password length set on both Clerk instances, so the
// register form can reject a short password before calling Clerk.
export const PASSWORD_MIN_LENGTH = 15;

/**
 * Base URL of `apps/api` (`EXPO_PUBLIC_API_URL`), without a trailing slash;
 * empty when unset. Read on each call so tests can set it.
 */
export const getApiUrl = () =>
  (process.env.EXPO_PUBLIC_API_URL ?? "").replace(TRAILING_SLASH, "");
