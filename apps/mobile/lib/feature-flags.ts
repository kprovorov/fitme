/**
 * The app's feature flags, each off by default. A build turns one on through
 * its `EXPO_PUBLIC_` variable (a local toggle, never in Infisical); a test
 * switches it with its setter, and `after-each.ts` puts every flag back.
 */

const profileRedesignFromEnv = () =>
  process.env.EXPO_PUBLIC_PROFILE_REDESIGN === "true";

let profileRedesign = profileRedesignFromEnv();

/**
 * The Profile redesign (project "Profile redesign"): the rebuilt Profile
 * screen in place of today's. Removed by the project's clean-up ticket.
 */
export const isProfileRedesignEnabled = (): boolean => profileRedesign;

/** Switches the Profile redesign on or off, for a test. */
export const setProfileRedesignEnabled = (enabled: boolean): void => {
  profileRedesign = enabled;
};

/** Puts every flag back to the build's own value. */
export const resetFeatureFlags = (): void => {
  profileRedesign = profileRedesignFromEnv();
};
