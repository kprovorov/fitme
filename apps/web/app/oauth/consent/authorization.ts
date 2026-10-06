const AUTHORIZATION_ID = /^[\w-]+$/;

/** Authorization ids go into Supabase Auth URL paths, so only allow id chars. */
export const isAuthorizationId = (value: unknown): value is string =>
  typeof value === "string" && AUTHORIZATION_ID.test(value);

export function consentPath(authorizationId: string, error?: string) {
  const params = new URLSearchParams({ authorization_id: authorizationId });
  if (error) {
    params.set("error", error);
  }
  return `/oauth/consent?${params}`;
}
