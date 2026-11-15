import { Platform } from "react-native";

import { googleClientIds } from "~/lib/google-client-ids";
import type { GoogleClientIds } from "~/lib/google-client-ids";

export type SocialProvider = "apple" | "google";

/** Each provider's brand name, the same in every App language. */
export const PROVIDER_NAMES: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
};

const GOOGLE_CLIENT_ID = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/iu;
const GOOGLE_CLIENT_SUFFIX = /\.apps\.googleusercontent\.com$/u;

const googleReady = (ids: GoogleClientIds): boolean => {
  if (!GOOGLE_CLIENT_ID.test(ids.webClientId)) {
    return false;
  }

  if (Platform.OS === "android") {
    return true;
  }

  return (
    Platform.OS === "ios" &&
    GOOGLE_CLIENT_ID.test(ids.iosClientId) &&
    ids.iosUrlScheme ===
      `com.googleusercontent.apps.${ids.iosClientId.replace(GOOGLE_CLIENT_SUFFIX, "")}`
  );
};

// Once per platform and set of ids, not on every render of a sign-in screen.
const warned = new Set<string>();

const warnGoogleMissing = (ids: GoogleClientIds) => {
  const key = JSON.stringify([Platform.OS, ids]);

  if (warned.has(key)) {
    return;
  }

  warned.add(key);
  console.warn(
    "Google sign-in is hidden: this build lacks valid EXPO_PUBLIC_CLERK_GOOGLE_* client ids (docs/agents/mobile-auth.md)."
  );
};

/**
 * The sign-in providers this build offers (ADR 0021), the one rule for Welcome,
 * login, registration and Account & Security: Apple on iOS always and never on Android;
 * Google whenever the build carries its client ids, hidden with a warning
 * otherwise. Clerk's instance settings are never consulted.
 */
export const signInProviders = (): SocialProvider[] => {
  const providers: SocialProvider[] = [];

  if (Platform.OS === "ios") {
    providers.push("apple");
  }

  const ids = googleClientIds();

  if (googleReady(ids)) {
    providers.push("google");
  } else {
    warnGoogleMissing(ids);
  }

  return providers;
};
