const AUTHORIZATION_ID = /^[\w-]+$/;

/** Authorization ids go into Supabase Auth URL paths, so only allow id chars. */
export const isAuthorizationId = (value: unknown): value is string =>
  typeof value === "string" && AUTHORIZATION_ID.test(value);

/**
 * Errors the consent page can show. Only these codes travel in the URL, so a
 * crafted link can't put its own text next to the Allow button.
 */
export const CONSENT_ERRORS = {
  decision_failed:
    "Your decision could not be saved. The request may have expired; connect again from the app.",
} as const;

export type ConsentError = keyof typeof CONSENT_ERRORS;

export const consentErrorMessage = (code: string | undefined) =>
  code && Object.hasOwn(CONSENT_ERRORS, code)
    ? CONSENT_ERRORS[code as ConsentError]
    : null;

export function consentPath(authorizationId: string, error?: ConsentError) {
  const params = new URLSearchParams({ authorization_id: authorizationId });
  if (error) {
    params.set("error", error);
  }
  return `/oauth/consent?${params}`;
}
