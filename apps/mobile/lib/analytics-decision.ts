/**
 * Whether the app sends product analytics at all: only with a key, outside a
 * development build and outside an E2E build, so test taps never count as
 * Users. Kept apart from `~/lib/analytics`, with no import of its own, so the
 * shared Jest setup can switch it without loading the analytics SDK.
 */

export interface AnalyticsBuild {
  /** Whether the analytics key is set for this build. */
  hasKey: boolean;
  /** A development build (`__DEV__`), which Jest always is. */
  isDevelopment: boolean;
  /** An E2E build (`EXPO_PUBLIC_E2E_ENABLED`). */
  isE2E: boolean;
}

export const shouldSendAnalytics = ({
  hasKey,
  isDevelopment,
  isE2E,
}: AnalyticsBuild): boolean => hasKey && !isDevelopment && !isE2E;

let override: boolean | null = null;

/**
 * Tests only: `true` sends whatever the build is (every build counts as a
 * development build under Jest), `false` sends nothing, `null` goes back to
 * `shouldSendAnalytics`. The shared Jest setup turns it on.
 */
export const overrideAnalyticsDecision = (sends: boolean | null): void => {
  override = sends;
};

/** The override, or `null` when the build decides. */
export const analyticsDecisionOverride = (): boolean | null => override;
