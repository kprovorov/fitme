/**
 * The app's feature flags, each off by default. A build turns one on through
 * its `EXPO_PUBLIC_` variable (a local toggle, never in Infisical); a test
 * switches it with its setter, and `after-each.ts` puts every flag back.
 */

const plansRedesignFromEnv = () =>
  process.env.EXPO_PUBLIC_PLANS_REDESIGN === "true";

let plansRedesign = plansRedesignFromEnv();

/**
 * The Plans redesign (project "My Plans and Plan detail redesign"): the
 * rebuilt My Plans and Plan detail screens in place of today's. Removed by
 * the project's clean-up ticket.
 */
export const isPlansRedesignEnabled = (): boolean => plansRedesign;

/** Switches the Plans redesign on or off, for a test. */
export const setPlansRedesignEnabled = (enabled: boolean): void => {
  plansRedesign = enabled;
};

/** Puts every flag back to the build's own value. */
export const resetFeatureFlags = (): void => {
  plansRedesign = plansRedesignFromEnv();
};
