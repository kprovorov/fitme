/**
 * `apps/api`'s base URL, read at request time. Server-only on purpose (no
 * `NEXT_PUBLIC_`): only Server Components call the Public API, and the
 * browser never needs the URL. Unset: the dashboard shows its error state.
 */
export const publicApiUrl = () => process.env.PUBLIC_API_URL ?? "";
